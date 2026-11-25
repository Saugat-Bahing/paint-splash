import "./style.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./config.js";
import { GameLoop } from "./core/GameLoop.js";
import { Input } from "./core/Input.js";
import { Game } from "./game/Game.js";
import { Network } from "./net/Network.js";
import { Renderer } from "./render/Renderer.js";
import { UI } from "./ui/UI.js";

const canvas = document.querySelector("#game");
const screen = document.querySelector("#screen");
let localId = null;
let roomCode = null;
let game;

const network = new Network({
  onMessage: handleMessage,
  onOpen: () => ui.setConnected(true),
  onClose: () => ui.showDisconnected(Boolean(game?.active)),
});

const ui = new UI({
  create: async (name) => {
    rememberName(name);
    try {
      await network.connect();
      network.send({ type: "create", name });
    } catch (error) {
      ui.toast(error.message);
    }
  },
  join: async (name, code) => {
    rememberName(name);
    if (code.trim().length !== 4) {
      ui.toast("Enter the four-character room code.");
      return;
    }
    try {
      await network.connect();
      network.send({ type: "join", name, roomCode: code });
    } catch (error) {
      ui.toast(error.message);
    }
  },
  team: (team) => network.send({ type: "team", team }),
  start: () => network.send({ type: "start" }),
});

function rememberName(name) {
  try { localStorage.setItem("turf-name", name.trim()); } catch { /* Storage can be disabled. */ }
}

try {
  document.querySelector("#player-name").value = localStorage.getItem("turf-name") || "";
} catch { /* Storage can be disabled. */ }

function handleMessage(message) {
  if (message.type === "joined") {
    localId = message.playerId;
    roomCode = message.roomCode;
    return;
  }
  if (message.type === "room") {
    ui.updateRoom(message, localId);
    if (message.phase === "lobby") {
      game?.stop();
      ui.showLobby(message, localId);
    }
    return;
  }
  if (message.type === "matchStart") {
    ui.showGame(roomCode);
    if (!game) {
      document.querySelector("#webgl-error").hidden = false;
      return;
    }
    game.start(message, localId);
    requestAnimationFrame(fitCanvas);
    return;
  }
  if (message.type === "snapshot") {
    game?.applySnapshot(message);
    return;
  }
  if (message.type === "error") ui.toast(message.message);
}

const input = new Input(canvas);
try {
  const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
  game = new Game(renderer, input, network);
} catch (error) {
  console.error("Unable to initialize WebGL2:", error);
  ui.toast("WebGL2 is required to enter the arena.");
}

function fitCanvas() {
  const availableWidth = screen.clientWidth;
  const availableHeight = screen.clientHeight;
  if (!availableWidth || !availableHeight) return;
  const fit = Math.min(availableWidth / GAME_WIDTH, availableHeight / GAME_HEIGHT);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  canvas.style.width = `${Math.max(1, Math.floor(GAME_WIDTH * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(GAME_HEIGHT * scale))}px`;
}

const resizeObserver = new ResizeObserver(fitCanvas);
resizeObserver.observe(screen);
const loop = new GameLoop(
  (dt) => game?.update(dt),
  () => {
    if (!game?.active) return;
    game.render();
    ui.updateHud(game);
    if (game.phase === "ended") ui.showResult(game);
  },
);
loop.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    loop.stop();
    resizeObserver.disconnect();
    network.socket?.close();
  });
}
