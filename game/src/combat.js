// Combat: weapons, bullets, damage, particles, explosions and pickups.
// Bullets are fast projectiles stepped twice per frame so they do not tunnel.

import { WEAPONS, WANTED } from './config.js';
import { dist, clamp } from './rng.js';
import { damageCar, makePickup } from './entities.js';
import { addHeat } from './police.js';
import { pedFleeFrom } from './traffic.js';

export function spawnParticles(game, x, y, opts) {
  const n = opts.count || 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (opts.speed || 90) * (0.3 + Math.random() * 0.9);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp + (opts.vx || 0),
      vy: Math.sin(a) * sp + (opts.vy || 0),
      life: 0,
      maxLife: (opts.life || 0.45) * (0.6 + Math.random() * 0.8),
      size: (opts.size || 3) * (0.6 + Math.random() * 0.9),
      color: opts.color || '#ffd166',
      type: opts.type || 'spark',
      grow: opts.grow || 0,
    });
  }
}

export function shootBullet(game, x, y, angle, from) {
  const speed = 940;
  game.bullets.push({
    x: x + Math.cos(angle) * 16,
    y: y + Math.sin(angle) * 16,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.62,
    from,
    damage: from === 'player' ? 0 : 9, // player damage set by weapon below
  });
  spawnParticles(game, x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, {
    count: 2, speed: 40, life: 0.08, size: 5, color: '#ffe9a3', type: 'flash',
  });
}

export function playerShoot(game) {
  const p = game.player;
  const w = WEAPONS[p.currentWeapon];
  if (p.currentWeapon === 'fists') {
    p.punchAnim = 1;
    game.audio.punch();
    const hx = p.x + Math.cos(p.aimAngle) * 26;
    const hy = p.y + Math.sin(p.aimAngle) * 26;
    let hitSomething = false;
    for (const ped of [...game.peds, ...game.cops]) {
      if (ped.dead) continue;
      if (dist(hx, hy, ped.x, ped.y) < 26) {
        damagePed(game, ped, w.damage, true);
        ped.x += Math.cos(p.aimAngle) * 10;
        ped.y += Math.sin(p.aimAngle) * 10;
        hitSomething = true;
      }
    }
    for (const car of game.cars) {
      if (car.dead) continue;
      if (dist(hx, hy, car.x, car.y) < 30) {
        damageCar(car, 3);
        spawnParticles(game, hx, hy, { count: 3, speed: 60, life: 0.2, color: '#cfd8dc' });
        hitSomething = true;
      }
    }
    if (hitSomething) game.audio.hit();
    scareNearby(game, p.x, p.y, 180);
    return;
  }
  if (p.ammo[p.currentWeapon] <= 0) {
    game.audio.hit();
    p.currentWeapon = 'fists';
    return;
  }
  p.ammo[p.currentWeapon] -= w.ammoUse;
  if (p.currentWeapon === 'scatter') game.audio.shotgun();
  else game.audio.shot();
  for (let i = 0; i < w.pellets; i++) {
    const a = p.aimAngle + (Math.random() - 0.5) * 2 * w.spread;
    shootBullet(game, p.x, p.y, a, 'player');
    game.bullets[game.bullets.length - 1].damage = w.damage;
  }
  scareNearby(game, p.x, p.y, 420);
  // Gunfire near an officer is its own crime.
  for (const cop of game.cops) {
    if (!cop.dead && dist(p.x, p.y, cop.x, cop.y) < 380) { addHeat(game, WANTED.crimeHeat.shootNearCop); break; }
  }
}

export function scareNearby(game, x, y, radius) {
  for (const ped of game.peds) {
    if (!ped.dead && dist(ped.x, ped.y, x, y) < radius) pedFleeFrom(ped, x, y, 2.6);
  }
}

export function damagePed(game, ped, amount, byPlayer) {
  if (ped.dead) return;
  ped.hp -= amount;
  spawnParticles(game, ped.x, ped.y, { count: 4, speed: 70, life: 0.3, color: '#c0392b', type: 'puff', size: 4 });
  if (ped.hp <= 0) {
    ped.dead = true;
    ped.downTimer = 0;
    if (byPlayer) {
      addHeat(game, ped.kind === 'cop' ? WANTED.crimeHeat.killCop : WANTED.crimeHeat.killPed);
      if (ped.kind === 'ped' && Math.random() < 0.55) {
        game.pickups.push(makePickup(ped.x, ped.y, 'cash', 15 + Math.floor(Math.random() * 40)));
      }
    }
  } else if (byPlayer) {
    addHeat(game, 3);
    if (ped.kind === 'ped') pedFleeFrom(ped, game.player.x, game.player.y, 3);
  }
}

export function damagePlayer(game, amount) {
  const p = game.player;
  if (p.dead) return;
  let left = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left * 0.7);
    p.armor -= absorbed;
    left -= absorbed;
  }
  p.hp -= left;
  game.hurtFlash = 1;
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    game.onPlayerDeath();
  }
}

export function explodeCar(game, car) {
  if (car.exploded) return;
  car.exploded = true;
  car.dead = true;
  car.burning = false;
  game.audio.explosion();
  spawnParticles(game, car.x, car.y, { count: 26, speed: 260, life: 0.7, size: 7, color: '#ff9f43', type: 'flash' });
  spawnParticles(game, car.x, car.y, { count: 18, speed: 90, life: 1.6, size: 10, color: '#555', type: 'smoke', grow: 14 });
  const hurt = (e, r) => {
    const d = dist(car.x, car.y, e.x, e.y);
    if (d < 110) return (1 - d / 110) * 70;
    return 0;
  };
  const pd = hurt(game.player, 0);
  if (pd > 0 && !game.player.inCar) damagePlayer(game, pd);
  if (game.player.inCar && game.player.inCar !== car) {
    const cd = hurt(game.player.inCar, 0);
    if (cd > 0) damageCar(game.player.inCar, cd);
  }
  for (const ped of [...game.peds, ...game.cops]) {
    const d = hurt(ped, 0);
    if (d > 0) damagePed(game, ped, d, false);
  }
  for (const other of game.cars) {
    if (other !== car) {
      const d = hurt(other, 0);
      if (d > 0) damageCar(other, d);
    }
  }
  addHeat(game, WANTED.crimeHeat.explosion);
  game.shake = Math.max(game.shake, 0.7);
}

