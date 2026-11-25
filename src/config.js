export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
export const GRID_WIDTH = 32;
export const GRID_HEIGHT = 18;
export const TILE_SIZE = 15;
export const TILE_COUNT = GRID_WIDTH * GRID_HEIGHT;

export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_TIME = 0.1;
export const SNAPSHOT_INTERVAL = 3;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const MATCH_DURATION = 180;
export const COUNTDOWN_DURATION = 3;
export const OVERTIME_DURATION = 30;

export const WORLD_BORDER = 5;
export const PLAYER_RADIUS = 6;
export const PLAYER_SPEED = 78;
export const OWN_TURF_SPEED = 1.12;
export const DASH_SPEED = 190;
export const DASH_DURATION = 0.16;
export const DASH_COOLDOWN = 2;
export const BURST_COOLDOWN = 1.35;
export const BURST_PAINT_RADIUS = 31;
export const BURST_KNOCKBACK_RADIUS = 42;

export const TEAM = Object.freeze({ NEUTRAL: 0, RED: 1, BLUE: 2 });
export const TEAM_VALUE = Object.freeze({ red: TEAM.RED, blue: TEAM.BLUE });

// Rectangles are mirrored so neither spawn side has a terrain advantage.
export const OBSTACLES = Object.freeze([
  { x: 135, y: 45, width: 30, height: 30 },
  { x: 315, y: 45, width: 30, height: 30 },
  { x: 135, y: 195, width: 30, height: 30 },
  { x: 315, y: 195, width: 30, height: 30 },
  { x: 90, y: 120, width: 30, height: 30 },
  { x: 360, y: 120, width: 30, height: 30 },
  { x: 225, y: 105, width: 30, height: 60 },
]);
