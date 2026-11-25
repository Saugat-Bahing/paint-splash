import { FIXED_STEP, MAX_FRAME_TIME } from "../config.js";

/** Fixed-timestep simulation with a requestAnimationFrame render loop. */
export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.accumulator = 0;
    this.previousTime = 0;
    this.frameId = 0;

    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.accumulator = 0;
    this.previousTime = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  frame(now) {
    if (!this.running) return;

    const elapsed = Math.min((now - this.previousTime) / 1000, MAX_FRAME_TIME);
    this.previousTime = now;
    this.accumulator += elapsed;

    while (this.accumulator >= FIXED_STEP) {
      this.update(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }

    this.render(this.accumulator / FIXED_STEP);
    this.frameId = requestAnimationFrame(this.frame);
  }
}
