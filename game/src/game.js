// game.js — the Game: one object holding the whole of Solmar Heat.
// It owns the player, the traffic, the police, the missions and the camera,
// and wires the input, audio, save and render modules together.

import { CAR, CITY, PALETTE, PLAYER, WANTED } from './config.js';
import { RNG } from './rng.js';
import { buildCity, collideBuildings, hitsBuilding, randomRoadPoint } from './city.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadSave, storeSave } from './save.js';
import { makeFootCop, makeParkedCar, makePed, makePlayer, makeTrafficCar } from './entities.js';
import { updatePeds, updateTraffic } from './traffic.js';
import { addHeat, clearWanted, updateWanted } from './police.js';
import { playerPunch, playerShoot, updateBullets, updateVipers } from './combat.js';
import { MissionManager } from './missions.js';
import { drawGame } from './render.js';

const TRAFFIC_COUNT = 26;
const PARKED_COUNT = 14;
const PED_COUNT = 60;

export class Game {
  constructor(canvas, seed) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rng = new RNG(seed);
    this.city = buildCity(seed);
    this.save = loadSave();
    this.audio = new AudioEngine();
    this.audio.setMuted(this.save.settings.muted);
    this.input = new Input(canvas);

    this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'busted' | 'wasted' | 'complete'
    this.stateTimer = 0;
    this.time = 0;
    this.shotsFiredRecently = 0;
    this.shake = 0;

    this.player = makePlayer(660, 1560);
    this.player.cash = this.save.cash;
    this.cars = [];
    this.peds = [];
    this.cops = [];
    this.vipers = [];
    this.bullets = [];
    this.particles = [];
    this.toasts = [];
    this.wanted = { heat: 0, stars: 0, lastCrime: '' };
    this.camera = { x: this.player.x, y: this.player.y, zoom: 1 };
    this.menuDrift = 0;

