import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GRID_HEIGHT,
  GRID_WIDTH,
  OBSTACLES,
  TEAM,
  TILE_SIZE,
} from "../config.js";
import { stepPlayer } from "../shared/physics.js";
import { createPlayerSprites, drawPlayer } from "./Player.js";

const TEAM_COLORS = {
  red: [1, 0.36, 0.45, 1],
  blue: [0.29, 0.66, 1, 1],
};
const TURF_PALETTES = [
  [[24, 36, 43], [27, 40, 47]],
  [[128, 46, 61], [137, 50, 65]],
  [[34, 86, 128], [38, 94, 138]],
];
const lerp = (a, b, amount) => a + (b - a) * amount;

export class Game {
  constructor(renderer, input, network) {
    this.renderer = renderer;
    this.input = input;
    this.network = network;
    this.sprites = createPlayerSprites(renderer);
    this.active = false;
    this.localId = null;
    this.local = null;
    this.phase = "lobby";
    this.winner = null;
    this.timeLeft = 0;
    this.countdown = 0;
    this.scores = { red: 0, blue: 0, neutral: GRID_WIDTH * GRID_HEIGHT };
    this.players = [];
    this.history = [];
    this.pendingInputs = [];
    this.sequence = 0;
    this.localOffset = { x: 0, y: 0 };
    this.tiles = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    this.turfPixels = new Uint8Array(this.tiles.length * 4);
    this.paintAnimations = new Map();
    this.particles = [];
    this.rings = [];
    this.processedEvents = new Set();
    this.lastPredicted = { burst: 0, dash: 0 };
    this.shake = 0;

    for (let index = 0; index < this.tiles.length; index += 1) this.updateTurfPixel(index);
    this.turfTexture = renderer.createTexture(GRID_WIDTH, GRID_HEIGHT, this.turfPixels);
  }

  start(message, localId) {
    this.active = true;
    this.localId = localId;
    this.local = null;
    this.sequence = 0;
    this.pendingInputs = [];
    this.history = [];
    this.localOffset = { x: 0, y: 0 };
    this.paintAnimations.clear();
    this.particles = [];
    this.rings = [];
    this.processedEvents.clear();
    this.setTiles(message.tiles);
    this.applySnapshot(message.snapshot);
    this.input.setEnabled(true);
  }

  stop() {
    this.active = false;
    this.input.setEnabled(false);
  }

  setTiles(tiles) {
    this.tiles.set(tiles);
    for (let index = 0; index < this.tiles.length; index += 1) this.updateTurfPixel(index);
    this.renderer.updateTexture(this.turfTexture, GRID_WIDTH, GRID_HEIGHT, this.turfPixels);
  }

  updateTurfPixel(index) {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    const palette = TURF_PALETTES[this.tiles[index]] ?? TURF_PALETTES[0];
    const color = palette[(x + y) % 2];
    const textureDetail = (x * 7 + y * 11) % 9 === 0 ? 4 : 0;
    const offset = index * 4;
    this.turfPixels[offset] = color[0] + textureDetail;
    this.turfPixels[offset + 1] = color[1] + textureDetail;
    this.turfPixels[offset + 2] = color[2] + textureDetail;
    this.turfPixels[offset + 3] = 255;
  }

  applySnapshot(snapshot) {
    if (!this.active) return;
    const now = performance.now();
    this.phase = snapshot.phase;
    this.winner = snapshot.winner;
    this.timeLeft = snapshot.timeLeft;
    this.countdown = snapshot.countdown;
    this.scores = snapshot.scores;
    this.players = snapshot.players;
    this.history.push({ time: now, players: snapshot.players });
    if (this.history.length > 30) this.history.shift();

    if (snapshot.paints?.length) {
      for (const [index, team] of snapshot.paints) {
        this.tiles[index] = team;
        this.updateTurfPixel(index);
        this.paintAnimations.set(index, now);
      }
      this.renderer.updateTexture(this.turfTexture, GRID_WIDTH, GRID_HEIGHT, this.turfPixels);
    }

    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (authoritative) {
      const oldX = this.local?.x ?? authoritative.x;
      const oldY = this.local?.y ?? authoritative.y;
      this.pendingInputs = this.pendingInputs.filter((input) => input.seq > authoritative.ack);
      const predicted = { ...authoritative };
      for (const pending of this.pendingInputs) {
        stepPlayer(predicted, pending.input, pending.dt, this.tiles);
      }

      if (this.local) {
        this.localOffset.x = Math.max(-20, Math.min(20, this.localOffset.x + oldX - predicted.x));
        this.localOffset.y = Math.max(-20, Math.min(20, this.localOffset.y + oldY - predicted.y));
      }
      this.local = predicted;
    } else {
      this.local = null;
    }

    for (const event of snapshot.events ?? []) {
      if (this.processedEvents.has(event.id)) continue;
      this.processedEvents.add(event.id);
      this.spawnEffect(event, false);
    }
    if (this.processedEvents.size > 250) {
      this.processedEvents = new Set([...this.processedEvents].slice(-120));
    }

    if (this.phase === "ended") this.input.setEnabled(false);
  }

