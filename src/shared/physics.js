import {
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRID_HEIGHT,
  GRID_WIDTH,
  BURST_COOLDOWN,
  OBSTACLES,
  OWN_TURF_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  TEAM_VALUE,
  TILE_SIZE,
  WORLD_BORDER,
} from "../config.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function sanitizeInput(input = {}) {
  return {
    moveX: clamp(Number(input.moveX) || 0, -1, 1),
    moveY: clamp(Number(input.moveY) || 0, -1, 1),
    aimX: clamp(Number(input.aimX) || 0, -1, 1),
    aimY: clamp(Number(input.aimY) || 0, -1, 1),
    burst: input.burst === true,
    dash: input.dash === true,
  };
}

export function createPlayerState(id, name, team, x, y) {
  return {
    id,
    name,
    team,
    x,
    y,
    vx: 0,
    vy: 0,
    knockX: 0,
    knockY: 0,
    aimX: team === "red" ? 1 : -1,
    aimY: 0,
    dashX: 0,
    dashY: 0,
    dashTime: 0,
    dashCooldown: 0,
    burstCooldown: 0,
  };
}

export function tileIndexAt(x, y) {
  const tileX = clamp(Math.floor(x / TILE_SIZE), 0, GRID_WIDTH - 1);
  const tileY = clamp(Math.floor(y / TILE_SIZE), 0, GRID_HEIGHT - 1);
  return tileY * GRID_WIDTH + tileX;
}

export function paintTile(tiles, index, teamValue, onChange) {
  const previous = tiles[index];
  if (previous === teamValue) return false;

  tiles[index] = teamValue;
  onChange?.(index, previous, teamValue);
  return true;
}

export function paintCircle(tiles, x, y, teamValue, radius, onChange) {
  const minX = clamp(Math.floor((x - radius) / TILE_SIZE), 0, GRID_WIDTH - 1);
  const maxX = clamp(Math.floor((x + radius) / TILE_SIZE), 0, GRID_WIDTH - 1);
  const minY = clamp(Math.floor((y - radius) / TILE_SIZE), 0, GRID_HEIGHT - 1);
  const maxY = clamp(Math.floor((y + radius) / TILE_SIZE), 0, GRID_HEIGHT - 1);

  for (let tileY = minY; tileY <= maxY; tileY += 1) {
    for (let tileX = minX; tileX <= maxX; tileX += 1) {
      const centerX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const centerY = tileY * TILE_SIZE + TILE_SIZE / 2;
      if (Math.hypot(centerX - x, centerY - y) > radius) continue;
      paintTile(tiles, tileY * GRID_WIDTH + tileX, teamValue, onChange);
    }
  }
}

function resolveCircleRectangle(player, rectangle) {
  const closestX = clamp(player.x, rectangle.x, rectangle.x + rectangle.width);
  const closestY = clamp(player.y, rectangle.y, rectangle.y + rectangle.height);
  let dx = player.x - closestX;
  let dy = player.y - closestY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= PLAYER_RADIUS * PLAYER_RADIUS) return;

  if (distanceSquared > 0.000001) {
    const distance = Math.sqrt(distanceSquared);
    const overlap = PLAYER_RADIUS - distance;
    player.x += (dx / distance) * overlap;
    player.y += (dy / distance) * overlap;
    return;
  }

  // The center is inside the rectangle: exit through the nearest expanded side.
  const sides = [
    { distance: Math.abs(player.x - (rectangle.x - PLAYER_RADIUS)), axis: "x", value: rectangle.x - PLAYER_RADIUS },
    { distance: Math.abs(player.x - (rectangle.x + rectangle.width + PLAYER_RADIUS)), axis: "x", value: rectangle.x + rectangle.width + PLAYER_RADIUS },
    { distance: Math.abs(player.y - (rectangle.y - PLAYER_RADIUS)), axis: "y", value: rectangle.y - PLAYER_RADIUS },
    { distance: Math.abs(player.y - (rectangle.y + rectangle.height + PLAYER_RADIUS)), axis: "y", value: rectangle.y + rectangle.height + PLAYER_RADIUS },
  ];
  sides.sort((a, b) => a.distance - b.distance);
  player[sides[0].axis] = sides[0].value;
}

