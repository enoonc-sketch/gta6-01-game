// The wanted system: crimes raise heat, stars summon police, police chase and
// try to bust Rhea, and heat cools when she breaks their line of sight.

import { POLICE, WANTED } from './config.js';
import { clamp, dist, angleDiff } from './rng.js';
import { makeCar, makePed, stepCarPhysics, collideCar, collideWithCity } from './entities.js';
import { nearestIntersection } from './city.js';
import { rainGrip } from './weather.js';
import { shootBullet } from './combat.js';

export function addHeat(game, amount) {
  const before = wantedStars(game);
  game.heat = clamp(game.heat + amount, 0, WANTED.maxStars * WANTED.heatPerStar);
  const after = wantedStars(game);
  if (after > before) game.audio.star();
}

export function wantedStars(game) {
  return game.heat <= 0 ? 0 : Math.ceil(game.heat / WANTED.heatPerStar);
}

export function clearWanted(game) {
  game.heat = 0;
  game.bust = 0;
}

function playerPos(game) {
  const p = game.player;
  return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
}

function anyCopSeesPlayer(game) {
  const pp = playerPos(game);
  for (const cop of game.cops) {
    if (dist(cop.x, cop.y, pp.x, pp.y) < POLICE.sightRadius) return true;
  }
  for (const car of game.cars) {
    if (car.police && !car.dead && dist(car.x, car.y, pp.x, pp.y) < POLICE.sightRadius) return true;
  }
  // The helicopter's spotlight counts as eyes on Rhea.
  if (game.heli && dist(game.heli.tx, game.heli.ty, pp.x, pp.y) < 170) return true;
  return false;
}

function spawnPointNear(game, minD, maxD) {
  const pp = playerPos(game);
  for (let tries = 0; tries < 12; tries++) {
    const a = game.rng.range(0, Math.PI * 2);
    const d = game.rng.range(minD, maxD);
    const x = clamp(pp.x + Math.cos(a) * d, 60, 4740);
    const y = clamp(pp.y + Math.sin(a) * d, 60, 4600);
    // Snap onto the nearest road centreline so units arrive on streets.
    const snapX = Math.round(x / 320) * 320;
    const snapY = Math.round(y / 320) * 320;
    if (Math.abs(x - snapX) < Math.abs(y - snapY)) return { x: snapX + 19, y };
    return { x, y: snapY + 19 };
  }
  return { x: pp.x + minD, y: pp.y };
}

// ------------------------------------------------------------ roadblocks

export function spawnRoadblock(game) {
  const p = game.player;
  const focus = p.inCar || p;
  const vx = focus.vx || 0;
  const vy = focus.vy || 0;
  const speed = Math.hypot(vx, vy);
  if (speed < 50) return;
  const ahead = {
    x: clamp(focus.x + (vx / speed) * 620, 80, 4720),
    y: clamp(focus.y + (vy / speed) * 620, 80, 4620),
  };
  const ni = nearestIntersection(ahead.x, ahead.y);
  const cx = ni.i * 320;
  const cy = ni.j * 320;
  if (dist(cx, cy, focus.x, focus.y) < 320) return; // too close; try again later
  const horizontal = Math.abs(vx) > Math.abs(vy);
  const cars = [];
  const props = [];
  for (const off of [-25, 25]) {
    const car = makeCar(
      horizontal ? cx : cx + off,
      horizontal ? cy + off : cy,
      horizontal ? 0 : Math.PI / 2,
      game.rng,
      { driver: 'roadblock', police: true, color: '#e8ecf1', hp: 150 },
    );
    car.name = 'Roadblock';
    game.cars.push(car);
    cars.push(car);
  }
  for (const off of [-52, 0, 52]) {
    const prop = {
      x: horizontal ? cx : cx + off,
      y: horizontal ? cy + off : cy,
      type: 'barrier', r: 9, solid: true,
      angle: horizontal ? Math.PI / 2 : 0,
    };
    game.city.props.push(prop);
    props.push(prop);
  }
  game.roadblocks.push({ cars, props, x: cx, y: cy });
}

function clearRoadblock(game, rb) {
  for (const prop of rb.props) {
    const idx = game.city.props.indexOf(prop);
    if (idx >= 0) game.city.props.splice(idx, 1);
  }
  for (const car of rb.cars) {
    car.driver = null;
    car.police = false;
  }
}

function manageRoadblocks(game) {
  const stars = wantedStars(game);
  const pp = playerPos(game);
  game.roadblocks = game.roadblocks.filter((rb) => {
    if (stars < 4 || dist(rb.x, rb.y, pp.x, pp.y) > 1700) {
      clearRoadblock(game, rb);
      return false;
    }
    return true;
  });
  const want = stars >= 5 ? 2 : stars >= 4 ? 1 : 0;
  if (game.roadblocks.length < want && game.player.inCar) spawnRoadblock(game);
}

// ------------------------------------------------------------ helicopter

function updateHeli(game, dt) {
  const stars = wantedStars(game);
  const pp = playerPos(game);
  if (stars >= 5 && !game.heli) {
    game.heli = { x: pp.x + 520, y: pp.y - 380, vx: 0, vy: 0, tx: pp.x, ty: pp.y, rotor: 0 };
  }
  if (!game.heli) return;
  if (stars < 5) { game.heli = null; return; }
  const h = game.heli;
  // Hover toward a point above the player with heavy lag; the spotlight
  // target trails behind the player a little.
  const dx = pp.x - h.x;
  const dy = pp.y - h.y;
  h.vx += dx * 1.6 * dt;
  h.vy += dy * 1.6 * dt;
  h.vx *= Math.exp(-1.1 * dt);
  h.vy *= Math.exp(-1.1 * dt);
  const sp = Math.hypot(h.vx, h.vy);
  if (sp > 430) { h.vx = (h.vx / sp) * 430; h.vy = (h.vy / sp) * 430; }
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.tx += (pp.x - h.tx) * (1 - Math.exp(-2.2 * dt));
  h.ty += (pp.y - h.ty) * (1 - Math.exp(-2.2 * dt));
  h.rotor += dt * 34;
}

