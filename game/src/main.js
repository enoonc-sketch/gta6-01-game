// CINDER BAY — boot, game state, the main loop, player control on foot and
// behind the wheel, shops, screens (title / pause / help / wasted / busted)
// and the screenshot staging used with ?shot=<name>.

import { WORLD_W, WORLD_H, PLAYER, CAR, TRAFFIC, PEDS, WANTED, WEAPONS, PRICES } from './config.js';
import { makeRng, clamp, dist, lerp, angleLerp, formatMoney, formatClock } from './rng.js';
import { buildCity, districtNameAt, randomRoadPoint, sidewalkRing, WATER_Y } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { makePlayer, makeCar, makePed, makePickup, stepCarPhysics, collideCar, collideWithCity, damageCar, carSpeed } from './entities.js';
import { initTrafficAI, updateTrafficCar, updatePed, pedFleeFrom } from './traffic.js';
import { updatePolice, addHeat, clearWanted, wantedStars, spawnRoadblock } from './police.js';
import { playerShoot, updateBullets, updateParticles, updateHostiles, updatePickups, damagePed, damagePlayer, explodeCar, spawnParticles } from './combat.js';
import { STORY, startMission, failMission, startSideJob, updateMissions } from './missions.js';
import { makeWeather, updateWeather, rainGrip } from './weather.js';
import { RACES, raceAt, startRace, updateRace } from './activities.js';
import { createRenderer } from './render.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';

const canvas = document.getElementById('game');
const minimapCanvas = document.getElementById('minimap');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);

const game = {
  rng: makeRng(SEED * 7919 + 13),
  city: buildCity(SEED),
  player: null,
  cars: [],
  peds: [],
  cops: [],
  bullets: [],
  particles: [],
  pickups: [],
  skids: [],
  floaters: [],
  heat: 0,
  bust: 0,
  clock: 10,
  time: 0,
  state: 'title',
  camera: { x: 2400, y: 2400, zoom: 1 },
  objective: null,
  banner: null,
  story: { index: 0, stage: 0, active: false, data: {}, timer: 0 },
  job: null,
  race: null,
  roadblocks: [],
  heli: null,
  weather: null,
  stats: {
    jobsDone: 0,
    carsStolen: 0,
    busted: 0,
    deaths: 0,
    racesWon: 0,
    topSpeed: 0,
    moneyEarned: 0,
    raceBest: {},
    _lastMoney: 120,
  },
  shake: 0,
  hurtFlash: 0,
  policeSpawnTimer: 0,
  spawnTimer: 0,
  saveDirty: false,
  shopOpen: false,
  audio,
  onPlayerDeath,
  onBusted,
};

game.player = makePlayer(7 * 320 + 60, 7 * 320 + 200);
game.weather = makeWeather(game.rng);
game.camera.x = game.player.x;
game.camera.y = game.player.y;

// ------------------------------------------------------------------ helpers

function playerPos() {
  const p = game.player;
  return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
}

