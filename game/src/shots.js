// shots.js — deterministic screenshot scenes for ?shot=.
// Each scene sets the game up at a fixed, seeded moment — the same URL
// always shows the same frame — so the screenshots are real renders of
// the game, taken by its own code, and reproducible by anyone.

import { CITY } from './config.js';
import { makePoliceCar, makeViper } from './entities.js';
import { addHeat } from './police.js';

export const SHOTS = ['start', 'chase', 'drive', 'fight'];

/** Put the player in a car on a road, driving, with the engine on. */
function putPlayerInCar(game, x, y, angle, speed) {
  const p = game.player;
  // Find the closest car and hand it to the player; if none is near,
  // take the first traffic car on the street.
  let car = null;
  let best = null;
  let bestD = Infinity;
  for (const c of game.cars) {
    if (c.dead || c.police) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) { bestD = d; best = c; }
  }
  car = best;
  // Sit in the right-hand lane for the heading, like the traffic does.
  car.x = x - Math.sin(angle) * 16;
  car.y = y + Math.cos(angle) * 16;
  car.angle = angle;
  car.speed = speed;
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  p.x = x;
  p.y = y;
  p.angle = angle;
  game.autoDrive = true; // keep the throttle down while the shot is staged
  game.camera.x = x;
  game.camera.y = y;
}

function putPoliceBehind(game, car, count, gap) {
  for (let i = 0; i < count; i++) {
    const bx = car.x - Math.cos(car.angle) * gap * (i + 1) - Math.sin(car.angle) * (i % 2 ? 26 : -26);
    const by = car.y - Math.sin(car.angle) * gap * (i + 1) + Math.cos(car.angle) * (i % 2 ? 26 : -26);
    const cop = makePoliceCar(bx, by, car.angle);
    cop.speed = car.speed * 0.92;
    game.cars.push(cop);
  }
}

/** Build one named scene. Call before the game starts its loop. */
export function applyShot(game, name) {
  const L = game.city.landmarks;
  if (name === 'start') {
    // The title screen over the living city: nothing else to set up.
    game.state = 'menu';
    return;
  }

  game.state = 'playing';
  game.audio.ensure();

  if (name === 'chase') {
    // A three-star chase down the beachfront avenue: the player fleeing in
    // a stolen Comet GT, three interceptors behind, the minimap, the stars
    // and the delivery objective all on the HUD at once.
    game.missions.startMission(2);
    game.missions.stage = 1;
    game.missions.refreshObjective();
    putPlayerInCar(game, 1200, 2400, 0, 430);
    addHeat(game, 520, 'the setup');
    putPoliceBehind(game, game.player.inCar, 3, 110);
    game.addToast('Package secured. The docks are hot — move!', '#e03a2f');
  } else if (name === 'drive') {
    // Cruising the beachfront avenue in the evening light, traffic around,
    // the garage job on the HUD.
    game.missions.startMission(1);
    game.missions.stage = 1;
    game.missions.refreshObjective();
    putPlayerInCar(game, 900, 2400, 0, 380);
    game.player.inCar.maxSpeed = 380; // a relaxed cruise for the shot
    // A few cars ahead in the same lane, far enough not to be caught, and
    // oncoming traffic in the other lane so the avenue reads as alive.
    const movers = game.cars.filter((c) => c.driver === 'traffic' && !c.parked);
    movers.slice(0, 2).forEach((c, i) => {
      c.axis = 'h';
      c.line = 2400;
      c.along = 2000 + i * 300;
      c.dir = 1;
      c.lane = 1;
      c.x = c.along;
      c.y = 2400 + 16;
      c.angle = 0;
      c.speed = 170;
    });
    movers.slice(2, 7).forEach((c, i) => {
      c.axis = 'h';
      c.line = 2400;
      c.along = 1150 + i * 260;
      c.dir = -1;
      c.lane = -1;
      c.x = c.along;
      c.y = 2400 - 16;
      c.angle = Math.PI;
      c.speed = 200;
    });
  } else if (name === 'fight') {
    // The Foundry Yard showdown: Jax on foot, pistol out, three Vipers
    // closing in, two stars overhead.
    game.missions.startMission(5);
    game.missions.stage = 1;
    const p = game.player;
    p.x = L.foundry.x + 60;
    p.y = L.foundry.y + 150;
    p.angle = Math.PI / 4;
    p.hasPistol = true;
    p.ammo = 72;
    p.health = 78;
    game.camera.x = p.x;
    game.camera.y = p.y;
    game.vipers.length = 0;
    const spots = [
      [L.foundry.x + 200, L.foundry.y + 60],
      [L.foundry.x - 40, L.foundry.y + 260],
      [L.foundry.x + 260, L.foundry.y + 260],
    ];
    for (const [x, y] of spots) {
      const v = makeViper(x, y, game.rng);
      v.state = 'attack';
      v.shootCooldown = 0.4;
      game.vipers.push(v);
    }
    addHeat(game, 300, 'the foundry fight');
    game.missions.refreshObjective();
  }
}

/** Fixed-step pre-roll: run the scene forward so the shot catches it mid-action. */
export function preroll(game, name) {
  const steps = name === 'chase' ? 50 : name === 'fight' ? 36 : name === 'drive' ? 40 : 0;
  for (let i = 0; i < steps; i++) game.update(1 / 60);
}