export function resolveWorldCollision(player) {
  player.x = clamp(player.x, WORLD_BORDER + PLAYER_RADIUS, GAME_WIDTH - WORLD_BORDER - PLAYER_RADIUS);
  player.y = clamp(player.y, WORLD_BORDER + PLAYER_RADIUS, GAME_HEIGHT - WORLD_BORDER - PLAYER_RADIUS);

  // A few passes make corners and contacts with multiple blocks stable.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const obstacle of OBSTACLES) resolveCircleRectangle(player, obstacle);
  }

  player.x = clamp(player.x, WORLD_BORDER + PLAYER_RADIUS, GAME_WIDTH - WORLD_BORDER - PLAYER_RADIUS);
  player.y = clamp(player.y, WORLD_BORDER + PLAYER_RADIUS, GAME_HEIGHT - WORLD_BORDER - PLAYER_RADIUS);
}

export function resolvePlayerCollisions(players) {
  const minimumDistance = PLAYER_RADIUS * 2;

  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      const a = players[first];
      const b = players[second];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);

      if (distance >= minimumDistance) continue;
      if (distance < 0.0001) {
        dx = 1;
        dy = 0;
        distance = 1;
      }

      const push = (minimumDistance - distance) / 2;
      const normalX = dx / distance;
      const normalY = dy / distance;
      a.x -= normalX * push;
      a.y -= normalY * push;
      b.x += normalX * push;
      b.y += normalY * push;
      resolveWorldCollision(a);
      resolveWorldCollision(b);
    }
  }
}

/** Shared by the authoritative server and local client prediction. */
export function stepPlayer(player, rawInput, dt, tiles) {
  const input = sanitizeInput(rawInput);
  const events = [];
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.burstCooldown = Math.max(0, player.burstCooldown - dt);

  let moveX = input.moveX;
  let moveY = input.moveY;
  const moveLength = Math.hypot(moveX, moveY);
  if (moveLength > 1) {
    moveX /= moveLength;
    moveY /= moveLength;
  }

  const aimLength = Math.hypot(input.aimX, input.aimY);
  if (aimLength > 0.05) {
    player.aimX = input.aimX / aimLength;
    player.aimY = input.aimY / aimLength;
  }

  if (input.dash && player.dashCooldown <= 0) {
    const dashLength = Math.hypot(moveX, moveY);
    player.dashX = dashLength > 0.1 ? moveX / dashLength : player.aimX;
    player.dashY = dashLength > 0.1 ? moveY / dashLength : player.aimY;
    player.dashTime = DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
    events.push({ type: "dash", ownerId: player.id, x: player.x, y: player.y, team: player.team });
  }

  if (input.burst && player.burstCooldown <= 0) {
    player.burstCooldown = BURST_COOLDOWN;
    events.push({ type: "burst", ownerId: player.id, x: player.x, y: player.y, team: player.team });
  }

  if (player.dashTime > 0) {
    player.dashTime = Math.max(0, player.dashTime - dt);
    player.vx = player.dashX * DASH_SPEED;
    player.vy = player.dashY * DASH_SPEED;
  } else {
    const ownTurf = tiles[tileIndexAt(player.x, player.y)] === TEAM_VALUE[player.team];
    const speed = PLAYER_SPEED * (ownTurf ? OWN_TURF_SPEED : 1);
    const responsiveness = moveLength > 0.01 ? 25 : 32;
    const blend = 1 - Math.exp(-responsiveness * dt);
    player.vx += (moveX * speed - player.vx) * blend;
    player.vy += (moveY * speed - player.vy) * blend;
  }

  player.x += (player.vx + player.knockX) * dt;
  player.y += (player.vy + player.knockY) * dt;
  const knockbackDrag = Math.exp(-10 * dt);
  player.knockX *= knockbackDrag;
  player.knockY *= knockbackDrag;
  resolveWorldCollision(player);

  return events;
}