function nearestCar(x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of game.cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function spawnParkedCars() {
  const spots = [...game.city.parkedSpots];
  for (let i = 0; i < 42 && spots.length; i++) {
    const idx = Math.floor(game.rng.next() * spots.length);
    const s = spots.splice(idx, 1)[0];
    game.cars.push(makeCar(s.x, s.y, s.angle, game.rng, { driver: null }));
  }
}

function spawnAmbient(dt) {
  game.spawnTimer -= dt;
  if (game.spawnTimer > 0) return;
  game.spawnTimer = 0.4;
  const pp = playerPos();
  const traffic = game.cars.filter((c) => c.driver === 'traffic' && !c.dead);
  if (traffic.length < TRAFFIC.targetCars) {
    for (let tries = 0; tries < 8; tries++) {
      const p = randomRoadPoint(game.rng);
      const d = dist(p.x, p.y, pp.x, pp.y);
      if (d < TRAFFIC.spawnRadiusMin || d > TRAFFIC.spawnRadiusMax) continue;
      const car = makeCar(p.x, p.y, 0, game.rng, { driver: 'traffic' });
      initTrafficAI(car, game.rng);
      game.cars.push(car);
      break;
    }
  }
  const pedsAlive = game.peds.filter((p) => !p.dead && !p.hostile);
  if (pedsAlive.length < PEDS.target) {
    const i = clamp(Math.floor(pp.x / 320) + game.rng.int(-3, 3), 0, 14);
    const j = clamp(Math.floor(pp.y / 320) + game.rng.int(-3, 3), 0, 13);
    const ring = sidewalkRing(i, j);
    const spot = ring[game.rng.int(0, 3)];
    if (dist(spot.x, spot.y, pp.x, pp.y) > 380) {
      game.peds.push(makePed(spot.x, spot.y, game.rng));
    }
  }
  // Despawn far ambient entities (never mission actors).
  game.cars = game.cars.filter((c) => {
    if (c.driver === 'traffic' && dist(c.x, c.y, pp.x, pp.y) > TRAFFIC.despawnRadius) return false;
    if (c.dead && !c.burning && dist(c.x, c.y, pp.x, pp.y) > 900) return false;
    return true;
  });
  game.peds = game.peds.filter((p) => {
    if (p.hostile) return !p.dead || p.downTimer < 6;
    if (p.dead) return p.downTimer < 8;
    return dist(p.x, p.y, pp.x, pp.y) < 1500;
  });
}

// ------------------------------------------------------------------ player

function updatePlayerOnFoot(dt) {
  const p = game.player;
  const mv = input.moveVector();
  const sprint = input.isDown('ShiftLeft', 'ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  p.vx = mv.x * speed;
  p.vy = mv.y * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (mv.x !== 0 || mv.y !== 0) {
    p.angle = Math.atan2(mv.y, mv.x);
    p.walkPhase += dt * (sprint ? 13 : 9);
  }
  collideWithCity(p, p.radius, game.city.solids, game.city.props);

  // Aim at the mouse in world space.
  const wx = game.camera.x + (input.mouse.x - canvas.width / 2) / game.camera.zoom;
  const wy = game.camera.y + (input.mouse.y - canvas.height / 2) / game.camera.zoom;
  p.aimAngle = Math.atan2(wy - p.y, wx - p.x);
  if (input.mouse.down || input.isDown('Space')) p.angle = p.aimAngle;

  p.fireCooldown -= dt;
  const w = WEAPONS[p.currentWeapon];
  const wantFire = w.auto ? input.mouse.down : input.takeMousePress();
  if ((wantFire || input.isDown('Space')) && p.fireCooldown <= 0) {
    p.fireCooldown = w.cooldown;
    playerShoot(game);
  }
  p.punchAnim = Math.max(0, p.punchAnim - dt * 4);

  // Weapon switching.
  const order = ['fists', 'pistol', 'smg', 'scatter'];
  const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
  for (let i = 0; i < 4; i++) {
    if (input.takePress(keys[i]) && p.weapons[order[i]]) p.currentWeapon = order[i];
  }
  if (input.takePress('KeyQ')) {
    const owned = order.filter((w2) => p.weapons[w2]);
    const idx = owned.indexOf(p.currentWeapon);
    p.currentWeapon = owned[(idx + 1) % owned.length];
  }
}

function enterCar(car) {
  const p = game.player;
  if (car.driver === 'traffic') {
    // Carjacking: the driver bails out and runs.
    const driver = makePed(car.x + 20, car.y, game.rng);
    game.peds.push(driver);
    pedFleeFrom(driver, p.x, p.y, 3);
    addHeat(game, WANTED.crimeHeat.stealCar);
    game.stats.carsStolen++;
  }
  car.driver = 'player';
  car.ai = null;
  p.inCar = car;
  audio.door();
}

function exitCar() {
  const p = game.player;
  const car = p.inCar;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 30;
  p.y = car.y + Math.sin(side) * 30;
  p.vx = 0;
  p.vy = 0;
  car.driver = null;
  p.inCar = null;
  audio.door();
}

function updatePlayerDriving(dt) {
  const p = game.player;
  const car = p.inCar;
  const throttle = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) + (input.isDown('KeyS', 'ArrowDown') ? -1 : 0);
  const steer = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) + (input.isDown('KeyA', 'ArrowLeft') ? -1 : 0);
  stepCarPhysics(car, {
    throttle,
    steer,
    brake: input.isDown('KeyS', 'ArrowDown') && car.speed > 30,
    handbrake: input.isDown('Space'),
    gripMul: rainGrip(game),
  }, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (input.takePress('KeyH')) audio.horn();

  // Skid marks while drifting or braking hard.
  const lat = Math.abs(-Math.sin(car.angle) * car.vx + Math.cos(car.angle) * car.vy);
  if ((lat > 60 || (input.isDown('Space') && Math.abs(car.speed) > 90)) && Math.abs(car.speed) > 60) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const off of [-9, 9]) {
      game.skids.push({
        x: car.x - fx * 16 - fy * off,
        y: car.y - fy * 16 + fx * off,
        angle: car.angle,
        life: 6,
      });
    }
  }
}

function carCollisions(dt) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead && !a.burning) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead && !b.burning) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 40 && d > 0.01) {
        const push = (40 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        if (rel > 70) {
          damageCar(a, (rel - 70) * 0.09);
          damageCar(b, (rel - 70) * 0.09);
          spawnParticles(game, (a.x + b.x) / 2, (a.y + b.y) / 2, { count: 6, speed: 120, life: 0.25, color: '#ffd166' });
          const pp = playerPos();
          if (dist(pp.x, pp.y, a.x, a.y) < 420) audio.crash(rel / 300);
          if ((a.driver === 'player' || b.driver === 'player') && wantedStars(game) >= 0) {
            if (a.police || b.police) addHeat(game, WANTED.crimeHeat.hitCar * 2);
            else addHeat(game, WANTED.crimeHeat.hitCar);
          }
          const tmpVx = a.vx;
          const tmpVy = a.vy;
          a.vx = b.vx * 0.6;
          a.vy = b.vy * 0.6;
          b.vx = tmpVx * 0.6;
          b.vy = tmpVy * 0.6;
        }
      }
    }
  }
  // Cars versus people.
  for (const car of cars) {
    const sp = carSpeed(car);
    if (sp < 60) continue;
    for (const ped of [...game.peds, ...game.cops]) {
      if (ped.dead) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 24) {
        damagePed(game, ped, sp * 0.35, car.driver === 'player');
        ped.x += car.vx * 0.06;
        ped.y += car.vy * 0.06;
        if (car.driver === 'player') game.shake = Math.max(game.shake, 0.25);
      }
    }
    // Police cars can run Rhea down too.
    const p = game.player;
    if (!p.inCar && !p.dead && dist(car.x, car.y, p.x, p.y) < 24) {
      damagePlayer(game, sp * 0.22);
      p.x += car.vx * 0.05;
      p.y += car.vy * 0.05;
    }
  }
}

