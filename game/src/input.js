// Keyboard and mouse state. main.js polls this every frame; one-shot presses are
// consumed with takePress() so a key held down does not retrigger menus.

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, pressed: false, rightDown: false };

  const onKeyDown = (e) => {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
    if (!down.has(code)) pressed.add(code);
    down.add(code);
  };
  const onKeyUp = (e) => down.delete(e.code);
  const onBlur = () => { down.clear(); mouse.down = false; mouse.rightDown = false; };
  const onMouseMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  };
  const onMouseDown = (e) => {
    onMouseMove(e);
    if (e.button === 0) { mouse.down = true; mouse.pressed = true; }
    if (e.button === 2) mouse.rightDown = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  };
  const onContext = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContext);

  return {
    mouse,
    isDown: (...codes) => codes.some((c) => down.has(c)),
    takePress: (...codes) => {
      for (const c of codes) {
        if (pressed.has(c)) { pressed.delete(c); return true; }
      }
      return false;
    },
    takeMousePress: () => {
      const p = mouse.pressed;
      mouse.pressed = false;
      return p;
    },
    endFrame: () => { pressed.clear(); mouse.pressed = false; },
    // Movement vector from WASD / arrows, screen-relative.
    moveVector: () => {
      let x = 0;
      let y = 0;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown')) y += 1;
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
  };
}
