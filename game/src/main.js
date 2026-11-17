// main.js — SOLMAR HEAT: an original 2D top-down open-world crime game.
// Boots the canvas, the game loop and the deterministic ?shot= scenes,
// and reports any load error on the page so a screenshot run can see it.

import { Game } from './game.js';
import { applyShot, preroll } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

window.addEventListener('error', (event) => {
  window.__gameError = String(event.message || event.error || 'unknown error');
  document.title = `ERROR: ${window.__gameError}`;
  if (statusEl) statusEl.textContent = `Error: ${window.__gameError}`;
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 20261117);
const shot = params.get('shot') || '';

const game = new Game(canvas, seed);
window.__game = game;

if (shot) {
  applyShot(game, shot);
  preroll(game, shot);
  game.render();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  // Start the game from the title screen on Enter, Space or a click.
  if (game.state === 'menu'
    && (game.input.pressed('Enter') || game.input.pressed('Space') || game.input.mouse.clicked)) {
    game.startPlaying();
  }
  game.update(dt);
  game.render();
  game.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