function updateCars(dt) {
  for (const car of game.cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, game, dt);
    else if (car.driver === 'player') {
      const impact = collideCar(car, game.city.solids, game.city.props);
      if (impact > 140) {
        damageCar(car, (impact - 140) * 0.07);
        audio.crash(impact / 320);
        game.shake = Math.max(game.shake, 0.35);
        spawnParticles(game, car.x, car.y, { count: 5, speed: 110, life: 0.2, color: '#ffd166' });
      }
    } else if (car.driver === null && carSpeed(car) > 1) {
      stepCarPhysics(car, { throttle: 0, steer: 0, brake: true, handbrake: false }, dt);
      collideCar(car, game.city.solids, game.city.props);
    }
    // Damage smoke and fire.
    if (!car.dead && car.hp < 55) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = car.hp < 28 ? 0.05 : 0.14;
        spawnParticles(game, car.x + Math.cos(car.angle) * 16, car.y + Math.sin(car.angle) * 16, {
          count: 1, speed: 14, life: 0.9, size: 5, color: car.hp < 28 ? '#ff7b3f' : '#666', type: 'smoke', grow: 10,
        });
      }
    }
    if (car.dead && car.burning && !car.exploded) {
      car.burnTimer = (car.burnTimer || 0) + dt;
      spawnParticles(game, car.x, car.y, { count: 2, speed: 30, life: 0.5, size: 8, color: '#ff9f43', type: 'flash' });
      if (car.burnTimer > 1.3) {
        if (game.player.inCar === car) {
          exitCar();
          damagePlayer(game, 25);
        }
        explodeCar(game, car);
      }
    }
  }
  carCollisions(dt);
}

// ------------------------------------------------------------------ shops & interactions

const $ = (id) => document.getElementById(id);

function interactionPrompt() {
  const p = game.player;
  const pp = playerPos();
  const places = game.city.places;
  if (!p.inCar && !game.story.active && game.story.index < STORY.length) {
    if (dist(pp.x, pp.y, places.diner.x, places.diner.y) < 52) return { text: 'E — Talk to Old Tomas (next job)', action: 'mission' };
  }
  if (!p.inCar && dist(pp.x, pp.y, places.gunShop.x, places.gunShop.y) < 52) return { text: 'E — Cinder Arms (buy gear)', action: 'shop' };
  if (!p.inCar && dist(pp.x, pp.y, places.pharmacy.x, places.pharmacy.y) < 52) return { text: 'E — Bayview Pharmacy (health & supplies)', action: 'pharmacy' };
  if (!p.inCar && dist(pp.x, pp.y, places.hospital.x, places.hospital.y) < 52) return { text: 'E — Patch up ($50)', action: 'heal' };
  if (p.inCar && dist(pp.x, pp.y, places.respray.x, places.respray.y) < 70) {
    return { text: `E — Milo's Respray ($${PRICES.respray}: clear heat, repair)`, action: 'respray' };
  }
  if (p.inCar && dist(pp.x, pp.y, places.garage.x, places.garage.y) < 70) {
    const cost = Math.ceil((100 - p.inCar.hp) * PRICES.repairPerHp);
    return { text: cost > 0 ? `E — Harbor Customs (repair $${cost})` : 'E — Harbor Customs (car is mint)', action: 'garage', cost };
  }
  if (p.inCar && !game.race && !game.story.active && !game.job) {
    const race = raceAt(pp.x, pp.y);
    if (race) return { text: `E — Start race: ${race.name} (gold $${race.pay[0]})`, action: 'race', race };
  }
  if (!game.job && !game.story.active && !game.race) {
    for (const b of places.phoneBooths) {
      if (dist(pp.x, pp.y, b.x, b.y) < 40) return { text: 'E — Side job (phone booth)', action: 'job' };
    }
  }
  if (!p.inCar) {
    const car = nearestCar(pp.x, pp.y, PLAYER.enterCarRange);
    if (car) return { text: `E — ${car.driver === 'traffic' ? 'Take' : 'Enter'} ${car.name}`, action: 'car', car };
  } else {
    return { text: 'E — Get out', action: 'exit' };
  }
  return null;
}

