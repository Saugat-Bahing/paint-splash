import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";

const GAME_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight",
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.down = new Set();
    this.pressed = new Set();
    this.pointer = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, active: false };

    this.onKeyDown = (event) => {
      if (!this.enabled || !GAME_KEYS.has(event.code)) return;
      event.preventDefault();
      if (!this.down.has(event.code)) this.pressed.add(event.code);
      this.down.add(event.code);
    };
    this.onKeyUp = (event) => {
      if (this.enabled && GAME_KEYS.has(event.code)) event.preventDefault();
      this.down.delete(event.code);
    };
    this.onPointerMove = (event) => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      this.pointer.x = (event.clientX - bounds.left) / bounds.width * GAME_WIDTH;
      this.pointer.y = (event.clientY - bounds.top) / bounds.height * GAME_HEIGHT;
      this.pointer.active = true;
    };
    this.onPointerDown = (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      canvas.focus();
      this.onPointerMove(event);
      this.pressed.add(`Mouse${event.button}`);
    };
    this.onContextMenu = (event) => {
      if (this.enabled) event.preventDefault();
    };
    this.clear = () => {
      this.down.clear();
      this.pressed.clear();
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  isDown(...codes) {
    return codes.some((code) => this.down.has(code));
  }

  consume(code) {
    const wasPressed = this.pressed.has(code);
    this.pressed.delete(code);
    return wasPressed;
  }

  snapshot(player) {
    let aimX = 0;
    let aimY = 0;
    if (this.pointer.active) {
      aimX = this.pointer.x - player.x;
      aimY = this.pointer.y - player.y;
      const length = Math.hypot(aimX, aimY);
      if (length > 0.001) {
        aimX /= length;
        aimY /= length;
      }
    }

    return {
      moveX: Number(this.isDown("ArrowRight", "KeyD")) - Number(this.isDown("ArrowLeft", "KeyA")),
      moveY: Number(this.isDown("ArrowDown", "KeyS")) - Number(this.isDown("ArrowUp", "KeyW")),
      aimX,
      aimY,
      burst: this.consume("Space") || this.consume("Mouse0"),
      dash: this.consume("ShiftLeft") || this.consume("ShiftRight") || this.consume("Mouse2"),
    };
  }
}