    this.missions = new MissionManager(this);
    this.populateCity();
  }

  // ---- setup ---------------------------------------------------------------

  populateCity() {
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      this.cars.push(makeTrafficCar(this.rng, this.city));
    }
    for (let i = 0; i < PARKED_COUNT; i++) {
      this.cars.push(makeParkedCar(this.rng, this.city));
    }
    for (let i = 0; i < PED_COUNT; i++) {
      this.peds.push(makePed(this.rng, this.city));
    }
  }

  /** Keep the viewport inside the world so no black band ever shows. */
  clampCamera() {
    const cam = this.camera;
    const hw = this.canvas.width / 2 / cam.zoom;
    const hh = this.canvas.height / 2 / cam.zoom;
    const minX = this.city.worldMin;
    const maxX = this.city.worldMax;
    const minY = this.city.worldMin;
    const maxY = this.city.worldBottom;
    cam.x = hw * 2 >= maxX - minX
      ? (minX + maxX) / 2
      : Math.max(minX + hw, Math.min(maxX - hw, cam.x));
    cam.y = hh * 2 >= maxY - minY
      ? (minY + maxY) / 2
      : Math.max(minY + hh, Math.min(maxY - hh, cam.y));
  }

  persistSave() {
    this.save.cash = this.player.cash;
    storeSave(this.save);
  }

  // ---- helpers the other modules call --------------------------------------

  cityFix(x, y, r) {
    return collideBuildings(this.city, x, y, r);
  }

  cityHits(x, y, r) {
    return hitsBuilding(this.city, x, y, r);
  }

  addToast(text, color) {
    this.toasts.push({ text, color: color || '#f5f2e8', life: 4 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  addShake(amount) {
    this.shake = Math.min(12, this.shake + amount);
  }

  addHitSpark(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = this.rng.angle();
      const s = this.rng.range(60, 220);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.35, maxLife: 0.35, color: '#ffd94a', size: 3,
      });
    }
  }

  addMuzzle(x, y, angle) {
    this.particles.push({
      x, y, vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40,
      life: 0.07, maxLife: 0.07, color: '#ffe9a0', size: 9,
    });
  }

  addSmoke(x, y) {
    this.particles.push({
      x, y, vx: this.rng.range(-12, 12), vy: this.rng.range(-24, -6),
      life: 0.6, maxLife: 0.6, color: 'rgba(200,200,200,0.5)', size: 7,
    });
  }

  /** World position of the mouse cursor, for aiming. */
  aimAngle() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const wx = this.camera.x + (this.input.mouse.x - w / 2) / this.camera.zoom;
    const wy = this.camera.y + (this.input.mouse.y - h / 2) / this.camera.zoom;
    const p = this.player;
    const ox = p.inCar ? p.inCar.x : p.x;
    const oy = p.inCar ? p.inCar.y : p.y;
    return Math.atan2(wy - oy, wx - ox);
  }

  // ---- state changes ---------------------------------------------------------

  startPlaying() {
    this.audio.ensure();
    this.audio.startMusic();
    if (this.state === 'menu') {
      this.state = 'playing';
      if (!this.missions.done && !this.missions.active) {
        this.missions.startMission(this.missions.index);
      }
      this.addToast('Welcome to Solmar City — follow the yellow marker', '#ffb02e');
    }
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.stateTimer = 0;
    this.audio.setSiren(false);
    this.audio.stopMusic();
    const fine = Math.min(this.player.cash, 150);
    this.player.cash -= fine;
    this.save.cash = this.player.cash;
    this.persistSave();
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.stateTimer = 0;
    this.audio.setSiren(false);
    this.audio.stopMusic();
    const loss = Math.min(this.player.cash, 200);
    this.player.cash -= loss;
    this.save.cash = this.player.cash;
    this.persistSave();
  }

  storyComplete() {
    this.state = 'complete';
    this.stateTimer = 0;
    this.audio.fanfare();
  }

  /** Respawn after being busted or wasted: hospital, clean slate. */
  respawn() {
    const L = this.city.landmarks.hospital;
    const p = this.player;
    p.x = L.x + 40;
    p.y = L.y + 40;
    p.health = p.maxHealth;
    p.inCar = null;
    p.angle = -Math.PI / 2;
    clearWanted(this);
    this.cops.length = 0;
    this.bullets.length = 0;
    this.vipers.length = 0;
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.state = 'playing';
    this.audio.startMusic();
    this.addToast('You woke up at Solmar General. The city is still yours.', '#f5f2e8');
  }

  damagePlayer(amount) {
    const p = this.player;
    if (this.state !== 'playing' || p.health <= 0) return;
    p.health -= amount;
    p.regenDelay = 6;
    this.addShake(4);
    if (p.health <= 0) {
      p.health = 0;
      if (p.inCar) this.explodeCar(p.inCar);
      else this.wasted();
    }
  }

  explodeCar(car) {
    if (car.dead) return;
    car.dead = true;
    car.health = 0;
    this.audio.explosion();
    this.addShake(10);
    for (let i = 0; i < 26; i++) {
      const a = this.rng.angle();
      const s = this.rng.range(40, 320);
      this.particles.push({
        x: car.x, y: car.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: this.rng.range(0.4, 1.1), maxLife: 1.1,
        color: this.rng.pick(['#ff8a2a', '#ffb02e', '#3a3a3a', '#e03a2f']),
        size: this.rng.range(4, 10),
      });
    }
    if (this.player.inCar === car) {
      this.player.inCar = null;
      this.player.x = car.x + 40;
      this.player.y = car.y;
      this.damagePlayer(35);
    }
    // A burning wreck stays on the street for a while, then is towed.
    car.wreckTimer = 12;
  }

  // ---- interaction -----------------------------------------------------------

  nearestCar(maxDist) {
    const p = this.player;
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  tryEnterCar() {
    const p = this.player;
    if (p.inCar) {
      // Get out.
      const car = p.inCar;
      car.driver = null;
      car.parked = true;
      car.speed = 0;
      p.inCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      const fixed = this.cityFix(p.x, p.y, 13);
      p.x = fixed.x;
      p.y = fixed.y;
      return;
    }
    const car = this.nearestCar(CAR.stealRadius);
    if (!car) return;
    if (car.driver === 'traffic') {
      // Yank the driver out: they run off, and the law notices.
      const fleeing = makePed(this.rng, this.city);
      fleeing.x = car.x + 30;
      fleeing.y = car.y + 20;
      fleeing.state = 'flee';
      fleeing.panic = 2;
      this.peds.push(fleeing);
      this.save.stats.carsStolen++;
      addHeat(this, WANTED.heatStealCar, 'stealing a car');
      this.addToast(`You stole the ${car.model}`, '#ffb02e');
    } else if (car.driver === 'police') {
      this.addToast('That car belongs to the Solmar PD. Bad idea.', '#e03a2f');
      return;
    } else {
      this.save.stats.carsStolen++;
      addHeat(this, 60, 'stealing a parked car');
      this.addToast(`You took the ${car.model}`, '#ffb02e');
    }
    car.driver = 'player';
    car.parked = false;
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
  }

  // ---- per-frame update ------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 22);
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }

    if (this.state === 'menu') {
      this.menuDrift += dt;
      this.camera.x = 1200 + Math.cos(this.menuDrift * 0.08) * 420;
      this.camera.y = 1200 + Math.sin(this.menuDrift * 0.06) * 340;
      this.camera.zoom = 0.62;
      this.clampCamera();
      updateTraffic(this, dt);
      updatePeds(this, dt);
      this.updateParticles(dt);
      return;
    }
    if (this.state === 'paused') return;
    if (this.state === 'busted' || this.state === 'wasted' || this.state === 'complete') {
      this.stateTimer += dt;
      this.updateParticles(dt);
      if (this.input.pressed('Enter') || this.input.pressed('Space') || this.input.mouse.clicked) {
        if (this.state === 'complete') {
          this.state = 'playing';
          this.audio.startMusic();
        } else if (this.stateTimer > 1.2) {
          this.respawn();
        }
      }
      return;
    }

    // --- playing ---
    const input = this.input;
    if (input.pressed('Escape')) {
      this.state = 'paused';
      return;
    }
    if (input.pressed('KeyM')) {
      this.save.settings.muted = !this.save.settings.muted;
      this.audio.setMuted(this.save.settings.muted);
      this.persistSave();
      this.addToast(this.save.settings.muted ? 'Sound off (M to turn on)' : 'Sound on', '#f5f2e8');
    }
    if (input.pressed('KeyE')) this.tryEnterCar();
    if (input.pressed('KeyF')) playerPunch(this);
    if (input.mouse.clicked) {
      if (this.player.hasPistol && this.player.ammo > 0) playerShoot(this);
      else playerPunch(this);
    }

    this.updatePlayer(dt);
    updateTraffic(this, dt);
    updatePeds(this, dt);
    updateWanted(this, dt);
    updateVipers(this, dt);
    updateBullets(this, dt);
    this.updateParticles(dt);
    this.updateCarCollisions(dt);
    this.missions.update(dt);

    // Cooldowns and slow health regen.
    const p = this.player;
    p.pistolCooldown = Math.max(0, p.pistolCooldown - dt);
    p.punchCooldown = Math.max(0, p.punchCooldown - dt);
    p.regenDelay = Math.max(0, p.regenDelay - dt);
    if (p.regenDelay <= 0 && p.health > 0 && p.health < p.maxHealth) {
      p.health = Math.min(p.maxHealth, p.health + 4 * dt);
    }

    // Wrecked cars get towed after a while.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.dead && car.wreckTimer !== undefined) {
        car.wreckTimer -= dt;
        if (car.wreckTimer <= 0) {
          this.cars.splice(i, 1);
          if (this.cars.filter((c) => !c.police).length < 34) {
            this.cars.push(makeTrafficCar(this.rng, this.city));
          }
        }
      }
    }

    // Camera follows the player, zooming out a little at speed.
    const target = p.inCar ? p.inCar : p;
    const speed = p.inCar ? Math.abs(p.inCar.speed) : 0;
    const zoomTarget = p.inCar ? 0.92 - Math.min(0.12, speed / 560 * 0.12) : 1;
    this.camera.zoom += (zoomTarget - this.camera.zoom) * Math.min(1, dt * 2);
    const lookAhead = 26;
    const tx = target.x + Math.cos(target.angle) * lookAhead * (p.inCar ? 1 : 0);
    const ty = target.y + Math.sin(target.angle) * lookAhead * (p.inCar ? 1 : 0);
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 5);
    this.clampCamera();

    // Engine hum follows the car; siren follows the wanted level.
    this.audio.setEngine(p.inCar ? Math.abs(p.inCar.speed) : 0, !!p.inCar);
    this.audio.setSiren(this.wanted.stars > 0);
  }

  updatePlayer(dt) {
    const p = this.player;
    const input = this.input;
    if (p.inCar) {
      this.updateDriving(p.inCar, dt);
      p.x = p.inCar.x;
      p.y = p.inCar.y;
      p.angle = p.inCar.angle;
      this.save.stats.distanceDriven += Math.abs(p.inCar.speed) * dt / 4;
      return;
    }
    const mv = input.moveVector();
    const len = Math.hypot(mv.x, mv.y);
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    p.moving = len > 0;
    if (len > 0) {
      p.x += (mv.x / len) * speed * dt;
      p.y += (mv.y / len) * speed * dt;
      p.angle = Math.atan2(mv.y, mv.x);
    }
    // Keep the player out of buildings and out of the sea.
    const fixed = this.cityFix(p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    if (p.y > this.city.waterTop - 12) p.y = this.city.waterTop - 12;
    p.x = Math.max(this.city.worldMin, Math.min(this.city.worldMax, p.x));
    p.y = Math.max(this.city.worldMin, Math.min(this.city.worldBottom, p.y));
  }

  updateDriving(car, dt) {
    const input = this.input;
    const forward = input.down('KeyW') || input.down('ArrowUp') || this.autoDrive;
    const back = input.down('KeyS') || input.down('ArrowDown');
    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');

    if (forward) car.speed += CAR.accel * dt;
    if (back) {
      if (car.speed > 10) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (!forward && !back) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
    }
    car.speed = Math.max(-180, Math.min(car.maxSpeed, car.speed));

    const steerInput = (left ? -1 : 0) + (right ? 1 : 0);
    const speedFactor = Math.min(1, Math.abs(car.speed) / 200);
    car.angle += steerInput * CAR.turnRate * speedFactor * dt * Math.sign(car.speed || 1);
    if (Math.abs(steerInput) > 0 && Math.abs(car.speed) > 300 && this.rng.chance(0.4)) {
      this.addSmoke(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20);
    }

    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    // Buildings stop cars; the sea stops them too.
    const before = { x: car.x, y: car.y };
    const fixed = this.cityFix(car.x, car.y, 21);
    car.x = fixed.x;
    car.y = fixed.y;
    if ((fixed.x !== before.x || fixed.y !== before.y) && Math.abs(car.speed) > 120) {
      car.health -= Math.abs(car.speed) * 0.03;
      car.speed *= 0.45;
      this.addShake(3);
      if (car.health <= 0) this.explodeCar(car);
    }
    if (car.y > this.city.waterTop - 14) {
      car.y = this.city.waterTop - 14;
      car.speed *= 0.5;
    }
    car.x = Math.max(this.city.worldMin, Math.min(this.city.worldMax, car.x));
    car.y = Math.max(this.city.worldMin, Math.min(this.city.worldBottom, car.y));

    // Running over pedestrians is a crime, and it is noticed.
    if (Math.abs(car.speed) > 140) {
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
          ped.state = 'down';
          addHeat(this, WANTED.heatHitPed, 'hitting a pedestrian');
          this.addToast('You hit a pedestrian!', '#e03a2f');
          this.addShake(3);
          car.speed *= 0.8;
        }
      }
    }
  }

  /** Car-to-car bumps: oriented-box overlap (a car is 52 long, 26 wide),
      so cars passing in the next lane do not count as a crash. */
  updateCarCollisions(dt) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (a.dead || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 52 || d < 0.01) continue;
        const alongA = Math.abs(dx * Math.cos(a.angle) + dy * Math.sin(a.angle));
        const acrossA = Math.abs(-dx * Math.sin(a.angle) + dy * Math.cos(a.angle));
        const alongB = Math.abs(dx * Math.cos(b.angle) + dy * Math.sin(b.angle));
        const acrossB = Math.abs(-dx * Math.sin(b.angle) + dy * Math.cos(b.angle));
        if (alongA >= 48 || acrossA >= 24 || alongB >= 48 || acrossB >= 24) continue;
        const push = (44 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        if (a.driver !== 'player') { a.x -= nx * push; a.y -= ny * push; }
        if (b.driver !== 'player') { b.x += nx * push; b.y += ny * push; }
        if (a.driver === 'player' || b.driver === 'player') {
          const playerCar = a.driver === 'player' ? a : b;
          const other = a.driver === 'player' ? b : a;
          const impact = Math.abs(playerCar.speed) + Math.abs(other.speed || 0);
          if (impact > 260) {
            playerCar.health -= impact * 0.02;
            other.health -= impact * 0.015;
            this.addShake(2);
            if (other.police) addHeat(this, WANTED.heatRamCop, 'ramming a police car');
            if (playerCar.health <= 0) this.explodeCar(playerCar);
            if (other.health <= 0) this.explodeCar(other);
          }
          playerCar.speed *= 0.7;
        }
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - 2 * dt;
      pt.vy *= 1 - 2 * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    drawGame(this.ctx, this, w, h);
  }
}
