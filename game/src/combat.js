// combat.js — shooting, punching, bullets, car explosions and the Viper
// gang members who shoot back during the final mission.

import { PLAYER } from './config.js';
import { addHeat } from './police.js';

export function makeBullet(x, y, angle, fromPlayer, damage) {
  return {
    x, y,
    vx: Math.cos(angle) * 900,
    vy: Math.sin(angle) * 900,
    life: 0.7,
    fromPlayer,
    damage,
  };
}

/** Fire the player's pistol toward the mouse. Returns true if a shot left. */
export function playerShoot(game) {
  const p = game.player;
  if (!p.hasPistol || p.ammo <= 0 || p.pistolCooldown > 0) return false;
  p.pistolCooldown = PLAYER.pistolCooldown;
  p.ammo--;
  p.shotsFired = (p.shotsFired || 0) + 1;
  game.save.stats.shotsFired++;
  game.shotsFiredRecently = 1.2;
  const aim = game.aimAngle();
  const ox = p.inCar ? p.inCar.x : p.x;
  const oy = p.inCar ? p.inCar.y : p.y;
  game.bullets.push(makeBullet(
    ox + Math.cos(aim) * 26, oy + Math.sin(aim) * 26,
    aim, true, PLAYER.pistolDamage,
  ));
  game.audio.gunshot();
  game.addMuzzle(ox + Math.cos(aim) * 30, oy + Math.sin(aim) * 30, aim);
  addHeat(game, 8, 'shooting');
  return true;
}

/** A punch in the direction the player faces (or toward the mouse). */
export function playerPunch(game) {
  const p = game.player;
  if (p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  const aim = game.aimAngle();
  const ox = p.inCar ? p.inCar.x : p.x;
  const oy = p.inCar ? p.inCar.y : p.y;
  let hitSomething = false;
  const tryHit = (target, tx, ty) => {
    const dx = tx - ox;
    const dy = ty - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > PLAYER.punchRange + 14) return;
    const ang = Math.atan2(dy, dx);
    let diff = Math.abs(ang - aim);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > PLAYER.punchArc) return;
    target.health -= PLAYER.punchDamage;
    hitSomething = true;
    game.addHitSpark(tx, ty);
  };
  for (const ped of game.peds) {
    if (ped.state !== 'down') tryHit(ped, ped.x, ped.y);
  }
  for (const viper of game.vipers) {
    if (viper.state !== 'down') tryHit(viper, viper.x, viper.y);
  }
  for (const cop of game.cops) tryHit(cop, cop.x, cop.y);
  game.audio.punch();
  if (hitSomething) game.addShake(2);
}

/** Move bullets, test hits against people and cars. */
export function updateBullets(game, dt) {
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) dead = bulletHits(game, b);
    if (dead) game.bullets.splice(i, 1);
  }
}

function bulletHits(game, b) {
  // People first.
  const hitPerson = (t, radius) => {
    if (Math.hypot(t.x - b.x, t.y - b.y) < radius + 6) {
      t.health -= b.damage;
      game.addHitSpark(b.x, b.y);
      return true;
    }
    return false;
  };
  for (const ped of game.peds) {
    if (ped.state !== 'down' && hitPerson(ped, 12)) {
      ped.state = 'down';
      if (b.fromPlayer) addHeat(game, 60, 'shooting a pedestrian');
      return true;
    }
  }
  for (const viper of game.vipers) {
    if (viper.state !== 'down' && hitPerson(viper, 13)) {
      if (viper.health <= 0) {
        viper.state = 'down';
        game.addToast('Viper down', '#ffb02e');
      }
      return true;
    }
  }
  for (const cop of game.cops) {
    if (hitPerson(cop, 12)) {
      if (cop.health <= 0) {
        game.cops.splice(game.cops.indexOf(cop), 1);
        addHeat(game, 260, 'shooting an officer');
      } else {
        addHeat(game, 60, 'shooting an officer');
      }
      return true;
    }
  }
  // The player can be shot by gang members.
  if (!b.fromPlayer) {
    const p = game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    if (Math.hypot(px - b.x, py - b.y) < 18) {
      game.damagePlayer(b.damage * 0.5);
      return true;
    }
  }
  // Cars: bullets dent them, and a wrecked car explodes.
  for (const car of game.cars) {
    const dx = b.x - car.x;
    const dy = b.y - car.y;
    const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
    const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along < 28 && across < 16) {
      car.health -= b.damage;
      game.addHitSpark(b.x, b.y);
      if (car.health <= 0) game.explodeCar(car);
      return true;
    }
  }
  // Buildings stop bullets.
  if (game.cityHits(b.x, b.y, 2)) return true;
  return false;
}

/** Viper gang members: guard their turf, then shoot at the player. */
export function updateVipers(game, dt) {
  const p = game.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  for (const viper of game.vipers) {
    if (viper.state === 'down') continue;
    const dx = px - viper.x;
    const dy = py - viper.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 420) viper.state = 'attack';
    else if (viper.state === 'attack' && dist > 560) viper.state = 'guard';
    if (viper.state !== 'attack') continue;
    viper.angle = Math.atan2(dy, dx);
    viper.shootCooldown -= dt;
    // Strafe closer when far away, hold ground when in range.
    if (dist > 260) {
      viper.x += (dx / dist) * 120 * dt;
      viper.y += (dy / dist) * 120 * dt;
      const fixed = game.cityFix(viper.x, viper.y, 10);
      viper.x = fixed.x;
      viper.y = fixed.y;
    }
    if (viper.shootCooldown <= 0 && dist < 460) {
      viper.shootCooldown = 1.1 + game.rng.float() * 0.9;
      const spread = (game.rng.float() - 0.5) * 0.22;
      game.bullets.push(makeBullet(
        viper.x + Math.cos(viper.angle) * 20,
        viper.y + Math.sin(viper.angle) * 20,
        viper.angle + spread, false, 14,
      ));
      game.audio.gunshot();
      game.addMuzzle(viper.x + Math.cos(viper.angle) * 24, viper.y + Math.sin(viper.angle) * 24, viper.angle);
    }
  }
}
