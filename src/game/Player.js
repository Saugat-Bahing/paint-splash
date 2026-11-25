import { spriteFromRows } from "../render/sprite.js";

const PLAYER_ROWS = [
  "............",
  "....kkkk....",
  "...kwwwwk...",
  "..kwwwwwwk..",
  "..kwkwwkwk..",
  "..kwwwwwwk..",
  "...kwwwwk...",
  "...kbbbbk...",
  "..kbbbbbbk..",
  "..bkbbbbkb..",
  "..bkbbbbkb..",
  "...bbbbbb...",
  "...bbbbbb...",
  "...bb..bb...",
  "..bbb..bbb..",
  "..kkk..kkk..",
];

export function createPlayerSprites(renderer) {
  return {
    red: spriteFromRows(renderer, PLAYER_ROWS, { k: "#17232d", w: "#f4d6b3", b: "#ff7185" }),
    blue: spriteFromRows(renderer, PLAYER_ROWS, { k: "#17232d", w: "#f4d6b3", b: "#58b1ff" }),
  };
}

export function drawPlayer(renderer, sprites, player, time, localId) {
  const speed = Math.hypot(player.vx, player.vy);
  const phase = Number.parseInt(player.id.replace(/\D/g, "").slice(-3), 10) || 0;
  const bob = speed > 8 ? Math.sin(time * 12 + phase) * 0.8 : Math.sin(time * 3 + phase) * 0.3;
  const dashing = player.dashTime > 0;
  const sprite = sprites[player.team];
  const teamColor = player.team === "red" ? [1, 0.36, 0.45, 1] : [0.29, 0.66, 1, 1];

  renderer.drawRect(player.x - 5, player.y + 6, 10, 3, [0, 0, 0, 0.32]);

  if (player.id === localId) {
    const color = [0.72, 0.95, 0.42, 0.8];
    renderer.drawRect(player.x - 9, player.y - 10, 3, 1, color);
    renderer.drawRect(player.x - 9, player.y - 10, 1, 3, color);
    renderer.drawRect(player.x + 6, player.y - 10, 3, 1, color);
    renderer.drawRect(player.x + 8, player.y - 10, 1, 3, color);
  }

  const aimX = player.x + player.aimX * 11;
  const aimY = player.y + player.aimY * 11;
  renderer.drawRect(aimX - 2, aimY - 2, 4, 4, [0, 0, 0, 0.3]);
  renderer.drawRect(aimX - 1, aimY - 1, 3, 3, teamColor);

  const width = dashing ? 14 : 12;
  const height = dashing ? 14 : 16;
  renderer.draw(sprite.texture, player.x - width / 2, player.y - 8 + bob, width, height);
}
