// police.js — the wanted system: heat, stars, police pursuit cars, foot
// officers, getting busted and losing the heat.

import { WANTED } from './config.js';
import { makeFootCop, makePoliceCar } from './entities.js';
import { nearestRoadPoint } from './city.js';

/** Add heat for a crime. Returns the new star count. */
export function addHeat(game, amount, reason) {
  const wanted = game.wanted;
  wanted.heat = Math.min(WANTED.maxHeat, wanted.heat + amount);
  const stars = starsForHeat(wanted.heat);
  if (stars > wanted.stars) {
    wanted.stars = stars;
    game.addToast(`${stars}-star wanted level — the Solmar PD is coming`, '#e03a2f');
    game.audio.setSiren(true);
  }
  wanted.lastCrime = reason;
  return wanted.stars;
}

export function starsForHeat(heat) {
  let stars = 0;
  for (let s = 0; s < WANTED.starHeat.length; s++) {
    if (heat >= WANTED.starHeat[s]) stars = s;
  }
  return stars;
}

/** True when any officer is close enough to see the player. */
function anyCopSeesPlayer(game) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  for (const car of game.cars) {
    if (!car.police) continue;
    if (Math.hypot(car.x - px, car.y - py) < WANTED.sightRange) return true;
  }
  for (const cop of game.cops) {
    if (Math.hypot(cop.x - px, cop.y - py) < WANTED.sightRange) return true;
  }
  return false;
}

function spawnPointNearPlayer(game, distance) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  const angle = game.rng.angle();
  const x = px + Math.cos(angle) * distance;
  const y = py + Math.sin(angle) * distance;
  return nearestRoadPoint(game.city, x, y);
}

/** Keep the right number of pursuit cars and foot officers on the street. */
function maintainForce(game, dt) {
  const wanted = game.wanted;
  const stars = wanted.stars;
  const policeCars = game.cars.filter((c) => c.police);
  const wantCars = Math.min(WANTED.maxPoliceCars, stars);
  if (policeCars.length < wantCars) {
    const spot = spawnPointNearPlayer(game, 520);
    const car = makePoliceCar(spot.x, spot.y, game.rng.angle());
    car.speed = 260;
    game.cars.push(car);
  }
  // Foot officers only chase a player who is on foot.
  const wantCops = !game.player.inCar && stars >= 2
    ? Math.min(WANTED.maxFootCops, stars - 1) : 0;
  if (game.cops.length < wantCops) {
    const p = game.player;
    const angle = game.rng.angle();
    game.cops.push(makeFootCop(
      p.x + Math.cos(angle) * 320,
      p.y + Math.sin(angle) * 320,
    ));
  }
  // Too far away for too long: the unit gives up and despawns.
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const car = game.cars[i];
    if (!car.police) continue;
    if (Math.hypot(car.x - px, car.y - py) > 1400) game.cars.splice(i, 1);
  }
  for (let i = game.cops.length - 1; i >= 0; i--) {
    const cop = game.cops[i];
    if (Math.hypot(cop.x - px, cop.y - py) > 1100) game.cops.splice(i, 1);
  }
}

/** Steer one police car toward the player and ram them. */
function updatePoliceCar(game, car, dt) {
  const p = game.player;
  const tx = p.inCar ? p.inCar.x : p.x;
  const ty = p.inCar ? p.inCar.y : p.y;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const targetSpeed = Math.min(car.maxSpeed, 300 + dist * 0.55);
  car.speed += Math.max(-620 * dt, Math.min(420 * dt, targetSpeed - car.speed));
  car.angle += steer * 2.9 * dt * Math.min(1, car.speed / 200 + 0.25);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.sirenPhase += dt * 6;

  // Ramming the player's car damages it and adds heat.
  if (p.inCar) {
    const pd = Math.hypot(car.x - p.inCar.x, car.y - p.inCar.y);
    if (pd < 46 && car.speed > 120) {
      p.inCar.health -= 6;
      p.inCar.x += (dx / dist) * -6;
      p.inCar.y += (dy / dist) * -6;
      game.addShake(3);
      game.audio.punch();
      if (p.inCar.health <= 0) game.explodeCar(p.inCar);
    }
  }
  // Keep pursuit cars out of buildings (they cut corners through blocks).
  const fixed = game.cityFix(car.x, car.y, 20);
  car.x = fixed.x;
  car.y = fixed.y;
}

/** Run one foot officer toward the player; hold them to bust. */
function updateFootCop(game, cop, dt) {
  const p = game.player;
  if (p.inCar) {
    // The player drove off: the officer runs back to a road and waits.
    cop.holdTimer = 0;
    const spot = nearestRoadPoint(game.city, cop.x, cop.y);
    const dx = spot.x - cop.x;
    const dy = spot.y - cop.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    cop.x += (dx / d) * 90 * dt;
    cop.y += (dy / d) * 90 * dt;
    return;
  }
  const dx = p.x - cop.x;
  const dy = p.y - cop.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const speed = 250;
  cop.x += (dx / dist) * speed * dt;
  cop.y += (dy / dist) * speed * dt;
  cop.angle = Math.atan2(dy, dx);
  const fixed = game.cityFix(cop.x, cop.y, 10);
  cop.x = fixed.x;
  cop.y = fixed.y;
  if (dist < WANTED.bustedRange) {
    cop.holdTimer += dt;
    if (cop.holdTimer >= WANTED.bustedHoldSec) game.busted();
  } else {
    cop.holdTimer = Math.max(0, cop.holdTimer - dt * 2);
  }
}

export function updateWanted(game, dt) {
  const wanted = game.wanted;
  maintainForce(game, dt);
  for (const car of game.cars) {
    if (car.police) updatePoliceCar(game, car, dt);
  }
  for (const cop of game.cops) updateFootCop(game, cop, dt);

  // Heat cools off; faster when nobody can see the player.
  if (wanted.heat > 0) {
    const seen = anyCopSeesPlayer(game);
    wanted.heat = Math.max(
      0,
      wanted.heat - (seen ? WANTED.decaySeenPerSec : WANTED.decayPerSec) * dt,
    );
    const stars = starsForHeat(wanted.heat);
    if (stars !== wanted.stars) {
      wanted.stars = stars;
      if (stars === 0) {
        game.addToast('You lost the cops — clean again', '#34c759');
        game.audio.setSiren(false);
        for (let i = game.cars.length - 1; i >= 0; i--) {
          if (game.cars[i].police) game.cars.splice(i, 1);
        }
        game.cops.length = 0;
      }
    }
  }
}

/** Drop all heat (used by scripted mission beats). */
export function clearWanted(game) {
  game.wanted.heat = 0;
  game.wanted.stars = 0;
  game.audio.setSiren(false);
  for (let i = game.cars.length - 1; i >= 0; i--) {
    if (game.cars[i].police) game.cars.splice(i, 1);
  }
  game.cops.length = 0;
}
