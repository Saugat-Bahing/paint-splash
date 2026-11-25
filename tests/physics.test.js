import test from "node:test";
import assert from "node:assert/strict";
import { GRID_HEIGHT, GRID_WIDTH, OBSTACLES, PLAYER_RADIUS, TEAM, TILE_COUNT } from "../src/config.js";
import {
  createPlayerState,
  paintCircle,
  resolvePlayerCollisions,
  stepPlayer,
  tileIndexAt,
} from "../src/shared/physics.js";

const neutralTiles = () => new Uint8Array(TILE_COUNT);
const idle = { moveX: 0, moveY: 0, aimX: 1, aimY: 0 };

test("diagonal movement is normalized to cardinal movement distance", () => {
  const cardinal = createPlayerState("a", "A", "red", 30, 30);
  const diagonal = createPlayerState("b", "B", "blue", 30, 30);
  for (let tick = 0; tick < 60; tick += 1) {
    stepPlayer(cardinal, { ...idle, moveX: 1 }, 1 / 60, neutralTiles());
    stepPlayer(diagonal, { ...idle, moveX: 1, moveY: 1 }, 1 / 60, neutralTiles());
  }
  const cardinalDistance = Math.hypot(cardinal.x - 30, cardinal.y - 30);
  const diagonalDistance = Math.hypot(diagonal.x - 30, diagonal.y - 30);
  assert.ok(Math.abs(cardinalDistance - diagonalDistance) < 0.00001);
});

test("world bounds contain the whole player circle", () => {
  const player = createPlayerState("a", "A", "red", 20, 135);
  for (let tick = 0; tick < 120; tick += 1) {
    stepPlayer(player, { ...idle, moveX: -1 }, 1 / 60, neutralTiles());
  }
  assert.ok(player.x >= 5 + PLAYER_RADIUS);
  assert.ok(player.vx < 0, "velocity remains responsive while position stays constrained");
});

test("solid obstacles block movement and allow sliding along their edges", () => {
  const obstacle = OBSTACLES[0];
  const player = createPlayerState("a", "A", "red", obstacle.x - 15, obstacle.y + 15);
  for (let tick = 0; tick < 8; tick += 1) {
    stepPlayer(player, { ...idle, moveX: 1, moveY: 0.35 }, 1 / 60, neutralTiles());
  }
  assert.ok(player.x <= obstacle.x - PLAYER_RADIUS + 0.001);
  assert.ok(player.y > obstacle.y + 15, "vertical input still produces tangential movement");
});

test("overlapping players are separated without leaving the arena", () => {
  const a = createPlayerState("a", "A", "red", 100, 100);
  const b = createPlayerState("b", "B", "blue", 103, 100);
  resolvePlayerCollisions([a, b]);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= PLAYER_RADIUS * 2 - 0.001);
});

test("paint circles update tile ownership exactly once", () => {
  const tiles = neutralTiles();
  const changes = [];
  const x = 8 * 15 + 7.5;
  const y = 8 * 15 + 7.5;
  paintCircle(tiles, x, y, TEAM.RED, 24, (index, previous, next) => changes.push([index, previous, next]));
  const changedCount = changes.length;
  assert.ok(changedCount > 5);
  assert.equal(tiles[tileIndexAt(x, y)], TEAM.RED);
  paintCircle(tiles, x, y, TEAM.RED, 24, (index, previous, next) => changes.push([index, previous, next]));
  assert.equal(changes.length, changedCount, "repainting identical turf is free");
});

test("dash has a duration and cooldown instead of repeating every input", () => {
  const tiles = neutralTiles();
  const player = createPlayerState("a", "A", "red", 45, 135);
  const first = stepPlayer(player, { ...idle, dash: true }, 1 / 60, tiles);
  const second = stepPlayer(player, { ...idle, dash: true }, 1 / 60, tiles);
  assert.equal(first.filter((event) => event.type === "dash").length, 1);
  assert.equal(second.filter((event) => event.type === "dash").length, 0);
  assert.ok(player.dashCooldown > 1.9);
  assert.ok(player.dashTime > 0);
});