function bulletHitsBuilding(game, b) {
  for (const box of game.city.solids) {
    if (b.x >= box.x && b.x <= box.x + box.w && b.y >= box.y && b.y <= box.y + box.h) return true;
  }
  return false;
}

export function updateBullets(game, dt) {
  const kept = [];
  for (const b of game.bullets) {
    b.life -= dt;
    if (b.life <= 0) continue;
    let alive = true;
    for (let step = 0; step < 2 && alive; step++) {
      b.x += b.vx * dt * 0.5;
      b.y += b.vy * dt * 0.5;
      if (bulletHitsBuilding(game, b)) {
        spawnParticles(game, b.x, b.y, { count: 2, speed: 50, life: 0.15, color: '#d7ccc8' });
        alive = false;
        break;
      }
      // Cars
      for (const car of game.cars) {
        if (car.dead && !car.burning) continue;
        if (dist(b.x, b.y, car.x, car.y) < 24) {
          damageCar(car, b.damage * 0.55);
          spawnParticles(game, b.x, b.y, { count: 3, speed: 80, life: 0.18, color: '#ffd166' });
          alive = false;
          break;
        }
      }
      if (!alive) break;
      // People
      const targets = b.from === 'player' ? [...game.peds, ...game.cops] : [...game.peds];
      for (const ped of targets) {
        if (ped.dead) continue;
        if (b.from !== 'player' && ped.kind === 'cop') continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 12) {
          damagePed(game, ped, b.damage, b.from === 'player');
          alive = false;
          break;
        }
      }
      if (!alive) break;
      // The player (only from hostile fire)
      if (b.from !== 'player' && !game.player.dead && !game.player.inCar) {
        if (dist(b.x, b.y, game.player.x, game.player.y) < 13) {
          damagePlayer(game, b.damage);
          alive = false;
        }
      }
    }
    if (alive) kept.push(b);
  }
  game.bullets = kept;
}

export function updateParticles(game, dt) {
  const kept = [];
  for (const p of game.particles) {
    p.life += dt;
    if (p.life >= p.maxLife) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-2.2 * dt);
    p.vy *= Math.exp(-2.2 * dt);
    if (p.type === 'smoke') p.vy -= 26 * dt;
    if (p.grow) p.size += p.grow * dt;
    kept.push(p);
  }
  game.particles = kept;
}

// Hostile pedestrians (mission gunmen): keep some distance and shoot at Rhea.
export function updateHostiles(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    if (!ped.hostile || ped.dead) continue;
    const target = p.inCar || p;
    const d = dist(ped.x, ped.y, target.x, target.y);
    const ang = Math.atan2(target.y - ped.y, target.x - ped.x);
    ped.angle = ang;
    let move = 0;
    if (d > 240) move = 1;
    else if (d < 120) move = -1;
    ped.vx = Math.cos(ang) * move * 120;
    ped.vy = Math.sin(ang) * move * 120;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    ped.walkPhase += dt * 8;
    if (d < 420 && !p.dead) {
      ped.shootCooldown -= dt;
      if (ped.shootCooldown <= 0) {
        ped.shootCooldown = 0.8 + Math.random() * 0.7;
        shootBullet(game, ped.x, ped.y, ang + (Math.random() - 0.5) * 0.1, 'hostile');
        game.audio.shot();
      }
    }
  }
}

export function updatePickups(game, dt) {
  const p = game.player;
  const kept = [];
  for (const pk of game.pickups) {
    pk.bobPhase += dt * 3;
    const near = !p.inCar && dist(p.x, p.y, pk.x, pk.y) < 26;
    if (near) {
      applyPickup(game, pk);
      continue;
    }
    kept.push(pk);
  }
  game.pickups = kept;
}

function applyPickup(game, pk) {
  const p = game.player;
  game.audio.pickup();
  switch (pk.type) {
    case 'cash':
      p.money += pk.amount;
      game.floaters.push({ x: pk.x, y: pk.y, text: `+$${pk.amount}`, life: 0, color: '#7bed9f' });
      break;
    case 'health':
      p.hp = clamp(p.hp + 40, 0, 100);
      game.floaters.push({ x: pk.x, y: pk.y, text: '+Health', life: 0, color: '#ff8fa3' });
      break;
    case 'armor':
      p.armor = clamp(p.armor + 50, 0, 100);
      game.floaters.push({ x: pk.x, y: pk.y, text: '+Armor', life: 0, color: '#8ecae6' });
      break;
    case 'ammo':
      for (const w of ['pistol', 'smg', 'scatter']) if (p.weapons[w]) p.ammo[w] += 30;
      game.floaters.push({ x: pk.x, y: pk.y, text: '+Ammo', life: 0, color: '#ffd166' });
      break;
    case 'pistol':
    case 'smg':
    case 'scatter':
      p.weapons[pk.type] = true;
      p.ammo[pk.type] += pk.amount || 40;
      p.currentWeapon = pk.type;
      game.floaters.push({ x: pk.x, y: pk.y, text: WEAPONS[pk.type].name, life: 0, color: '#ffd166' });
      break;
  }
}
