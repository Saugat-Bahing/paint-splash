# Turf Tussle

A real-time, team-based territory game for **2–6 online players**. Paint the arena by moving, disrupt opponents with paint bursts, and control the most turf when the three-minute timer expires.

Uneven teams are intentional: play **1v1, 2v3, 1v5**, or any other red/blue split with at least one player per side.

## Run locally

Requires Node.js 20.19+ (or 22.12+).

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Create a room and share its four-character code with other players. Friends on the same network can join using `http://<your-lan-ip>:5173`.

The development command starts both the Vite client and the WebSocket game server—no separate server process is needed.

## Controls

| Action | Controls |
| --- | --- |
| Move and paint | WASD or arrow keys |
| Aim | Mouse |
| Paint burst | Left click or Space |
| Turbo dash | Right click or Shift |

- Walking over a tile paints it your team's color.
- Moving on your own turf gives a small speed boost.
- Paint bursts recolor a wider area and knock back opponents, never teammates.
- Dashes are fast, paint a wider trail, and have a two-second cooldown.
- The largest territory at zero wins. A tie triggers 30-second sudden-death overtime.

## Production

```sh
npm run build
npm start
```

Set `PORT` to change the default port:

```sh
PORT=8080 npm start
```

The production Node server serves `dist/` and handles WebSocket connections at `/ws`. When deploying, use a host that supports persistent WebSockets and forward both HTTP and WebSocket traffic to the same process.

## Tests

```sh
npm test
npm run build
```

The test suite covers movement normalization, world and obstacle collision, edge sliding, player separation, paint ownership, dash cooldowns, uneven teams, host permissions, authoritative scoring, and burst knockback.

## Architecture

```text
server/
  index.js                 HTTP, Vite middleware/static hosting, WebSockets
  Room.js                  Authoritative rooms, teams, scoring, match state
src/
  config.js                Shared arena and gameplay constants
  main.js                  Client bootstrap and server message routing
  core/
    GameLoop.js            Fixed 60 Hz simulation loop
    Input.js               Keyboard, mouse aim, and action edges
  game/
    Game.js                Prediction, reconciliation, interpolation, effects
    Player.js              Animated WebGL player rendering
  net/
    Network.js             WebSocket connection and messages
  render/
    Renderer.js            WebGL2 textures, camera, sprites, rectangles
    shaders.js             GPU vertex and fragment shaders
    sprite.js              Pixel-string texture helper
  shared/
    physics.js             Shared server/client movement and collision
  ui/
    UI.js                  Menu, lobby, HUD, cooldowns, and results
  style.css                Responsive modern interface
tests/
  physics.test.js          Deterministic movement/collision tests
  room.test.js             Multiplayer room and gameplay tests
```

### Networking and smoothness

- The server runs the authoritative simulation at **60 Hz** and broadcasts snapshots at **20 Hz**.
- Local movement uses client prediction and reconciliation against acknowledged inputs.
- Remote players are rendered with **100 ms snapshot interpolation** to hide network jitter.
- Movement acceleration, normalized diagonals, dash motion, paint bursts, particles, and short camera impulses keep action responsive.
- Static collision uses circle-vs-rectangle resolution with multiple contact passes; player-vs-player overlap is resolved separately.
- Turf is stored server-side as a compact tile array and uploaded to a dynamic GPU texture only when changed.

Rooms are intentionally lightweight: there are no accounts, chat, public matchmaking, or late joins after a match begins.
