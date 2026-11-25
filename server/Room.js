import { randomUUID } from "node:crypto";
import {
  BURST_KNOCKBACK_RADIUS,
  BURST_PAINT_RADIUS,
  COUNTDOWN_DURATION,
  FIXED_STEP,
  GRID_HEIGHT,
  GRID_WIDTH,
  MATCH_DURATION,
  MAX_PLAYERS,
  MIN_PLAYERS,
  OVERTIME_DURATION,
  SNAPSHOT_INTERVAL,
  TEAM,
  TEAM_VALUE,
  TILE_COUNT,
} from "../src/config.js";
import {
  createPlayerState,
  paintCircle,
  paintTile,
  resolvePlayerCollisions,
  sanitizeInput,
  stepPlayer,
  tileIndexAt,
} from "../src/shared/physics.js";

const spawnHeights = [135, 75, 195, 45, 225, 105];
const activePhases = new Set(["playing", "overtime"]);
const send = (socket, message) => {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
};

function initialTiles() {
  const tiles = new Uint8Array(TILE_COUNT);
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (x < 3) tiles[y * GRID_WIDTH + x] = TEAM.RED;
      if (x >= GRID_WIDTH - 3) tiles[y * GRID_WIDTH + x] = TEAM.BLUE;
    }
  }
  return tiles;
}

