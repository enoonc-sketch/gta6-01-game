// input.js — keyboard and mouse state, with edge detection (pressed this
// frame) so menus and one-shot actions never double-fire.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false, rightDown: false };
    this.anyKeyPressed = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressedKeys.add(e.code);
        this.anyKeyPressed = true;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
      if (e.button === 2) this.mouse.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down. */
  pressed(code) {
    return this.pressedKeys.has(code);
  }

  /** WASD / arrows as a -1..1 movement vector. */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    return { x, y };
  }

  /** Clear the per-frame edge flags. Call once per frame, after update. */
  endFrame() {
    this.pressedKeys.clear();
    this.mouse.clicked = false;
    this.anyKeyPressed = false;
  }
}