function manageSpawns(game, dt) {
  const stars = wantedStars(game);
  game.policeSpawnTimer -= dt;
  const policeCars = game.cars.filter((c) => c.police && !c.dead);
  const wantCars = stars === 0 ? 0 : Math.min(5, stars + 1);
  const wantFoot = stars <= 1 ? 0 : Math.min(4, stars);
  if (game.policeSpawnTimer <= 0) {
    game.policeSpawnTimer = POLICE.spawnInterval;
    if (policeCars.length < wantCars) {
      const s = spawnPointNear(game, 520, 720);
      const car = makeCar(s.x, s.y, 0, game.rng, { driver: 'police', police: true, color: '#e8ecf1', hp: 140 });
      car.name = 'Interceptor';
      game.cars.push(car);
    } else if (game.cops.length < wantFoot) {
      const s = spawnPointNear(game, 380, 560);
      game.cops.push(makePed(s.x, s.y, game.rng, { cop: true, hp: 70 }));
    }
  }
  // Units give up and leave once the heat is gone or they fall far behind.
  const pp = playerPos(game);
  game.cops = game.cops.filter((c) => !c.dead && dist(c.x, c.y, pp.x, pp.y) < 1600);
  for (const car of game.cars) {
    if (car.police && car.driver !== 'roadblock' && (stars === 0 || dist(car.x, car.y, pp.x, pp.y) > 1700)) {
      car.driver = null;
      car.police = false;
      car.dead = car.dead || dist(car.x, car.y, pp.x, pp.y) > 1700;
    }
  }
}

function updatePoliceCar(car, game, dt) {
  const pp = playerPos(game);
  const target = game.player.inCar || game.player;
  const lead = 0.35;
  const tx = pp.x + (target.vx || 0) * lead;
  const ty = pp.y + (target.vy || 0) * lead;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  const d = dist(car.x, car.y, pp.x, pp.y);
  const playerSlow = !game.player.inCar || Math.abs(game.player.inCar.speed) < 40;
  const input = {
    throttle: 1,
    steer: clamp(diff * 2.6, -1, 1),
    brake: d < 70 && playerSlow && Math.abs(car.speed) > 60,
    handbrake: Math.abs(diff) > 2.2 && Math.abs(car.speed) > 160,
    gripMul: rainGrip(game),
  };
  stepCarPhysics(car, input, dt);
  const impact = collideCar(car, game.city.solids, game.city.props);
  if (impact > 130) car.hp -= (impact - 130) * 0.06;
  if (car.hp <= 0) car.dead = true;
}

function updateFootCop(cop, game, dt) {
  const pp = playerPos(game);
  const d = dist(cop.x, cop.y, pp.x, pp.y);
  const stars = wantedStars(game);
  const ang = Math.atan2(pp.y - cop.y, pp.x - cop.x);
  cop.angle = ang;
  const speed = d > 30 ? POLICE.footSpeed : 0;
  cop.vx = Math.cos(ang) * speed;
  cop.vy = Math.sin(ang) * speed;
  cop.x += cop.vx * dt;
  cop.y += cop.vy * dt;
  cop.walkPhase += dt * 14;
  collideWithCity(cop, cop.radius, game.city.solids, game.city.props);

  // At three stars and up, officers open fire.
  if (stars >= 3 && d < POLICE.shootRange && !game.player.dead) {
    cop.shootCooldown -= dt;
    if (cop.shootCooldown <= 0) {
      cop.shootCooldown = game.rng.range(0.7, 1.3);
      shootBullet(game, cop.x, cop.y, ang + game.rng.range(-0.06, 0.06), 'cop');
      game.audio.shot();
    }
  }
}

export function updatePolice(game, dt) {
  if (game.player.dead) return;
  manageSpawns(game, dt);
  manageRoadblocks(game);
  updateHeli(game, dt);

  for (const car of game.cars) {
    if (car.police && car.driver === 'police' && !car.dead) updatePoliceCar(car, game, dt);
  }
  for (const cop of game.cops) {
    if (!cop.dead) updateFootCop(cop, game, dt);
  }

  // Heat cools while unseen; a bust fills while officers are on top of a slow player.
  const seen = anyCopSeesPlayer(game);
  if (!seen && game.heat > 0) {
    game.heat = Math.max(0, game.heat - WANTED.decayPerSecond * dt);
  }

  const pp = playerPos(game);
  let busting = false;
  if (!game.player.inCar) {
    for (const cop of game.cops) {
      if (!cop.dead && dist(cop.x, cop.y, pp.x, pp.y) < POLICE.bustRadius) busting = true;
    }
  } else if (Math.abs(game.player.inCar.speed) < 34) {
    for (const car of game.cars) {
      if (car.police && !car.dead && dist(car.x, car.y, pp.x, pp.y) < 78) busting = true;
    }
  }
  if (busting && wantedStars(game) > 0) {
    game.bust += dt / POLICE.bustTime;
    if (game.bust >= 1) {
      game.bust = 0;
      game.onBusted();
    }
  } else {
    game.bust = Math.max(0, game.bust - dt * 0.8);
  }
}
