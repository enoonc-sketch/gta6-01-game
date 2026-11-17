// traffic.js — the living city: traffic cars follow the road grid and
// pedestrians stroll the sidewalks, scatter when scared, and wander home.

import { CAR, CITY } from './config.js';
import { collideBuildings, isOnRoad } from './city.js';

const LANE_OFFSET = 16; // cars drive right of the centreline (car is 26 wide)
const STOP_GAP = 62; // a car stops this far behind the one ahead

/** Move one traffic car along the road graph for dt seconds. */
function updateTrafficCar(game, car, dt) {
  if (car.driver === 'player') return; // the player drives this one
  if (car.driver === 'police') return; // police.js steers pursuit cars
  if (car.parked) return;

  // Look ahead on the same road and lane: stop behind slow traffic.
  let targetSpeed = car.maxSpeed * 0.55;
  for (const other of game.cars) {
    if (other === car || other.parked) continue;
    if (other.axis !== car.axis || other.line !== car.line || other.dir !== car.dir) continue;
    const gap = (other.along - car.along) * car.dir;
    if (gap > 0 && gap < STOP_GAP) { targetSpeed = 0; break; }
  }
  // Never plough into the player: brake for them too.
  const p = game.player;
  if (p.inCar !== car) {
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    const dx = px - car.x;
    const dy = py - car.y;
    const dist = Math.hypot(dx, dy);
    const ahead = car.axis === 'v'
      ? (dy * car.dir > 0 && Math.abs(dx) < 30)
      : (dx * car.dir > 0 && Math.abs(dy) < 30);
    if (ahead && dist < 70) targetSpeed = 0;
  }

  car.speed += Math.max(-CAR.brake * dt, Math.min(CAR.accel * 0.5 * dt, targetSpeed - car.speed));
  if (car.speed < 0) car.speed = 0;
  car.along += car.dir * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const nearestLine = Math.round(car.along / CITY.pitch) * CITY.pitch;
  if (Math.abs(car.along - nearestLine) < car.speed * dt + 1
    && nearestLine > 0 && nearestLine < CITY.size
    && car.lastTurnLine !== nearestLine) {
    car.lastTurnLine = nearestLine;
    const r = game.rng.float();
    if (r < 0.22) {
      // Turn left or right onto the crossing road.
      const turn = game.rng.chance(0.5) ? 1 : -1;
      const newLine = nearestLine;
      if (car.axis === 'v') {
        car.axis = 'h';
        car.line = newLine;
        car.along = car.x;
        car.dir = turn * (car.dir > 0 ? 1 : -1);
        // Keep the turn on the correct side of the road.
        if (car.dir < 0) car.along = car.x;
      } else {
        car.axis = 'v';
        car.line = newLine;
        car.along = car.y;
        car.dir = turn * (car.dir > 0 ? -1 : 1);
      }
      car.lane = game.rng.chance(0.5) ? 1 : -1;
    }
  }

  // Wrap around the far edge so traffic never runs out.
  if (car.along > CITY.size - 20) { car.along = 40; car.lastTurnLine = -1; }
  if (car.along < 20) { car.along = CITY.size - 40; car.lastTurnLine = -1; }

  const off = LANE_OFFSET * car.lane * (car.axis === 'v' ? 1 : 1);
  if (car.axis === 'v') {
    car.x = car.line + off;
    car.y = car.along;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = car.along;
    car.y = car.line + off;
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
}

export function updateTraffic(game, dt) {
  for (const car of game.cars) updateTrafficCar(game, car, dt);
}

/** Move one pedestrian: stroll the sidewalk, or run from danger. */
function updatePed(game, ped, dt) {
  if (ped.state === 'down') return;
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  const dx = ped.x - px;
  const dy = ped.y - py;
  const dist = Math.hypot(dx, dy);

  const threat = game.shotsFiredRecently > 0 || (p.inCar && p.inCar.speed > 200);
  if (ped.state === 'walk' && dist < 130 && (threat || game.wanted.stars >= 3)) {
    ped.state = 'flee';
    ped.panic = 1;
    game.save.stats.pedsFled++;
  }
  if (ped.state === 'flee') {
    ped.panic = Math.max(0, ped.panic - dt * 0.25);
    if (ped.panic <= 0 && dist > 320) ped.state = 'walk';
    const d = Math.max(1, dist);
    const speed = 150;
    ped.x += (dx / d) * speed * dt;
    ped.y += (dy / d) * speed * dt;
    ped.angle = Math.atan2(dy, dx);
    const fixed = collideBuildings(game.city, ped.x, ped.y, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
    return;
  }

  // Stroll along the sidewalk, turning at intersections sometimes.
  ped.along += ped.dir * ped.speed * dt;
  const nearestLine = Math.round(ped.along / CITY.pitch) * CITY.pitch;
  if (Math.abs(ped.along - nearestLine) < 2
    && nearestLine > 0 && nearestLine < CITY.size
    && ped.lastTurnLine !== nearestLine
    && game.rng.chance(0.3)) {
    ped.lastTurnLine = nearestLine;
    if (ped.axis === 'v') {
      ped.axis = 'h';
      ped.line = nearestLine;
      ped.along = ped.x;
    } else {
      ped.axis = 'v';
      ped.line = nearestLine;
      ped.along = ped.y;
    }
    ped.dir = game.rng.chance(0.5) ? 1 : -1;
  }
  if (ped.along > CITY.size - 20) { ped.along = 40; ped.lastTurnLine = -1; }
  if (ped.along < 20) { ped.along = CITY.size - 40; ped.lastTurnLine = -1; }

  const side = CITY.roadW / 2 + CITY.sidewalk / 2 + 2;
  const sway = Math.sin(game.time * 2 + ped.id) * 2;
  if (ped.axis === 'v') {
    ped.x = ped.line + side * (ped.dir > 0 ? 1 : -1) + sway;
    ped.y = ped.along;
    ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    ped.x = ped.along;
    ped.y = ped.line + side * (ped.dir > 0 ? 1 : -1) + sway;
    ped.angle = ped.dir > 0 ? 0 : Math.PI;
  }
  // Keep pedestrians out of buildings if a turn pushed them inside one.
  const fixed = collideBuildings(game.city, ped.x, ped.y, 9);
  ped.x = fixed.x;
  ped.y = fixed.y;
}

export function updatePeds(game, dt) {
  for (const ped of game.peds) updatePed(game, ped, dt);
  if (game.shotsFiredRecently > 0) game.shotsFiredRecently -= dt;
}

/** A car the player hit hard: bump the traffic car and honk. */
export function bumpTrafficCar(car, fromX, fromY) {
  if (car.parked || car.driver === 'player') return;
  const dx = car.x - fromX;
  const dy = car.y - fromY;
  const d = Math.max(1, Math.hypot(dx, dy));
  car.x += (dx / d) * 14;
  car.y += (dy / d) * 14;
  car.health -= 8;
  if (car.honkCooldown <= 0) {
    car.honkCooldown = 2;
  }
}