function doInteract(prompt) {
  const p = game.player;
  if (!prompt) return;
  if (prompt.action === 'car') enterCar(prompt.car);
  else if (prompt.action === 'exit') exitCar();
  else if (prompt.action === 'mission') startMission(game);
  else if (prompt.action === 'job') startSideJob(game);
  else if (prompt.action === 'shop') openShop('guns');
  else if (prompt.action === 'pharmacy') openShop('pharmacy');
  else if (prompt.action === 'race') startRace(game, prompt.race);
  else if (prompt.action === 'garage') {
    const car = p.inCar;
    if (car && prompt.cost > 0 && p.money >= prompt.cost) {
      p.money -= prompt.cost;
      car.hp = 100;
      audio.cash();
      game.banner = { title: 'Harbor Customs', lines: [`Repaired for $${prompt.cost}. Good as new.`], t: 0 };
      game.saveDirty = true;
    } else if (car && prompt.cost > 0) {
      game.banner = { title: 'Harbor Customs', lines: [`You need $${prompt.cost} for that repair.`], t: 0 };
    }
  }
  else if (prompt.action === 'heal') {
    if (p.money >= 50 && p.hp < 100) {
      p.money -= 50;
      p.hp = 100;
      audio.pickup();
      game.saveDirty = true;
    }
  } else if (prompt.action === 'respray') {
    const car = p.inCar;
    if (car && p.money >= PRICES.respray) {
      p.money -= PRICES.respray;
      clearWanted(game);
      car.hp = 100;
      car.color = game.rng.pick(['#148f77', '#7d3c98', '#c0392b', '#2e6da4', '#f39c12']);
      audio.cash();
      game.banner = { title: "Milo's Respray", lines: ['Heat gone. Fresh paint, full tank.'], t: 0 };
      game.saveDirty = true;
    } else if (car) {
      game.banner = { title: "Milo's Respray", lines: [`You need $${PRICES.respray}.`], t: 0 };
    }
  }
}

function openShop(kind) {
  game.shopOpen = true;
  game.state = 'shop';
  $(kind === 'pharmacy' ? 'pharmacy-menu' : 'shop-menu').classList.remove('hidden');
  refreshShop();
}

function closeShop() {
  game.shopOpen = false;
  game.state = 'play';
  $('shop-menu').classList.add('hidden');
  $('pharmacy-menu').classList.add('hidden');
}

function refreshShop() {
  const p = game.player;
  $('shop-cash').textContent = formatMoney(p.money);
  $('pharmacy-cash').textContent = formatMoney(p.money);
  const rows = [
    ['pistol', 'P9 Pistol', PRICES.pistol],
    ['smg', 'Kestrel SMG', PRICES.smg],
    ['scatter', 'Scattergun', PRICES.scatter],
  ];
  for (const [key, label, price] of rows) {
    const btn = $(`buy-${key}`);
    if (!btn) continue;
    btn.textContent = p.weapons[key] ? `${label} — owned (ammo ${p.ammo[key]})` : `${label} — $${price}`;
    btn.disabled = p.weapons[key] || p.money < price;
  }
  $('buy-ammo').disabled = p.money < PRICES.ammoBox;
  $('buy-armor').disabled = p.money < PRICES.armor || p.armor >= 100;
  $('buy-health').textContent = `Health pack (full heal) — $${PRICES.healthPack}`;
  $('buy-health').disabled = p.money < PRICES.healthPack || p.hp >= 100;
  $('buy-ammo2').disabled = p.money < PRICES.ammoBox;
  $('buy-armor2').disabled = p.money < PRICES.armor || p.armor >= 100;
}

function buyItem(key) {
  const p = game.player;
  if (key === 'ammo' || key === 'ammo2') {
    if (p.money < PRICES.ammoBox) return;
    p.money -= PRICES.ammoBox;
    for (const w of ['pistol', 'smg', 'scatter']) if (p.weapons[w]) p.ammo[w] += 60;
  } else if (key === 'armor' || key === 'armor2') {
    if (p.money < PRICES.armor) return;
    p.money -= PRICES.armor;
    p.armor = 100;
  } else if (key === 'health') {
    if (p.money < PRICES.healthPack || p.hp >= 100) return;
    p.money -= PRICES.healthPack;
    p.hp = 100;
  } else {
    const price = PRICES[key];
    if (p.money < price || p.weapons[key]) return;
    p.money -= price;
    p.weapons[key] = true;
    p.ammo[key] += key === 'smg' ? 120 : 48;
    p.currentWeapon = key;
  }
  audio.cash();
  game.saveDirty = true;
  refreshShop();
}

// ------------------------------------------------------------------ death & bust

function onPlayerDeath() {
  if (game.state !== 'play') return;
  game.state = 'dead';
  game.stats.deaths++;
  failMission(game, 'Rhea went down.');
  game.job = null;
  game.race = null;
  showEndScreen('WASTED', 'St. Brigid General patches you up — for a fee.');
}

function onBusted() {
  if (game.state !== 'play') return;
  game.state = 'busted';
  game.stats.busted++;
  failMission(game, 'The law caught up.');
  game.job = null;
  game.race = null;
  showEndScreen('BUSTED', 'Cinder Bay PD lets you walk — after bail.');
}

function statsRows() {
  const s = game.stats;
  const p = game.player;
  const bestLines = RACES.map((r) => {
    const b = s.raceBest[r.id];
    return [r.name, b ? `${b.toFixed(1)}s` : '—'];
  });
  return [
    ['Cash', formatMoney(p.money)],
    ['Cash earned', formatMoney(s.moneyEarned)],
    ['Story jobs done', `${game.story.index} / ${STORY.length}`],
    ['Side jobs done', String(s.jobsDone)],
    ['Races won', String(s.racesWon)],
    ...bestLines,
    ['Cars stolen', String(s.carsStolen)],
    ['Top speed', `${Math.round(s.topSpeed * 0.36)} km/h`],
    ['Lucky shells', `${game.city.shells.filter((sh) => sh.taken).length} / 20`],
    ['Times busted', String(s.busted)],
    ['Times wasted', String(s.deaths)],
  ];
}

