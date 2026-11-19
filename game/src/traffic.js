// Ambient life: traffic cars that drive the road grid in their lane and brake
// for obstacles, and pedestrians who stroll the sidewalks and flee from danger.

import { TRAFFIC, PEDS, WORLD } from './config.js';
import { clamp, dist, angleDiff } from './rng.js';
import { laneTarget, nearestIntersection, sidewalkRing } from './city.js';
import { stepCarPhysics, collideCar, collideWithCity } from './entities.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function initTrafficAI(car, rng) {
  const from = nearestIntersection(car.x, car.y);
  const options = DIRS
    .map(([di, dj]) => ({ i: from.i + di, j: from.j + dj }))
    .filter((n) => n.i >= 0 && n.j >= 0 && n.i <= WORLD.blocksX && n.j <= WORLD.blocksY);
  const to = options.length ? rng.pick(options) : from;
  car.ai = {
    fromI: from.i, fromJ: from.j, toI: to.i, toJ: to.j,
    cruise: TRAFFIC.cruiseSpeed * rng.range(0.8, 1.15),
    stuckTimer: 0,
  };
  const t = laneTarget(from.i, from.j, to.i, to.j);
  car.angle = Math.atan2(t.y - car.y, t.x - car.x);
  return car.ai;
}

function chooseNextIntersection(car, rng) {
  const ai = car.ai;
  const di = ai.toI - ai.fromI;
  const dj = ai.toJ - ai.fromJ;
  const options = [];
  for (const [oi, oj] of DIRS) {
    const ni = ai.toI + oi;
    const nj = ai.toJ + oj;
    if (ni < 0 || nj < 0 || ni > WORLD.blocksX || nj > WORLD.blocksY) continue;
    const isUturn = oi === -di && oj === -dj;
    const isStraight = oi === di && oj === dj;
    const weight = isUturn ? 1 : isStraight ? 6 : 3;
    for (let k = 0; k < weight; k++) options.push({ i: ni, j: nj });
  }
  const next = options.length ? rng.pick(options) : { i: ai.fromI, j: ai.fromJ };
  ai.fromI = ai.toI;
  ai.fromJ = ai.toJ;
  ai.toI = next.i;
  ai.toJ = next.j;
}

function obstacleAhead(car, game) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const look = 46 + Math.abs(car.speed) * 0.32;
  const px = car.x + fx * look;
  const py = car.y + fy * look;
  const near = (x, y, r) => dist(px, py, x, y) < r + 20;
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    if (near(other.x, other.y, 24)) return true;
  }
  for (const ped of game.peds) {
    if (ped.dead) continue;
    if (near(ped.x, ped.y, 10)) return true;
  }
  const p = game.player;
  if (!p.inCar && near(p.x, p.y, 12)) return true;
  return false;
}

export function updateTrafficCar(car, game, dt) {
  const ai = car.ai;
  if (!ai || car.dead) return;
  const target = laneTarget(ai.fromI, ai.fromJ, ai.toI, ai.toJ);
  const d = dist(car.x, car.y, target.x, target.y);
  if (d < 42) chooseNextIntersection(car, game.rng);

  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(car.angle, desired);
  const blocked = obstacleAhead(car, game);
  const input = {
    throttle: blocked ? 0 : clamp((ai.cruise - car.speed) / 60, 0, 1),
    steer: clamp(diff * 2.4, -1, 1),
    brake: blocked && car.speed > 24,
    handbrake: false,
  };
  stepCarPhysics(car, input, dt);
  const impact = collideCar(car, game.city.solids, game.city.props);
  if (impact > 120) car.hp -= (impact - 120) * 0.05;

  // Honk when stuck behind something for a while.
  if (blocked && Math.abs(car.speed) < 12) {
    ai.stuckTimer += dt;
    if (ai.stuckTimer > 1.6) {
      ai.stuckTimer = 0;
      if (dist(car.x, car.y, game.player.x, game.player.y) < 520) game.audio.horn();
    }
  } else {
    ai.stuckTimer = 0;
  }
}

// ------------------------------------------------------------ pedestrians

export function pedFleeFrom(ped, x, y, seconds = 2.4) {
  if (ped.dead) return;
  ped.state = 'flee';
  ped.fleeFrom = { x, y };
  ped.fleeTimer = Math.max(ped.fleeTimer, seconds);
}

function pedWalkTarget(ped, rng) {
  const i = clamp(Math.floor(ped.x / 320), 0, WORLD.blocksX - 1);
  const j = clamp(Math.floor(ped.y / 320), 0, WORLD.blocksY - 2);
  const ring = sidewalkRing(i, j);
  // Walk to the next corner of the ring; sometimes cross to the neighbouring block.
  let best = null;
  let bestD = Infinity;
  for (const c of ring) {
    const d = dist(ped.x, ped.y, c.x, c.y);
    if (d > 24 && d < bestD) { bestD = d; best = c; }
  }
  if (best && rng.chance(0.3)) {
    const ni = clamp(i + rng.pick([-1, 1]), 0, WORLD.blocksX - 1);
    const ring2 = sidewalkRing(ni, j);
    return ring2[rng.int(0, 3)];
  }
  return best || ring[rng.int(0, 3)];
}

export function updatePed(ped, game, dt) {
  if (ped.dead) {
    ped.downTimer += dt;
    return;
  }
  const rng = game.rng;

  // Dodge fast cars bearing down on them.
  for (const car of game.cars) {
    if (Math.abs(car.speed) < 120) continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 78) {
      pedFleeFrom(ped, car.x, car.y, 1.1);
      break;
    }
  }

  let speed = PEDS.walkSpeed;
  let tx;
  let ty;
  if (ped.state === 'flee' && ped.fleeFrom) {
    ped.fleeTimer -= dt;
    speed = PEDS.fleeSpeed;
    const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
    tx = ped.x + Math.cos(away) * 90;
    ty = ped.y + Math.sin(away) * 90;
    if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.target = null; }
  } else {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 16) {
      ped.target = pedWalkTarget(ped, rng);
    }
    tx = ped.target.x;
    ty = ped.target.y;
  }

  const ang = Math.atan2(ty - ped.y, tx - ped.x);
  ped.angle = ang;
  ped.vx = Math.cos(ang) * speed;
  ped.vy = Math.sin(ang) * speed;
  ped.x += ped.vx * dt;
  ped.y += ped.vy * dt;
  ped.walkPhase += dt * (speed / 9);
  collideWithCity(ped, ped.radius, game.city.solids, game.city.props);
}
