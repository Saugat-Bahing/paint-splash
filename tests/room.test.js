import test from "node:test";
import assert from "node:assert/strict";
import { COUNTDOWN_DURATION, TEAM, TEAM_VALUE } from "../src/config.js";
import { tileIndexAt } from "../src/shared/physics.js";
import { Room } from "../server/Room.js";

class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.messages = [];
  }
  send(message) { this.messages.push(JSON.parse(message)); }
}

function populatedRoom() {
  const room = new Room("TEST", () => {});
  const sockets = [];
  for (let index = 0; index < 5; index += 1) {
    const socket = new FakeSocket();
    sockets.push(socket);
    room.addPlayer(socket, `Player ${index + 1}`);
  }
  return { room, sockets, ids: [...room.players.keys()] };
}

test("five players can explicitly form uneven 2v3 teams and start", () => {
  const { room, ids } = populatedRoom();
  assert.equal(room.teamCount("red"), 3);
  assert.equal(room.teamCount("blue"), 2);
  room.handle(ids[2], { type: "team", team: "blue" });
  assert.equal(room.teamCount("red"), 2);
  assert.equal(room.teamCount("blue"), 3);
  assert.equal(room.canStart(), true);
  room.handle(ids[0], { type: "start" });
  assert.equal(room.phase, "countdown");
  assert.equal(room.players.size, 5);
});

test("rooms accept six players, allow 1v5, and reject a seventh", () => {
  const room = new Room("SIX6", () => {});
  for (let index = 0; index < 6; index += 1) room.addPlayer(new FakeSocket(), `Player ${index + 1}`);
  const ids = [...room.players.keys()];
  for (const id of ids.slice(1)) room.handle(id, { type: "team", team: "blue" });
  assert.equal(room.teamCount("red"), 1);
  assert.equal(room.teamCount("blue"), 5);
  assert.equal(room.canStart(), true);
  assert.throws(() => room.addPlayer(new FakeSocket(), "Player 7"), /full/);
});

test("a non-host cannot start the match", () => {
  const { room, ids } = populatedRoom();
  room.handle(ids[1], { type: "start" });
  assert.equal(room.phase, "lobby");
});

test("movement paints authoritative turf and updates the score", () => {
  const { room, ids } = populatedRoom();
  room.handle(ids[0], { type: "start" });
  for (let tick = 0; tick < Math.ceil(COUNTDOWN_DURATION * 60) + 1; tick += 1) room.update();
  assert.equal(room.phase, "playing");
  const player = room.players.get(ids[0]);
  const before = room.scores.red;
  room.handle(ids[0], { type: "input", seq: 1, input: { moveX: 1 } });
  room.simulate();
  assert.ok(player.x > 45);
  assert.equal(room.tiles[tileIndexAt(player.x, player.y)], TEAM_VALUE.red);
  assert.ok(room.scores.red > before);
});

test("paint bursts emit events, recolor turf, and knock back only opponents", () => {
  const { room, ids } = populatedRoom();
  room.handle(ids[0], { type: "start" });
  room.phase = "playing";
  const attacker = room.players.get(ids[0]);
  const opponent = room.players.get(ids[1]);
  const teammate = room.players.get(ids[2]);
  attacker.x = 190;
  attacker.y = 90;
  opponent.x = 210;
  opponent.y = 90;
  teammate.x = 200;
  teammate.y = 90;
  room.handle(ids[0], { type: "input", seq: 1, input: { burst: true } });
  room.simulate();
  assert.ok(room.pendingEvents.some((event) => event.type === "burst" && event.ownerId === ids[0]));
  assert.ok(opponent.knockX > 0);
  assert.equal(teammate.knockX, 0);
  assert.equal(room.tiles[tileIndexAt(190, 90)], TEAM.RED);
});
