// entities.js — factories for everything that moves in Solmar City:
// the player, traffic cars, pedestrians, police and gang members.
// No behaviour lives here; the update files drive these plain objects.

import { CAR, CAR_MODELS, PED_SHIRTS, PLAYER } from './config.js';
import { randomRoadPoint } from './city.js';

let nextId = 1;

export function makePlayer(x, y) {
  return {
    id: nextId++,
    kind: 'player',
    x, y,
    angle: -Math.PI / 2,
    speed: 0,
    health: PLAYER.health,
    maxHealth: PLAYER.health,
    inCar: null, // the car object when driving
    hasPistol: false,
    ammo: 0,
    pistolCooldown: 0,
    punchCooldown: 0,
    regenDelay: 0,
    wanted: 0,
    cash: 0,
    moving: false,
  };
}

/** A traffic car that follows the road graph. */
export function makeTrafficCar(rng, city) {
  const model = rng.pick(CAR_MODELS);
  const vertical = rng.chance(0.5);
  const line = rng.pick(city.roadLines);
  const along = rng.range(60, 2340);
  const dir = rng.chance(0.5) ? 1 : -1;
  return {
    id: nextId++,
    kind: 'car',
    model: model.name,
    color: model.color,
    maxSpeed: model.maxSpeed * rng.range(0.55, 0.7),
    // Road-graph state: which road, which way along it, which lane side.
    axis: vertical ? 'v' : 'h',
    line,
    along,
    dir,
    lane: rng.chance(0.5) ? 1 : -1,
    speed: CAR.trafficSpeed * rng.range(0.8, 1.15),
    driver: 'traffic',
    health: CAR.health,
    x: vertical ? line : along,
    y: vertical ? along : line,
    angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    stopped: false,
    honkCooldown: 0,
  };
}

/** A parked car the player can steal. */
export function makeParkedCar(rng, city) {
  const model = rng.pick(CAR_MODELS);
  const spot = randomRoadPoint(rng, city);
  const vertical = rng.chance(0.5);
  const offset = 22; // parked at the kerb
  return {
    id: nextId++,
    kind: 'car',
    model: model.name,
    color: model.color,
    maxSpeed: model.maxSpeed,
    axis: vertical ? 'v' : 'h',
    line: vertical ? spot.x : spot.y,
    along: vertical ? spot.y : spot.x,
    dir: rng.chance(0.5) ? 1 : -1,
    lane: 1,
    speed: 0,
    driver: null, // parked, nobody inside
    health: CAR.health,
    x: vertical ? spot.x + offset : spot.x,
    y: vertical ? spot.y : spot.y + offset,
    angle: vertical ? (Math.PI / 2) : 0,
    parked: true,
    stopped: false,
    honkCooldown: 0,
  };
}

/** A police pursuit car, spawned near the player. */
export function makePoliceCar(x, y, angle) {
  return {
    id: nextId++,
    kind: 'car',
    model: 'Interceptor',
    color: '#1c2733',
    maxSpeed: 640,
    axis: 'v',
    line: x,
    along: y,
    dir: 1,
    lane: 0,
    speed: 0,
    driver: 'police',
    health: CAR.health,
    x, y, angle,
    police: true,
    sirenPhase: 0,
    stopped: false,
    honkCooldown: 0,
  };
}

/** A police officer on foot. */
export function makeFootCop(x, y) {
  return {
    id: nextId++,
    kind: 'cop',
    x, y,
    angle: 0,
    speed: 0,
    health: 100,
    state: 'chase',
    holdTimer: 0, // seconds spent within busting range of the player
  };
}

/** A pedestrian strolling the sidewalks. */
export function makePed(rng, city) {
  const spot = randomRoadPoint(rng, city);
  const vertical = rng.chance(0.5);
  return {
    id: nextId++,
    kind: 'ped',
    x: spot.x,
    y: spot.y,
    axis: vertical ? 'v' : 'h',
    line: vertical ? spot.x : spot.y,
    along: vertical ? spot.y : spot.x,
    dir: rng.chance(0.5) ? 1 : -1,
    speed: rng.range(28, 55),
    color: rng.pick(PED_SHIRTS),
    state: 'walk', // 'walk' | 'flee' | 'down'
    fleeX: 0,
    fleeY: 0,
    panic: 0,
    angle: 0,
  };
}

/** A Viper gang member: an armed enemy for the final mission. */
export function makeViper(x, y, rng) {
  return {
    id: nextId++,
    kind: 'viper',
    x, y,
    angle: rng ? rng.angle() : 0,
    speed: 0,
    health: 60,
    state: 'guard', // 'guard' | 'attack' | 'down'
    shootCooldown: rng ? rng.range(0.5, 1.5) : 1,
    color: '#3a3f2f',
    shirt: '#5a2f3a',
  };
}