function fillStats(elId) {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = statsRows()
    .map(([k, v]) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`)
    .join('');
}

function showEndScreen(title, line) {
  $('end-title').textContent = title;
  $('end-line').textContent = line;
  fillStats('end-stats');
  $('end-screen').classList.remove('hidden');
}

function respawn(kind) {
  const p = game.player;
  $('end-screen').classList.add('hidden');
  if (p.inCar) exitCar();
  const place = kind === 'dead' ? game.city.places.hospital : game.city.places.police;
  p.x = place.x;
  p.y = place.y + 10;
  p.hp = 100;
  p.dead = false;
  p.money = Math.max(0, p.money - (kind === 'dead' ? PRICES.hospitalFee : PRICES.bailFee));
  clearWanted(game);
  game.cops = [];
  for (const car of game.cars) if (car.police) { car.police = false; car.driver = null; }
  game.state = 'play';
  game.saveDirty = true;
}

// ------------------------------------------------------------------ HUD

function updateHud() {
  const p = game.player;
  $('hud-money').textContent = formatMoney(p.money);
  $('hud-clock').textContent = formatClock(game.clock);
  $('hud-district').textContent = districtNameAt(p.x, p.y);
  const stars = wantedStars(game);
  $('hud-stars').textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';
  $('hud-stars').style.display = stars > 0 ? '' : 'none';
  $('hp-fill').style.width = `${clamp(p.hp, 0, 100)}%`;
  $('armor-fill').style.width = `${clamp(p.armor, 0, 100)}%`;
  const w = WEAPONS[p.currentWeapon];
  $('hud-weapon').textContent = p.currentWeapon === 'fists' ? 'Fists' : `${w.name} · ${p.ammo[p.currentWeapon]}`;
  $('hud-speed').textContent = p.inCar ? `${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h` : '';
  $('hud-shells').textContent = `Shells ${game.city.shells.filter((s) => s.taken).length}/20`;
  const obj = $('hud-objective');
  if (game.objective) {
    obj.textContent = game.objective.text;
    obj.style.display = '';
  } else {
    obj.style.display = 'none';
  }
  const bustEl = $('bust-wrap');
  bustEl.style.display = game.bust > 0.03 ? '' : 'none';
  $('bust-fill').style.width = `${game.bust * 100}%`;
  const prompt = game.state === 'play' ? interactionPrompt() : null;
  const promptEl = $('hud-prompt');
  promptEl.textContent = prompt ? prompt.text : '';
  promptEl.style.display = prompt ? '' : 'none';
  game.currentPrompt = prompt;

  const banner = $('banner');
  if (game.banner) {
    game.banner.t += 1 / 60;
    $('banner-title').textContent = game.banner.title;
    $('banner-lines').innerHTML = game.banner.lines.map((l) => `<div>${l}</div>`).join('');
    banner.classList.remove('hidden');
    banner.style.opacity = game.banner.t > 4.2 ? String(clamp(1 - (game.banner.t - 4.2), 0, 1)) : '1';
    if (game.banner.t > 5.2) game.banner = null;
  } else {
    banner.classList.add('hidden');
  }
}

// ------------------------------------------------------------------ save & load

function applySave(data) {
  const p = game.player;
  p.money = data.money ?? p.money;
  Object.assign(p.weapons, data.weapons || {});
  Object.assign(p.ammo, data.ammo || {});
  p.currentWeapon = data.currentWeapon || 'fists';
  p.armor = data.armor || 0;
  p.x = data.x ?? p.x;
  p.y = data.y ?? p.y;
  game.clock = data.clock ?? 10;
  game.story.index = data.missionIndex || 0;
  game.stats.jobsDone = data.jobsDone || 0;
  if (data.stats) {
    Object.assign(game.stats, data.stats);
    game.stats.raceBest = data.stats.raceBest || {};
  }
  game.stats._lastMoney = p.money;
  if (typeof data.shellsFound === 'string') {
    game.city.shells.forEach((s, i) => { s.taken = data.shellsFound[i] === '1'; });
  }
  game.camera.x = p.x;
  game.camera.y = p.y;
}

function startNewGame() {
  clearSave();
  const p = makePlayer(7 * 320 + 60, 7 * 320 + 200);
  game.player = p;
  game.story = { index: 0, stage: 0, active: false, data: {}, timer: 0 };
  game.job = null;
  game.race = null;
  game.heli = null;
  game.roadblocks = [];
  game.weather = makeWeather(game.rng);
  game.stats = {
    jobsDone: 0, carsStolen: 0, busted: 0, deaths: 0, racesWon: 0,
    topSpeed: 0, moneyEarned: 0, raceBest: {}, _lastMoney: p.money,
  };
  game.heat = 0;
  game.bust = 0;
  game.clock = 10;
  game.city.shells.forEach((s) => { s.taken = false; });
  game.cops = [];
  game.bullets = [];
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.state = 'play';
  hideScreens();
  game.banner = {
    title: 'CINDER BAY',
    lines: ['Rhea Calloway is back in town — and in debt.', 'Find Old Tomas at the Salt & Smoke Diner (gold marker).'],
    t: 0,
  };
}

function continueGame() {
  const data = loadGame();
  if (data) applySave(data);
  game.state = 'play';
  hideScreens();
}

function hideScreens() {
  for (const id of ['title-screen', 'help-screen', 'pause-screen', 'end-screen', 'shop-menu', 'pharmacy-menu']) {
    $(id).classList.add('hidden');
  }
}

// ------------------------------------------------------------------ simulation

function simulate(dt) {
  game.time += dt;
  game.clock = (game.clock + dt / 45) % 24;
  const p = game.player;

  if (game.state === 'title') {
    // Attract mode: slow pan over downtown while traffic runs.
    game.camera.x = 2400 + Math.sin(game.time * 0.05) * 700;
    game.camera.y = 2200 + Math.cos(game.time * 0.04) * 500;
    game.camera.zoom = 0.72;
    updateWeather(game, dt);
    spawnAmbient(dt);
    for (const car of game.cars) if (car.driver === 'traffic') updateTrafficCar(car, game, dt);
    for (const ped of game.peds) if (!ped.hostile) updatePed(ped, game, dt);
    updateParticles(game, dt);
    return;
  }
  if (game.state !== 'play') return;

  if (!p.dead) {
    if (p.inCar) {
      if (game.shotDrive) {
        // Screenshot staging autopilot: hold the lane and keep speed up.
        const car = p.inCar;
        const dy = game.shotDrive.laneY - car.y;
        stepCarPhysics(car, { throttle: 1, steer: clamp(dy * 0.02, -0.4, 0.4), brake: false, handbrake: false, gripMul: rainGrip(game) }, dt);
        collideCar(car, game.city.solids, game.city.props);
        p.x = car.x;
        p.y = car.y;
        p.angle = car.angle;
      } else {
        updatePlayerDriving(dt);
      }
    } else updatePlayerOnFoot(dt);
    if (input.takePress('KeyE')) doInteract(game.currentPrompt);
    if (input.takePress('KeyM')) {
      const muted = audio.toggleMute();
      game.floaters.push({ x: p.x, y: p.y - 30, text: muted ? 'Muted' : 'Sound on', life: 0, color: '#fff' });
    }
    if (input.takePress('Escape', 'KeyP')) {
      game.state = 'pause';
      fillStats('pause-stats');
      $('pause-screen').classList.remove('hidden');
    }
  }

  updateWeather(game, dt);
  spawnAmbient(dt);
  updateCars(dt);
  for (const ped of game.peds) {
    if (ped.hostile || ped.guard) continue;
    updatePed(ped, game, dt);
  }
  updateHostiles(game, dt);
  updatePolice(game, dt);
  updateBullets(game, dt);
  updateParticles(game, dt);
  updatePickups(game, dt);
  updateMissions(game, dt);
  updateRace(game, dt);

  // Lifetime stats: top speed and cash earned.
  if (p.inCar) game.stats.topSpeed = Math.max(game.stats.topSpeed, Math.abs(p.inCar.speed));
  if (p.money > game.stats._lastMoney) game.stats.moneyEarned += p.money - game.stats._lastMoney;
  game.stats._lastMoney = p.money;

  // Lucky shells.
  for (const sh of game.city.shells) {
    if (!sh.taken && dist(p.x, p.y, sh.x, sh.y) < 24) {
      sh.taken = true;
      p.money += 50;
      audio.pickup();
      game.floaters.push({ x: sh.x, y: sh.y, text: 'Lucky shell +$50', life: 0, color: '#ffeaa7' });
      const found = game.city.shells.filter((s) => s.taken).length;
      if (found === 20) {
        p.money += 1000;
        game.banner = { title: 'All 20 Shells!', lines: ['The bay provides. +$1000 bonus.'], t: 0 };
      }
      game.saveDirty = true;
    }
  }

  // Skids fade, floaters rise, camera follows.
  for (const s of game.skids) s.life -= dt;
  game.skids = game.skids.filter((s) => s.life > 0);
  for (const f of game.floaters) f.life += dt;
  game.floaters = game.floaters.filter((f) => f.life < 1.3);
  game.shake = Math.max(0, game.shake - dt * 1.6);
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 2.2);

  const focus = p.inCar || p;
  const lookX = focus.x + (focus.vx || 0) * 0.35;
  const lookY = focus.y + (focus.vy || 0) * 0.35;
  game.camera.x = lerp(game.camera.x, lookX, 1 - Math.exp(-4.5 * dt));
  game.camera.y = lerp(game.camera.y, lookY, 1 - Math.exp(-4.5 * dt));
  const targetZoom = p.inCar ? clamp(0.92 - Math.abs(p.inCar.speed) / 900, 0.6, 0.92) : 1.05;
  game.camera.zoom = lerp(game.camera.zoom, targetZoom, 1 - Math.exp(-2.5 * dt));

  // Audio: engine + siren proximity.
  const pp = playerPos();
  let siren = 0;
  for (const car of game.cars) {
    if (car.police && !car.dead) siren = Math.max(siren, clamp(1 - dist(car.x, car.y, pp.x, pp.y) / 700, 0, 1));
  }
  audio.update(dt, p.inCar ? Math.abs(p.inCar.speed) / CAR.maxSpeed : 0, siren);

  if (game.saveDirty) {
    game.saveDirty = false;
    saveGame(game);
  }
}

// ------------------------------------------------------------------ screenshot staging

function stageShot(name) {
  game.state = 'play';
  hideScreens();
  const p = game.player;
  const rng = game.rng;

  const giveCar = (x, y, angle, color) => {
    const car = makeCar(x, y, angle, rng, { driver: 'player', color, hp: 160 });
    game.cars.push(car);
    p.inCar = car;
    p.x = x;
    p.y = y;
    return car;
  };

  // Empty the driving corridor so the autopilot pre-roll stays clean.
  const clearCorridor = (laneY, x0, x1) => {
    game.cars = game.cars.filter((c) => c.driver === 'player' || c.police || !(c.x > x0 && c.x < x1 && Math.abs(c.y - laneY) < 150));
    game.peds = game.peds.filter((pd) => !(pd.x > x0 && pd.x < x1 && Math.abs(pd.y - laneY) < 120));
  };

  if (name === 'chase') {
    game.clock = 15.2;
    const y = 7 * 320 + 19;
    const car = giveCar(4 * 320, y, 0, '#c0392b');
    car.vx = 380;
    car.speed = 380;
    // Clear the staging corridor so the chase reads cleanly.
    game.cars = game.cars.filter((c) => !(c.driver === 'traffic' && Math.abs(c.y - y) < 70 && c.x > car.x - 400));
    for (let i = 0; i < 3; i++) {
      const cop = makeCar(car.x - 62 - i * 58, y + (i - 1) * 22, 0, rng, { driver: 'police', police: true, color: '#e8ecf1', hp: 160 });
      cop.vx = 375;
      cop.speed = 375;
      cop.speedMul = 1.18; // staging: keep the pursuit tight for the frame
      game.cars.push(cop);
    }
    game.heat = 55;
    game.story.index = 1;
    game.story.active = true;
    game.story.stage = 1;
    game.story.timer = 78;
    game.objective = { x: 3 * 320 + 160, y: 5 * 320 + 160, text: 'Deliver to the Old Market — do not stop! (78s)' };
    p.money = 1240;
    game.shotDrive = { laneY: y };
  } else if (name === 'foot') {
    game.clock = 11.1;
    p.x = 7 * 320 + 120;
    p.y = 7 * 320 + 120;
    p.angle = 0.6;
    p.aimAngle = 0.6;
    p.money = 860;
    game.story.active = true;
    game.story.stage = 0;
    game.objective = { x: game.city.places.diner.x, y: game.city.places.diner.y, text: 'Meet Old Tomas at the Salt & Smoke Diner' };
    for (let i = 0; i < 7; i++) {
      game.peds.push(makePed(p.x + rng.range(-160, 160), p.y + rng.range(-120, 120), rng));
    }
  } else if (name === 'night') {
    game.clock = 21.6;
    const y = 12 * 320 + 19;
    const car = giveCar(9 * 320, y, 0, '#148f77');
    car.vx = 300;
    car.speed = 300;
    game.cars = game.cars.filter((c) => !(c.driver === 'traffic' && Math.abs(c.y - y) < 70 && c.x > car.x - 400));
    const cop = makeCar(car.x - 80, y + 8, 0, rng, { driver: 'police', police: true, color: '#e8ecf1', hp: 160 });
    cop.vx = 300;
    cop.speed = 300;
    cop.speedMul = 1.15;
    game.cars.push(cop);
    game.heat = 30;
    p.money = 2030;
    game.shotDrive = { laneY: y };
  } else if (name === 'fight') {
    game.clock = 17.4;
    const w = game.city.places.warehouse;
    p.x = w.x - 60;
    p.y = w.y + 90;
    p.weapons.smg = true;
    p.ammo.smg = 180;
    p.currentWeapon = 'smg';
    p.money = 640;
    game.story.index = 4; // Warehouse Trouble: stage 1 is the dock-rat shootout
    game.story.active = true;
    game.story.stage = 1;
    game.story.data.hostiles = [];
    for (let i = 0; i < 4; i++) {
      const h = makePed(w.x + rng.range(-40, 140), w.y + rng.range(-30, 80), rng, { hostile: true, hp: 60 });
      h.color = '#922b21';
      game.peds.push(h);
      game.story.data.hostiles.push(h);
    }
    game.objective = { x: w.x, y: w.y, text: 'Clear out the dock rats (4 left)' };
    game.shotFight = true;
    p.hp = 9999; // staging only: keep Rhea standing for the frame
  } else if (name === 'shop') {
    game.clock = 12.3;
    const gs = game.city.places.gunShop;
    p.x = gs.x - 24;
    p.y = gs.y + 6;
    p.angle = -0.4;
    p.aimAngle = -0.4;
    p.money = 1750;
    p.weapons.pistol = true;
    p.ammo.pistol = 64;
    p.currentWeapon = 'pistol';
    p.armor = 35;
    game.objective = { x: game.city.places.diner.x, y: game.city.places.diner.y, text: 'Meet Old Tomas at the Salt & Smoke Diner' };
    for (let i = 0; i < 5; i++) {
      game.peds.push(makePed(p.x + rng.range(-180, 180), p.y + rng.range(-120, 120), rng));
    }
    game.shotOpenShop = 'guns';
  } else if (name === 'race') {
    game.clock = 16.1;
    const y = 7 * 320 + 19;
    const car = giveCar(6 * 320 + 220, y, 0, '#6c3483');
    car.vx = 360;
    car.speed = 360;
    car.name = 'Velvet GT';
    clearCorridor(y, car.x - 150, car.x + 1100);
    startRace(game, RACES[0]);
    if (game.race) game.race.time = 12.4;
    p.money = 980;
    game.shotDrive = { laneY: y };
    game.shotSteps = 40;
  } else if (name === 'rain') {
    game.clock = 21.6;
    game.weather.phase = 'rain';
    game.weather.rain = 1;
    game.weather.timer = 999;
    const y = 12 * 320 + 19;
    const car = giveCar(9 * 320, y, 0, '#148f77');
    car.vx = 310;
    car.speed = 310;
    clearCorridor(y, car.x - 150, car.x + 1500);
    const cop = makeCar(car.x - 150, y + 8, 0, rng, { driver: 'police', police: true, color: '#e8ecf1', hp: 160 });
    cop.vx = 310;
    cop.speed = 310;
    cop.speedMul = 1.02;
    game.cars.push(cop);
    game.heat = 25;
    p.money = 2110;
    game.shotDrive = { laneY: y };
    game.shotSteps = 64;
  } else if (name === 'roadblock') {
    game.clock = 13.2;
    const y = 8 * 320 + 19;
    const car = giveCar(4 * 320 + 80, y, 0, '#c0392b');
    car.vx = 375;
    car.speed = 375;
    clearCorridor(y, car.x - 150, car.x + 1200);
    game.heat = 100;
    spawnRoadblock(game);
    game.heli = { x: car.x + 120, y: car.y - 90, vx: 60, vy: 0, tx: car.x + 40, ty: car.y, rotor: 1.2 };
    for (let i = 0; i < 2; i++) {
      const cop = makeCar(car.x - 90 - i * 70, y + (i - 1) * 20, 0, rng, { driver: 'police', police: true, color: '#e8ecf1', hp: 160 });
      cop.vx = 370;
      cop.speed = 370;
      cop.speedMul = 1.05;
      game.cars.push(cop);
    }
    p.money = 3320;
    game.shotDrive = { laneY: y };
    game.shotSteps = 34;
  }

  game.camera.x = p.x;
  game.camera.y = p.y;
  game.camera.zoom = p.inCar ? 0.78 : 1.05;

  // Pre-roll the simulation so the frame is mid-action, then freeze it so the
  // screenshot is deterministic. Scripted fire keeps the fight shot alive.
  const steps = game.shotSteps || 110;
  for (let i = 0; i < steps; i++) {
    if (game.shotFight && i % 12 === 0) {
      const hostiles = game.peds.filter((h) => h.hostile && !h.dead);
      if (hostiles.length) {
        p.aimAngle = Math.atan2(hostiles[0].y - p.y, hostiles[0].x - p.x);
        p.angle = p.aimAngle;
        playerShoot(game);
      }
    }
    simulate(1 / 30);
  }
  if (game.shotOpenShop) openShop(game.shotOpenShop);
  game.frozen = true;
  window.__shotReady = true;
}

// ------------------------------------------------------------------ boot & loop

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', resize);
resize();

spawnParkedCars();
for (let i = 0; i < 10; i++) {
  const p = randomRoadPoint(game.rng);
  const car = makeCar(p.x, p.y, 0, game.rng, { driver: 'traffic' });
  initTrafficAI(car, game.rng);
  game.cars.push(car);
}

$('btn-new').addEventListener('click', () => { audio.unlock(); startNewGame(); });
$('btn-continue').addEventListener('click', () => { audio.unlock(); continueGame(); });
$('btn-help').addEventListener('click', () => {
  $('title-screen').classList.add('hidden');
  $('help-screen').classList.remove('hidden');
});
$('btn-help-back').addEventListener('click', () => {
  $('help-screen').classList.add('hidden');
  if (game.state === 'title') $('title-screen').classList.remove('hidden');
});
$('btn-resume').addEventListener('click', () => {
  game.state = 'play';
  $('pause-screen').classList.add('hidden');
});
$('btn-save').addEventListener('click', () => {
  saveGame(game);
  game.banner = { title: 'Saved', lines: ['Progress stored on this device.'], t: 0 };
});
$('btn-quit-title').addEventListener('click', () => {
  saveGame(game);
  game.state = 'title';
  hideScreens();
  $('title-screen').classList.remove('hidden');
  $('btn-continue').disabled = !hasSave();
});
$('btn-respawn').addEventListener('click', () => respawn(game.state));
$('btn-shop-close').addEventListener('click', closeShop);
$('btn-pharmacy-close').addEventListener('click', closeShop);
for (const key of ['pistol', 'smg', 'scatter', 'ammo', 'armor', 'health', 'ammo2', 'armor2']) {
  $(`buy-${key}`).addEventListener('click', () => buyItem(key));
}
canvas.addEventListener('mousedown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());
$('btn-continue').disabled = !hasSave();
if (SHOT) $('hud').style.display = '';

if (SHOT) {
  stageShot(SHOT);
} else {
  game.state = 'title';
}
if (params.get('debug')) window.__game = game;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = clamp(dt, 0, 0.05);
  if (game.state === 'pause' && input.takePress('Escape', 'KeyP')) {
    game.state = 'play';
    $('pause-screen').classList.add('hidden');
  }
  if (game.state === 'shop' && input.takePress('Escape', 'KeyE')) closeShop();
  if ((game.state === 'dead' || game.state === 'busted') && (input.takeMousePress() || input.takePress('Enter', 'Space'))) {
    respawn(game.state);
  }
  if (!game.frozen) simulate(dt);
  renderer.draw(game);
  if (game.state !== 'title') {
    updateHud();
    renderer.drawMinimap(game, minimapCanvas);
  }
  input.endFrame();
}
requestAnimationFrame(frame);
