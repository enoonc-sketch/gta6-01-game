// Entity factories and shared physics: the player, cars, pedestrians, police
// and pickups, plus the arcade car model and circle-versus-city collision.

import { PLAYER, CAR, PEDS, CAR_MODELS, PED_COLORS } from './config.js';
import { clamp, pushCircleOutOfBox, dist2 } from './rng.js';
import { WATER_Y } from './city.js';

let nextId = 1;

export function makePlayer(x, y) {
  return {
    id: nextId++,
    kind: 'player',
    x, y, vx: 0, vy: 0,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    armor: 0,
    money: 120,
    color: '#e74c3c', // Rhea's rust-red jacket
    skin: '#c68642',
    inCar: null,
    weapons: { fists: true, pistol: false, smg: false, scatter: false },
    ammo: { pistol: 0, smg: 0, scatter: 0 },
    currentWeapon: 'fists',
    fireCooldown: 0,
    punchAnim: 0,
    walkPhase: 0,
    dead: false,
  };
}

export function makeCar(x, y, angle, rng, opts = {}) {
  const model = opts.model || rng.pick(CAR_MODELS);
  return {
    id: nextId++,
    kind: 'car',
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    steerVis: 0,
    radius: 21,
    length: CAR.length,
    width: CAR.width,
    hp: opts.hp ?? 100,
    color: opts.color || model.color,
    name: model.name,
    speedMul: model.speedMul,
    driver: opts.driver || null,       // null (parked) | 'traffic' | 'player' | 'police'
    police: !!opts.police,
    ai: opts.ai || null,                // traffic/police driving state
    smokeTimer: 0,
    burning: false,
    dead: false,
    honkTimer: rng.range(4, 20),
  };
}

export function makePed(x, y, rng, opts = {}) {
  return {
    id: nextId++,
    kind: opts.cop ? 'cop' : 'ped',
    x, y, vx: 0, vy: 0,
    angle: rng.range(0, Math.PI * 2),
    radius: PEDS.radius,
    hp: opts.hp ?? 40,
    color: opts.cop ? '#274472' : rng.pick(PED_COLORS),
    skin: rng.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    state: 'walk',
    walkPhase: rng.range(0, 6.28),
    target: null,
    fleeFrom: null,
    fleeTimer: 0,
    shootCooldown: rng.range(0.4, 1.2),
    hostile: !!opts.hostile,
    dead: false,
    downTimer: 0,
  };
}

export function makePickup(x, y, type, amount = 0) {
  return { id: nextId++, kind: 'pickup', x, y, type, amount, bobPhase: Math.random() * 6.28, taken: false };
}

// Arcade car physics: velocity split into forward/lateral parts, lateral grip
// bleeds sideways slide; the handbrake drops grip so the car drifts.
// input: { throttle: -1..1, steer: -1..1, brake: bool, handbrake: bool }
export function stepCarPhysics(car, input, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let fwd = car.vx * fx + car.vy * fy;
  let lat = car.vx * rx + car.vy * ry;

  const maxFwd = CAR.maxSpeed * car.speedMul;
  if (input.throttle > 0) fwd += CAR.accel * input.throttle * dt * (fwd < 0 ? 2.2 : 1);
  else if (input.throttle < 0) fwd += (fwd > 8 ? -CAR.brake : -CAR.accel * 0.55) * -input.throttle * dt;
  if (input.brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), CAR.brake * dt);
  if (input.handbrake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 260 * dt);
  fwd = clamp(fwd, -CAR.reverseSpeed, maxFwd);
  fwd *= Math.exp(-CAR.drag * dt * (input.throttle === 0 ? 1.6 : 0.5));

  const grip = input.handbrake ? CAR.driftGrip : CAR.grip;
  lat *= Math.exp(-grip * dt);

  const steerAuthority = clamp(Math.abs(fwd) / 90, 0, 1) * (input.handbrake ? 1.35 : 1);
  car.angle += input.steer * CAR.steerRate * steerAuthority * dt * (fwd < 0 ? -1 : 1);
  car.steerVis = input.steer;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const nrx = -nfy;
  const nry = nfx;
  car.vx = nfx * fwd + nrx * lat;
  car.vy = nfy * fwd + nry * lat;
  car.speed = fwd;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

// Resolve a circle against building boxes and solid props. Returns impact speed (0 = no hit).
export function collideWithCity(e, radius, solids, props) {
  let impact = 0;
  const speedBefore = Math.hypot(e.vx || 0, e.vy || 0);
  for (const box of solids) {
    if (e.x < box.x - 70 || e.x > box.x + box.w + 70 || e.y < box.y - 70 || e.y > box.y + box.h + 70) continue;
    const [nx, ny, hit] = pushCircleOutOfBox(e.x, e.y, radius, box);
    if (hit) {
      e.x = nx;
      e.y = ny;
      impact = Math.max(impact, speedBefore);
    }
  }
  for (const p of props) {
    if (!p.solid) continue;
    const rr = radius + p.r;
    if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
      const d = Math.max(1, Math.hypot(e.x - p.x, e.y - p.y));
      e.x = p.x + ((e.x - p.x) / d) * rr;
      e.y = p.y + ((e.y - p.y) / d) * rr;
      impact = Math.max(impact, speedBefore * 0.6);
    }
  }
  // World bounds and the bay to the south.
  e.x = clamp(e.x, 24, 4800 - 24);
  e.y = clamp(e.y, 24, WATER_Y - 6);
  return impact;
}

// Two-circle collision for cars so long vehicles scrape corners believably.
export function collideCar(car, solids, props) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let impact = 0;
  for (const off of [-15, 15]) {
    const probe = { x: car.x + fx * off, y: car.y + fy * off, vx: car.vx, vy: car.vy };
    const hit = collideWithCity(probe, 15, solids, props);
    if (hit > 0) {
      car.x += probe.x - (car.x + fx * off);
      car.y += probe.y - (car.y + fy * off);
      impact = Math.max(impact, hit);
    }
  }
  if (impact > 30) {
    // Kill the velocity component pushing into the wall, keep the slide.
    car.vx *= 0.35;
    car.vy *= 0.35;
  }
  return impact;
}

export function damageCar(car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.burning = true;
  }
}

export function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}