  update(dt) {
    if (!this.active) return;

    this.localOffset.x *= Math.exp(-18 * dt);
    this.localOffset.y *= Math.exp(-18 * dt);
    this.shake = Math.max(0, this.shake - dt * 12);
    this.updateEffects(dt);

    if ((this.phase !== "playing" && this.phase !== "overtime") || !this.local) return;

    const input = this.input.snapshot(this.local);
    this.sequence += 1;
    this.pendingInputs.push({ seq: this.sequence, input, dt });
    if (this.pendingInputs.length > 120) this.pendingInputs.shift();
    this.network.send({ type: "input", seq: this.sequence, input });

    const events = stepPlayer(this.local, input, dt, this.tiles);
    for (const event of events) this.spawnEffect(event, true);
  }

  updateEffects(dt) {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.exp(-4 * dt);
      particle.vx *= drag;
      particle.vy *= drag;
    }
    for (let index = this.rings.length - 1; index >= 0; index -= 1) {
      this.rings[index].life -= dt;
      if (this.rings[index].life <= 0) this.rings.splice(index, 1);
    }
  }

  spawnEffect(event, predicted) {
    const now = performance.now();
    if (!predicted && event.ownerId === this.localId && now - (this.lastPredicted[event.type] ?? 0) < 180) return;
    if (predicted) this.lastPredicted[event.type] = now;

    const burst = event.type === "burst";
    const count = burst ? 24 : 9;
    const speed = burst ? 72 : 36;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random() * 0.75);
      const life = 0.25 + Math.random() * (burst ? 0.45 : 0.2);
      this.particles.push({
        x: event.x,
        y: event.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        maxLife: life,
        size: burst && index % 4 === 0 ? 3 : 2,
        team: event.team,
      });
    }
    this.rings.push({
      x: event.x,
      y: event.y,
      team: event.team,
      life: burst ? 0.42 : 0.24,
      maxLife: burst ? 0.42 : 0.24,
      radius: burst ? 38 : 18,
    });

    if (burst && this.local && Math.hypot(this.local.x - event.x, this.local.y - event.y) < 75) {
      this.shake = Math.max(this.shake, 2.2);
    }
  }

  renderRemote(id) {
    const latest = this.history[this.history.length - 1];
    const targetTime = performance.now() - 100;
    if (this.history.length < 2) return latest?.players.find((player) => player.id === id);

    for (let index = 0; index < this.history.length - 1; index += 1) {
      const older = this.history[index];
      const newer = this.history[index + 1];
      if (older.time > targetTime || newer.time < targetTime) continue;
      const a = older.players.find((player) => player.id === id);
      const b = newer.players.find((player) => player.id === id);
      if (!a || !b) return b ?? a;
      const amount = Math.max(0, Math.min(1, (targetTime - older.time) / (newer.time - older.time)));
      return {
        ...b,
        x: lerp(a.x, b.x, amount),
        y: lerp(a.y, b.y, amount),
        vx: lerp(a.vx, b.vx, amount),
        vy: lerp(a.vy, b.vy, amount),
        aimX: lerp(a.aimX, b.aimX, amount),
        aimY: lerp(a.aimY, b.aimY, amount),
      };
    }
    return latest?.players.find((player) => player.id === id);
  }

  renderPlayers() {
    const players = [];
    for (const player of this.players) {
      if (player.id === this.localId && this.local) {
        players.push({
          ...this.local,
          x: this.local.x + this.localOffset.x,
          y: this.local.y + this.localOffset.y,
        });
      } else {
        const remote = this.renderRemote(player.id);
        if (remote) players.push(remote);
      }
    }
    return players.sort((a, b) => a.y - b.y);
  }

  render() {
    if (!this.active) return;
    const renderer = this.renderer;
    const now = performance.now();
    const time = now / 1000;
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;

    renderer.begin([0.025, 0.04, 0.055, 1]);
    renderer.setCamera(shakeX, shakeY);
    renderer.draw(this.turfTexture, 0, 0, GAME_WIDTH, GAME_HEIGHT);

    const gridColor = [0.6, 0.75, 0.82, 0.045];
    for (let x = TILE_SIZE; x < GAME_WIDTH; x += TILE_SIZE) renderer.drawRect(x, 0, 1, GAME_HEIGHT, gridColor);
    for (let y = TILE_SIZE; y < GAME_HEIGHT; y += TILE_SIZE) renderer.drawRect(0, y, GAME_WIDTH, 1, gridColor);

    for (const [index, startedAt] of this.paintAnimations) {
      const progress = (now - startedAt) / 280;
      if (progress >= 1) {
        this.paintAnimations.delete(index);
        continue;
      }
      const x = index % GRID_WIDTH * TILE_SIZE;
      const y = Math.floor(index / GRID_WIDTH) * TILE_SIZE;
      const inset = Math.floor(progress * 6);
      const color = [...(this.tiles[index] === TEAM.RED ? TEAM_COLORS.red : TEAM_COLORS.blue)];
      color[3] = (1 - progress) * 0.35;
      renderer.drawRect(x + inset, y + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2, color);
    }

    for (const obstacle of OBSTACLES) {
      renderer.drawRect(obstacle.x + 3, obstacle.y + 4, obstacle.width, obstacle.height, [0, 0, 0, 0.35]);
      renderer.drawRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, [0.12, 0.17, 0.2, 1]);
      renderer.drawRect(obstacle.x + 2, obstacle.y + 2, obstacle.width - 4, obstacle.height - 6, [0.2, 0.27, 0.3, 1]);
      renderer.drawRect(obstacle.x + 3, obstacle.y + 3, obstacle.width - 6, 2, [0.32, 0.4, 0.42, 1]);
      renderer.drawRect(obstacle.x + 4, obstacle.y + obstacle.height - 5, obstacle.width - 8, 2, [0.07, 0.1, 0.13, 1]);
    }

    const border = [0.06, 0.09, 0.12, 1];
    renderer.drawRect(0, 0, GAME_WIDTH, 5, border);
    renderer.drawRect(0, GAME_HEIGHT - 5, GAME_WIDTH, 5, border);
    renderer.drawRect(0, 5, 5, GAME_HEIGHT - 10, border);
    renderer.drawRect(GAME_WIDTH - 5, 5, 5, GAME_HEIGHT - 10, border);
    renderer.drawRect(5, 5, GAME_WIDTH - 10, 1, [0.35, 0.47, 0.5, 0.35]);

    for (const ring of this.rings) {
      const progress = 1 - ring.life / ring.maxLife;
      const radius = 3 + ring.radius * progress;
      const color = [...TEAM_COLORS[ring.team]];
      color[3] = (1 - progress) * 0.8;
      renderer.drawRect(ring.x - radius, ring.y - radius, radius * 2, 2, color);
      renderer.drawRect(ring.x - radius, ring.y + radius, radius * 2, 2, color);
      renderer.drawRect(ring.x - radius, ring.y - radius, 2, radius * 2, color);
      renderer.drawRect(ring.x + radius, ring.y - radius, 2, radius * 2, color);
    }

    for (const player of this.renderPlayers()) drawPlayer(renderer, this.sprites, player, time, this.localId);

    for (const particle of this.particles) {
      const color = [...TEAM_COLORS[particle.team]];
      color[3] = Math.max(0, particle.life / particle.maxLife);
      renderer.drawRect(particle.x, particle.y, particle.size, particle.size, color);
    }
    renderer.setCamera(0, 0);
  }
}