function scoreTiles(tiles) {
  const scores = { red: 0, blue: 0, neutral: 0 };
  for (const tile of tiles) {
    if (tile === TEAM.RED) scores.red += 1;
    else if (tile === TEAM.BLUE) scores.blue += 1;
    else scores.neutral += 1;
  }
  return scores;
}

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.hostId = null;
    this.phase = "lobby";
    this.timeLeft = MATCH_DURATION;
    this.countdown = COUNTDOWN_DURATION;
    this.winner = null;
    this.tiles = initialTiles();
    this.scores = scoreTiles(this.tiles);
    this.dirtyTiles = new Set();
    this.pendingEvents = [];
    this.eventId = 0;
    this.tick = 0;
  }

  addPlayer(socket, name) {
    if (this.players.size >= MAX_PLAYERS) throw new Error("That room is full.");
    if (this.phase !== "lobby") throw new Error("That match has already started.");

    const id = randomUUID();
    const redCount = this.teamCount("red");
    const blueCount = this.teamCount("blue");
    const team = redCount <= blueCount ? "red" : "blue";
    const player = createPlayerState(id, name, team, 0, 0);
    player.socket = socket;
    player.queue = [];
    player.lastInput = sanitizeInput();
    player.lastReceivedSeq = 0;
    player.ack = 0;

    this.players.set(id, player);
    socket.room = this;
    socket.playerId = id;
    if (!this.hostId) this.hostId = id;
    this.positionPlayers();

    send(socket, { type: "joined", playerId: id, roomCode: this.code });
    this.broadcastRoom();
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    if (this.players.size === 0) {
      this.onEmpty(this.code);
      return;
    }

    if (this.phase !== "lobby" && !this.canStart()) {
      this.phase = "lobby";
      this.winner = null;
      this.pendingEvents = [];
      this.broadcastRoom("Match ended because there are not enough players.");
    } else {
      this.positionPlayers();
      this.broadcastRoom();
    }
  }

  positionPlayers() {
    const teamIndexes = { red: 0, blue: 0 };
    for (const player of this.players.values()) {
      const index = teamIndexes[player.team]++;
      player.x = player.team === "red" ? 45 : 435;
      player.y = spawnHeights[index] ?? 135;
      player.vx = 0;
      player.vy = 0;
      player.knockX = 0;
      player.knockY = 0;
    }
  }

  teamCount(team) {
    return [...this.players.values()].filter((player) => player.team === team).length;
  }

  canStart() {
    return (
      this.players.size >= MIN_PLAYERS &&
      this.players.size <= MAX_PLAYERS &&
      this.teamCount("red") > 0 &&
      this.teamCount("blue") > 0
    );
  }

  handle(playerId, message) {
    const player = this.players.get(playerId);
    if (!player) return;

    if (message.type === "team" && this.phase === "lobby") {
      if (message.team !== "red" && message.team !== "blue") return;
      player.team = message.team;
      this.positionPlayers();
      this.broadcastRoom();
      return;
    }

    if (message.type === "start" && playerId === this.hostId) {
      if (!this.canStart()) {
        send(player.socket, { type: "error", message: "You need at least one player on each team." });
        return;
      }
      if (this.phase !== "lobby" && this.phase !== "ended") return;
      this.startMatch();
      return;
    }

    if (message.type === "input" && activePhases.has(this.phase)) {
      const sequence = Number(message.seq);
      if (!Number.isSafeInteger(sequence) || sequence <= player.lastReceivedSeq) return;
      player.lastReceivedSeq = sequence;
      player.queue.push({ seq: sequence, input: sanitizeInput(message.input) });
      if (player.queue.length > 12) player.queue.shift();
    }
  }

  startMatch() {
    this.tiles = initialTiles();
    this.scores = scoreTiles(this.tiles);
    this.dirtyTiles.clear();
    this.pendingEvents = [];
    this.timeLeft = MATCH_DURATION;
    this.countdown = COUNTDOWN_DURATION;
    this.winner = null;
    this.phase = "countdown";
    this.tick = 0;
    this.positionPlayers();

    for (const player of this.players.values()) {
      player.queue = [];
      player.lastInput = sanitizeInput();
      player.lastReceivedSeq = 0;
      player.ack = 0;
      player.aimX = player.team === "red" ? 1 : -1;
      player.aimY = 0;
      player.dashTime = 0;
      player.dashCooldown = 0;
      player.burstCooldown = 0;
    }

    this.broadcast({
      type: "matchStart",
      tiles: Array.from(this.tiles),
      snapshot: this.snapshot(),
    });
    this.broadcastRoom();
  }

  onPaint(index, previous, next) {
    if (previous === TEAM.RED) this.scores.red -= 1;
    if (previous === TEAM.BLUE) this.scores.blue -= 1;
    if (next === TEAM.RED) this.scores.red += 1;
    if (next === TEAM.BLUE) this.scores.blue += 1;
    if (previous !== TEAM.NEUTRAL && next === TEAM.NEUTRAL) this.scores.neutral += 1;
    if (previous === TEAM.NEUTRAL && next !== TEAM.NEUTRAL) this.scores.neutral -= 1;
    this.dirtyTiles.add(index);
  }

  simulate() {
    const players = [...this.players.values()];
    const newEvents = [];

    for (const player of players) {
      const queued = player.queue.shift();
      let input = player.lastInput;
      if (queued) {
        input = queued.input;
        player.lastInput = input;
        player.ack = queued.seq;
      } else {
        input = { ...input, burst: false, dash: false };
      }

      const events = stepPlayer(player, input, FIXED_STEP, this.tiles);
      for (const event of events) {
        event.id = ++this.eventId;
        newEvents.push(event);
      }
    }

    for (const event of newEvents) {
      if (event.type !== "burst") continue;
      const teamValue = TEAM_VALUE[event.team];
      paintCircle(
        this.tiles,
        event.x,
        event.y,
        teamValue,
        BURST_PAINT_RADIUS,
        (index, previous, next) => this.onPaint(index, previous, next),
      );

      for (const player of players) {
        if (player.id === event.ownerId || player.team === event.team) continue;
        const dx = player.x - event.x;
        const dy = player.y - event.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= BURST_KNOCKBACK_RADIUS) continue;
        const normalX = distance > 0.001 ? dx / distance : 1;
        const normalY = distance > 0.001 ? dy / distance : 0;
        const strength = 175 * (1 - distance / BURST_KNOCKBACK_RADIUS) + 55;
        player.knockX = normalX * strength;
        player.knockY = normalY * strength;
      }
    }

    this.pendingEvents.push(...newEvents);
    resolvePlayerCollisions(players);

    for (const player of players) {
      const teamValue = TEAM_VALUE[player.team];
      const onPaint = (index, previous, next) => this.onPaint(index, previous, next);
      paintTile(this.tiles, tileIndexAt(player.x, player.y), teamValue, onPaint);
      paintCircle(this.tiles, player.x, player.y, teamValue, player.dashTime > 0 ? 12 : 7, onPaint);
    }

    this.timeLeft = Math.max(0, this.timeLeft - FIXED_STEP);
    if (this.phase === "overtime") {
      if (this.scores.red !== this.scores.blue) {
        this.finish(this.scores.red > this.scores.blue ? "red" : "blue");
      } else if (this.timeLeft <= 0) {
        this.finish("draw");
      }
    } else if (this.timeLeft <= 0) {
      if (this.scores.red === this.scores.blue) {
        this.phase = "overtime";
        this.timeLeft = OVERTIME_DURATION;
      } else {
        this.finish(this.scores.red > this.scores.blue ? "red" : "blue");
      }
    }
  }

  finish(winner) {
    this.phase = "ended";
    this.winner = winner;
    for (const player of this.players.values()) {
      player.queue = [];
      player.vx = 0;
      player.vy = 0;
    }
  }

  update() {
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - FIXED_STEP);
      if (this.countdown <= 0) this.phase = "playing";
    } else if (activePhases.has(this.phase)) {
      this.simulate();
    } else if (this.phase !== "ended") {
      return;
    }

    this.tick += 1;
    if (this.tick % SNAPSHOT_INTERVAL !== 0) return;

    const message = this.snapshot();
    message.paints = [...this.dirtyTiles].map((index) => [index, this.tiles[index]]);
    message.events = this.pendingEvents;
    this.broadcast(message);
    this.dirtyTiles.clear();
    this.pendingEvents = [];
  }

  publicPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      team: player.team,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      knockX: player.knockX,
      knockY: player.knockY,
      dashX: player.dashX,
      dashY: player.dashY,
      aimX: player.aimX,
      aimY: player.aimY,
      dashTime: player.dashTime,
      dashCooldown: player.dashCooldown,
      burstCooldown: player.burstCooldown,
      ack: player.ack,
    };
  }

  snapshot() {
    return {
      type: "snapshot",
      phase: this.phase,
      timeLeft: this.timeLeft,
      countdown: this.countdown,
      winner: this.winner,
      scores: { ...this.scores },
      players: [...this.players.values()].map((player) => this.publicPlayer(player)),
    };
  }

  roomState(notice = "") {
    return {
      type: "room",
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      notice,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team,
      })),
    };
  }

  broadcastRoom(notice = "") {
    this.broadcast(this.roomState(notice));
  }

  broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.socket.readyState === 1) player.socket.send(serialized);
    }
  }
}
