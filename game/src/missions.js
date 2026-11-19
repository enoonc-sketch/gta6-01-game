// Story missions and courier side jobs. Rhea Calloway owes Old Tomas money;
// six jobs across Cinder Bay settle the debt. Each mission is a chain of
// stages (go to, pick up, deliver, race, shootout, tail, steal) driven by
// updateMissions, which also maintains the HUD objective and map marker.

import { clamp, dist, angleDiff } from './rng.js';
import { laneTarget, nearestIntersection, randomRoadPoint } from './city.js';
import { makeCar, makePed, makePickup, stepCarPhysics, collideCar, collideWithCity, damageCar } from './entities.js';
import { addHeat, clearWanted, wantedStars } from './police.js';

const PIER = { x: 12 * 320 + 73, y: 4800 - 130 };
const BANK = { x: 7 * 320 + 160, y: 6 * 320 + 160 };

export const STORY = [
  {
    title: 'Welcome Back, Rhea',
    reward: 150,
    brief: [
      'Old Tomas: "Rhea. Thought the bay had swallowed you."',
      '"You owe me, kid. Run a package from Pier 9 to my diner and we start even-ing up."',
    ],
    stages: [
      { type: 'goto', place: 'diner', text: 'Meet Old Tomas at the Salt & Smoke Diner' },
      { type: 'pickup', at: PIER, text: 'Pick up the package at Pier 9' },
      { type: 'deliver', place: 'diner', text: 'Bring the package back to the diner' },
    ],
  },
  {
    title: 'Hot Delivery',
    reward: 300,
    brief: [
      'Tomas: "This one is warm. Warehouse to the Old Market, fast."',
      '"And Rhea — if the law shows up, do not stop."',
    ],
    stages: [
      { type: 'pickup', place: 'warehouse', text: 'Collect the crate at Pier 9 Warehouse' },
      { type: 'deliver', at: { x: 3 * 320 + 160, y: 5 * 320 + 160 }, timer: 105, heatOnStart: 40, text: 'Deliver to the Old Market — do not stop!' },
    ],
  },
  {
    title: 'Escort Duty',
    reward: 550,
    brief: [
      'Tomas: "A truck of mine rolls from Pier 9 to the diner tonight."',
      '"Ride with it. The Harbor crew would love to stop it. Keep it rolling, Rhea."',
    ],
    stages: [
      { type: 'goto', place: 'warehouse', text: 'Meet the truck at Pier 9 Warehouse' },
      { type: 'escort', place: 'diner', text: 'Escort the truck to the diner — stay close!' },
    ],
  },
  {
    title: 'Street Rules',
    reward: 450,
    brief: [
      'Tomas: "Vex runs the night races and owes me a favour. Beat him and it is mine."',
      '"Eight checkpoints. First one home wins."',
    ],
    stages: [
      { type: 'race', text: 'Beat Vex through every checkpoint' },
    ],
  },
  {
    title: 'Warehouse Trouble',
    reward: 600,
    brief: [
      'Tomas: "Some dock rats moved into Pier 9 and took my cash case."',
      '"Clear them out, grab the case, bring it home. There is hardware waiting for you there."',
    ],
    stages: [
      { type: 'goto', place: 'warehouse', text: 'Head to Pier 9 Warehouse' },
      { type: 'shootout', place: 'warehouse', count: 5, text: 'Clear out the dock rats' },
      { type: 'pickup', place: 'warehouse', text: 'Grab the cash case' },
      { type: 'deliver', place: 'diner', text: 'Bring the cash case to Tomas' },
    ],
  },
  {
    title: 'Cold Chain',
    reward: 500,
    brief: [
      'Tomas: "Ice for the Palm, fish for the diner, flowers for… never mind."',
      '"Three stops, one cold box. Every stop buys you time. Go."',
    ],
    stages: [
      { type: 'pickup', place: 'warehouse', text: 'Load the cold box at Pier 9' },
      {
        type: 'multideliver', timer: 75, text: 'Cold-chain stops',
        stops: [
          { place: 'diner', bonus: 40 },
          { at: { x: 8 * 320 + 160, y: 5 * 320 + 160 }, bonus: 40 },
          { at: { x: 3 * 320 + 160, y: 5 * 320 + 160 }, bonus: 0 },
        ],
      },
    ],
  },
  {
    title: 'Tail the Courier',
    reward: 500,
    brief: [
      'Tomas: "A courier runs cash for the Harbor crew every dusk."',
      '"Follow him. Not too close, not too far. I want to know where he sleeps."',
    ],
    stages: [
      { type: 'tail', seconds: 45, text: 'Tail the courier — stay in the sweet spot' },
    ],
  },
  {
    title: 'Quiet Hands',
    reward: 650,
    brief: [
      'Tomas: "The bank keeps a ledger with my name in it."',
      '"It sits in their back lot. Guards walk it. No noise, Rhea — grab it and ghost."',
    ],
    stages: [
      { type: 'sneak', at: BANK, text: 'Slip into the bank lot — avoid the guards' },
      { type: 'deliver', place: 'diner', text: 'Bring the ledger to Tomas' },
    ],
  },
  {
    title: 'Interception',
    reward: 800,
    brief: [
      'Tomas: "Vex\'s runner is moving my money across town in a red Comet."',
      '"Run him down. Bend his fenders until he stops. Don\'t let him reach the docks."',
    ],
    stages: [
      { type: 'intercept', timer: 150, text: 'Run down the red Comet — ram it until it stops!' },
    ],
  },
  {
    title: 'The Big Score',
    reward: 1500,
    brief: [
      'Tomas: "Last one. The bank moves its cash in a grey van at noon."',
      '"Take the van, shake the law, and park it at Milo\'s. Then we are square."',
    ],
    stages: [
      { type: 'steal', at: BANK, text: 'Steal the grey cash van by the bank' },
      { type: 'evade', text: 'Lose the police' },
      { type: 'deliver', place: 'respray', text: "Park the van at Milo's Respray" },
    ],
  },
];

const RACE_CHECKPOINTS = [
  { x: 7 * 320, y: 7 * 320 }, { x: 10 * 320, y: 7 * 320 }, { x: 12 * 320, y: 9 * 320 },
  { x: 12 * 320, y: 12 * 320 }, { x: 9 * 320, y: 13 * 320 }, { x: 6 * 320, y: 12 * 320 },
  { x: 5 * 320, y: 9 * 320 }, { x: 7 * 320, y: 7 * 320 },
];

function stagePoint(game, stage) {
  if (stage.at) return stage.at;
  if (stage.place) {
    const p = game.city.places[stage.place];
    return { x: p.x, y: p.y };
  }
  return null;
}

function playerPos(game) {
  const p = game.player;
  return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
}

// Drive a car along the road grid toward a target intersection (used by the
// race rival and the courier Rhea tails).
function driveToward(car, game, dt, targetI, targetJ, cruise) {
  const ai = car.ai || (car.ai = { fromI: 0, fromJ: 0, toI: 0, toJ: 0, cruise });
  const here = nearestIntersection(car.x, car.y);
  const target = laneTarget(ai.fromI, ai.fromJ, ai.toI, ai.toJ);
  if (dist(car.x, car.y, target.x, target.y) < 46 || (ai.fromI === ai.toI && ai.fromJ === ai.toJ)) {
    ai.fromI = here.i;
    ai.fromJ = here.j;
    const di = Math.sign(targetI - here.i);
    const dj = Math.sign(targetJ - here.j);
    if (di !== 0 && (dj === 0 || game.rng.chance(0.5))) { ai.toI = here.i + di; ai.toJ = here.j; }
    else if (dj !== 0) { ai.toI = here.i; ai.toJ = here.j + dj; }
    else { ai.toI = here.i; ai.toJ = here.j; }
  }
  const t2 = laneTarget(ai.fromI, ai.fromJ, ai.toI, ai.toJ);
  const desired = Math.atan2(t2.y - car.y, t2.x - car.x);
  const diff = angleDiff(car.angle, desired);
  stepCarPhysics(car, {
    throttle: clamp((cruise - car.speed) / 60, 0, 1),
    steer: clamp(diff * 2.6, -1, 1),
    brake: false,
    handbrake: Math.abs(diff) > 2.4 && Math.abs(car.speed) > 150,
  }, dt);
  collideCar(car, game.city.solids, game.city.props);
}

export function startMission(game) {
  const story = game.story;
  if (story.index >= STORY.length) return false;
  story.active = true;
  story.stage = 0;
  story.data = {};
  story.timer = 0;
  game.banner = { title: STORY[story.index].title, lines: STORY[story.index].brief, t: 0 };
  setupStage(game);
  return true;
}

function setupStage(game) {
  const story = game.story;
  const stage = STORY[story.index].stages[story.stage];
  story.timer = stage.timer || 0;
  if (stage.heatOnStart) addHeat(game, stage.heatOnStart);
  if (stage.type === 'shootout') {
    const p = stagePoint(game, stage);
    story.data.hostiles = [];
    for (let i = 0; i < stage.count; i++) {
      const h = makePed(p.x + game.rng.range(-90, 90), p.y + game.rng.range(-60, 60), game.rng, { hostile: true, hp: 60 });
      h.color = '#922b21';
      game.peds.push(h);
      story.data.hostiles.push(h);
    }
    game.pickups.push(makePickup(p.x + 40, p.y + 30, 'smg', 120));
    game.pickups.push(makePickup(p.x - 50, p.y + 40, 'armor', 0));
  }
  if (stage.type === 'race') {
    const start = RACE_CHECKPOINTS[0];
    const rival = makeCar(start.x + 30, start.y + 40, 0, game.rng, { driver: 'rival', color: '#f39c12', hp: 160 });
    rival.name = 'Vex\'s Comet';
    rival.ai = { fromI: 7, fromJ: 7, toI: 8, toJ: 7, cruise: 330 };
    game.cars.push(rival);
    story.data.rival = rival;
    story.data.rivalCp = 0;
    story.data.playerCp = 0;
  }
  if (stage.type === 'tail') {
    const start = { x: 3 * 320 + 19, y: 6 * 320 };
    const courier = makeCar(start.x, start.y, Math.PI / 2, game.rng, { driver: 'courier', color: '#5d6d7e', hp: 120 });
    courier.name = 'Courier Sedan';
    courier.ai = { fromI: 3, fromJ: 6, toI: 3, toJ: 7, cruise: 175 };
    game.cars.push(courier);
    story.data.courier = courier;
    story.data.tailTime = 0;
    story.data.lostTimer = 0;
  }
  if (stage.type === 'steal') {
    const van = makeCar(stage.at.x + 30, stage.at.y + 60, 0, game.rng, { driver: null, color: '#808b96', hp: 220 });
    van.name = 'Cash Van';
    van.length = 62;
    game.cars.push(van);
    story.data.van = van;
  }
  if (stage.type === 'escort') {
    const w = game.city.places.warehouse;
    const truck = makeCar(w.x + 60, w.y + 30, Math.PI, game.rng, { driver: 'escort', color: '#7d8c5c', hp: 240 });
    truck.name = 'Tomas Truck';
    truck.length = 62;
    truck.ai = { fromI: 12, fromJ: 12, toI: 11, toJ: 12, cruise: 205 };
    game.cars.push(truck);
    story.data.truck = truck;
    story.data.awayTimer = 0;
    story.data.ambush1 = false;
    story.data.ambush2 = false;
  }
  if (stage.type === 'multideliver') {
    story.data.stopIdx = 0;
  }
  if (stage.type === 'sneak') {
    story.data.guards = [];
    story.data.spotted = false;
    const posts = [[-70, -40], [60, 50], [10, -90]];
    for (const [ox, oy] of posts) {
      const g = makePed(stage.at.x + ox, stage.at.y + oy, game.rng, { hp: 70 });
      g.guard = true;
      g.color = '#34495e';
      g.homeX = g.x;
      g.homeY = g.y;
      g.patrolT = game.rng.range(0, 6.28);
      game.peds.push(g);
      story.data.guards.push(g);
    }
  }
  if (stage.type === 'intercept') {
    const target = makeCar(BANK.x + 140, BANK.y + 40, 0, game.rng, { driver: 'flee', color: '#c0392b', hp: 200 });
    target.name = 'Red Comet';
    target.ai = { fromI: 7, fromJ: 6, toI: 8, toJ: 6, cruise: 395 };
    game.cars.push(target);
    story.data.target = target;
    story.data.maxHp = 200;
    story.data.lostTimer = 0;
    story.data.destI = 13;
    story.data.destJ = 13;
  }
}

function cleanupActors(game) {
  const data = game.story.data || {};
  if (data.truck) data.truck.driver = null;
  if (data.target) data.target.driver = null;
  if (data.guards) {
    for (const g of data.guards) { g.guard = false; g.hostile = false; }
  }
}

function passStage(game) {
  const story = game.story;
  cleanupActors(game);
  story.stage++;
  if (story.stage >= STORY[story.index].stages.length) {
    const reward = STORY[story.index].reward;
    game.player.money += reward;
    game.audio.missionPass();
    game.banner = { title: 'Mission Passed', lines: [`+$${reward}`, STORY[story.index].title], t: 0 };
    story.index++;
    story.active = false;
    story.data = {};
    game.objective = null;
    game.saveDirty = true;
    if (story.index >= STORY.length) {
      game.banner = { title: 'Debt Paid', lines: ['Tomas: "We are square, Rhea. The bay is yours."', 'Free roam: courier jobs and shells remain.'], t: 0 };
    }
  } else {
    setupStage(game);
  }
}

export function failMission(game, reason) {
  const story = game.story;
  if (!story.active) return;
  cleanupActors(game);
  story.active = false;
  story.data = {};
  game.objective = null;
  game.audio.missionFail();
  game.banner = { title: 'Mission Failed', lines: [reason, 'See Tomas at the diner to try again.'], t: 0 };
}

// Phone-booth side jobs. Four kinds: parcel runs, taxi fares, getaway
// driving (pickup brings heat), and repo work (steal a marked car and
// deliver it to Harbor Customs).
export function startSideJob(game) {
  if (game.job || game.story.active || game.race) return false;
  const kinds = ['parcel', 'parcel', 'taxi', 'taxi', 'getaway', 'repo'];
  const kind = game.rng.pick(kinds);
  const a = randomRoadPoint(game.rng);
  const b = randomRoadPoint(game.rng);
  const d = dist(a.x, a.y, b.x, b.y);

  if (kind === 'taxi') {
    const passenger = makePed(a.x, a.y, game.rng, { type: 'tourist' });
    game.peds.push(passenger);
    game.job = { kind, stage: 'pickup', from: a, to: b, passenger, timer: 55 + d / 20, pay: Math.round(60 + d * 0.06) };
    game.banner = { title: 'Taxi Fare', lines: [`Pick up the fare. Pay $${game.job.pay} + tip for speed.`], t: 0 };
  } else if (kind === 'getaway') {
    game.job = { kind, stage: 'pickup', from: { x: BANK.x, y: BANK.y }, to: b, timer: 100, pay: Math.round(220 + d * 0.05) };
    game.banner = { title: 'Getaway Driver', lines: [`Pick up at the bank. It will get loud. Pay $${game.job.pay}.`], t: 0 };
  } else if (kind === 'repo') {
    const spots = game.city.parkedSpots;
    const s = spots[game.rng.int(0, spots.length - 1)];
    const car = makeCar(s.x, s.y, s.angle, game.rng, { driver: null, color: '#c0392b', hp: 100 });
    car.name = 'Repo Target';
    game.cars.push(car);
    game.job = { kind, stage: 'steal', car, timer: 0, pay: 200 };
    game.banner = { title: 'Repo Job', lines: ['Take the marked red car to Harbor Customs. $200.'], t: 0 };
  } else {
    game.job = { kind: 'parcel', stage: 'pickup', from: a, to: b, timer: 40 + d / 22, pay: Math.round(40 + d * 0.055) };
    game.banner = { title: 'Courier Job', lines: [`Pick up the parcel. Pay $${game.job.pay}.`], t: 0 };
  }
  return true;
}

export function startCourierJob(game) {
  return startSideJob(game);
}

export function updateMissions(game, dt) {
  const story = game.story;
  const pp = playerPos(game);
  game.objective = null;

  if (story.active) {
    const stage = STORY[story.index].stages[story.stage];
    const point = stagePoint(game, stage);
    if (point) game.objective = { x: point.x, y: point.y, text: stage.text };
    else game.objective = { x: pp.x, y: pp.y, text: stage.text, noMarker: true };

    if (story.timer > 0) {
      story.timer -= dt;
      game.objective.text = `${stage.text}  (${Math.ceil(story.timer)}s)`;
      if (story.timer <= 0) { failMission(game, 'Out of time.'); return; }
    }

    switch (stage.type) {
      case 'goto':
      case 'pickup':
      case 'deliver': {
        if (point && dist(pp.x, pp.y, point.x, point.y) < 44) passStage(game);
        break;
      }
      case 'shootout': {
        const alive = (story.data.hostiles || []).filter((h) => !h.dead).length;
        game.objective.text = `${stage.text} (${alive} left)`;
        if (alive === 0) passStage(game);
        break;
      }
      case 'race': {
        const cp = RACE_CHECKPOINTS[story.data.playerCp];
        game.objective = { x: cp.x, y: cp.y, text: `Checkpoint ${story.data.playerCp + 1}/${RACE_CHECKPOINTS.length} — beat Vex!` };
        if (dist(pp.x, pp.y, cp.x, cp.y) < 60) {
          story.data.playerCp++;
          game.audio.star();
          if (story.data.playerCp >= RACE_CHECKPOINTS.length) { passStage(game); break; }
        }
        const rival = story.data.rival;
        if (rival && !rival.dead) {
          const rcp = RACE_CHECKPOINTS[story.data.rivalCp];
          const ni = nearestIntersection(rcp.x, rcp.y);
          driveToward(rival, game, dt, ni.i, ni.j, 330);
          if (dist(rival.x, rival.y, rcp.x, rcp.y) < 60) {
            story.data.rivalCp++;
            if (story.data.rivalCp >= RACE_CHECKPOINTS.length) failMission(game, 'Vex got there first.');
          }
        }
        break;
      }
      case 'tail': {
        const courier = story.data.courier;
        if (!courier || courier.dead) { failMission(game, 'The courier is gone.'); break; }
        const ni = nearestIntersection(12 * 320, 12 * 320);
        driveToward(courier, game, dt, ni.i, ni.j, 175);
        const d = dist(pp.x, pp.y, courier.x, courier.y);
        game.objective = { x: courier.x, y: courier.y, text: `${stage.text} (${Math.floor(story.data.tailTime)}/${stage.seconds}s)` };
        if (d >= 90 && d <= 340) {
          story.data.tailTime += dt;
          story.data.lostTimer = 0;
        } else {
          story.data.lostTimer += dt;
          game.objective.text = d < 90 ? 'Too close! Back off!' : 'Too far! Catch up!';
          if (story.data.lostTimer > 8) { failMission(game, 'You lost the courier.'); break; }
        }
        if (story.data.tailTime >= stage.seconds) passStage(game);
        break;
      }
      case 'steal': {
        const van = story.data.van;
        if (!van || van.dead) { failMission(game, 'The van is wrecked.'); break; }
        game.objective = { x: van.x, y: van.y, text: stage.text };
        if (game.player.inCar === van) {
          addHeat(game, 80);
          passStage(game);
        }
        break;
      }
      case 'evade': {
        game.objective = { x: pp.x, y: pp.y, text: stage.text, noMarker: true };
        if (wantedStars(game) === 0) passStage(game);
        break;
      }
      case 'escort': {
        const truck = story.data.truck;
        if (!truck || truck.dead) { failMission(game, 'The truck is wrecked.'); break; }
        const dest = game.city.places.diner;
        const ni = nearestIntersection(dest.x, dest.y);
        driveToward(truck, game, dt, ni.i, ni.j, 205);
        const d = dist(pp.x, pp.y, truck.x, truck.y);
        game.objective = { x: truck.x, y: truck.y, text: `${stage.text} (truck ${Math.ceil(truck.hp / 2.4)}%)` };
        if (d > 480) {
          story.data.awayTimer += dt;
          game.objective.text = `Stay with the truck! (${Math.ceil(10 - story.data.awayTimer)}s)`;
          if (story.data.awayTimer > 10) { failMission(game, 'You left the truck behind.'); break; }
        } else {
          story.data.awayTimer = 0;
        }
        // Two ambushes on the road west.
        const ambush = (n) => {
          for (let i = 0; i < n; i++) {
            const h = makePed(truck.x + game.rng.range(-120, 120), truck.y + game.rng.range(-90, 90), game.rng, { hostile: true, hp: 55 });
            h.color = '#922b21';
            game.peds.push(h);
          }
          game.banner = { title: 'Ambush!', lines: ['Harbor crew — protect the truck!'], t: 0 };
        };
        if (!story.data.ambush1 && truck.x < 10.5 * 320) { story.data.ambush1 = true; ambush(3); }
        if (!story.data.ambush2 && truck.x < 8.5 * 320) { story.data.ambush2 = true; ambush(3); }
        // Gunmen near the truck chew through its panels.
        let dmg = 0;
        for (const ped of game.peds) {
          if (ped.hostile && !ped.dead && dist(ped.x, ped.y, truck.x, truck.y) < 230) dmg += 5 * dt;
        }
        if (dmg > 0) damageCar(truck, dmg);
        if (dist(truck.x, truck.y, dest.x, dest.y) < 80) passStage(game);
        break;
      }
      case 'multideliver': {
        const stop = stage.stops[story.data.stopIdx];
        const sp = stagePoint(game, stop);
        game.objective = {
          x: sp.x, y: sp.y,
          text: `Stop ${story.data.stopIdx + 1}/${stage.stops.length} — cold box (${Math.ceil(story.timer)}s)`,
        };
        if (dist(pp.x, pp.y, sp.x, sp.y) < 46) {
          story.data.stopIdx++;
          game.audio.pickup();
          if (story.data.stopIdx >= stage.stops.length) { passStage(game); break; }
          story.timer += stop.bonus || 0;
          game.floaters.push({ x: sp.x, y: sp.y - 20, text: `+${stop.bonus}s`, life: 0, color: '#8ecae6' });
        }
        break;
      }
      case 'sneak': {
        const guards = story.data.guards || [];
        // Guards walk a short patrol around their post until they turn hostile.
        for (const g of guards) {
          if (g.dead || g.hostile) continue;
          g.patrolT += dt * 0.5;
          const tx = g.homeX + Math.cos(g.patrolT) * 55;
          const ty = g.homeY + Math.sin(g.patrolT * 0.8) * 40;
          const ang = Math.atan2(ty - g.y, tx - g.x);
          g.angle = ang;
          g.vx = Math.cos(ang) * 52;
          g.vy = Math.sin(ang) * 52;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          g.walkPhase += dt * 6;
          collideWithCity(g, g.radius, game.city.solids, game.city.props);
        }
        if (!story.data.spotted) {
          const loud = game.bullets.some((b) => b.from === 'player');
          for (const g of guards) {
            if (g.dead) continue;
            const gd = dist(pp.x, pp.y, g.x, g.y);
            if (gd < 135 || (loud && gd < 420)) {
              story.data.spotted = true;
              for (const g2 of guards) g2.hostile = true;
              addHeat(game, 45);
              game.banner = { title: 'Spotted!', lines: ['The guards are shooting — grab the ledger and run!'], t: 0 };
              break;
            }
          }
        }
        game.objective = { x: stage.at.x, y: stage.at.y, text: story.data.spotted ? 'Grab the ledger — run!' : stage.text };
        if (dist(pp.x, pp.y, stage.at.x, stage.at.y) < 42) passStage(game);
        break;
      }
      case 'intercept': {
        const target = story.data.target;
        if (!target) { failMission(game, 'He got away.'); break; }
        if (target.dead || target.hp <= story.data.maxHp * 0.35) { passStage(game); break; }
        // The runner flees toward the docks, picking a new far corner when close.
        const tni = nearestIntersection(target.x, target.y);
        if (Math.abs(tni.i - story.data.destI) + Math.abs(tni.j - story.data.destJ) <= 1) {
          story.data.destI = game.rng.int(1, 14);
          story.data.destJ = game.rng.int(9, 14);
        }
        driveToward(target, game, dt, story.data.destI, story.data.destJ, 395);
        const d = dist(pp.x, pp.y, target.x, target.y);
        game.objective = { x: target.x, y: target.y, text: `${stage.text} (Comet ${Math.ceil((target.hp / story.data.maxHp) * 100)}%)` };
        if (d > 1500) {
          story.data.lostTimer += dt;
          if (story.data.lostTimer > 10) { failMission(game, 'He got away.'); break; }
        } else {
          story.data.lostTimer = 0;
        }
        break;
      }
    }
    return;
  }

  // Phone-booth side jobs (parcel / taxi / getaway / repo).
  if (game.job) {
    const job = game.job;
    const finishJob = (pay, title) => {
      game.player.money += pay;
      game.stats.jobsDone++;
      game.audio.cash();
      game.banner = { title, lines: [`+$${pay}`], t: 0 };
      game.job = null;
      game.saveDirty = true;
    };
    const failJob = (line) => {
      game.job = null;
      game.audio.missionFail();
      game.banner = { title: 'Job Failed', lines: [line], t: 0 };
    };

    if (job.kind === 'repo') {
      const car = job.car;
      if (!car || car.dead) { failJob('The repo car is wrecked.'); return; }
      if (job.stage === 'steal') {
        game.objective = { x: car.x, y: car.y, text: 'Steal the marked red car' };
        if (game.player.inCar === car) {
          job.stage = 'deliver';
          game.audio.pickup();
        }
      } else {
        const g = game.city.places.garage;
        game.objective = { x: g.x, y: g.y, text: 'Deliver the car to Harbor Customs' };
        if (game.player.inCar === car && dist(pp.x, pp.y, g.x, g.y) < 70) {
          car.driver = null;
          game.player.inCar = null;
          finishJob(job.pay, 'Repo Done');
        }
      }
      return;
    }

    const target = job.stage === 'pickup' ? job.from : job.to;
    const pickupText = { parcel: 'Pick up the parcel', taxi: 'Pick up the fare', getaway: 'Pick up at the bank — be ready to run' }[job.kind];
    const deliverText = { parcel: 'Deliver the parcel', taxi: 'Drive the fare to the drop-off', getaway: 'Reach the hideout' }[job.kind];
    game.objective = {
      x: target.x, y: target.y,
      text: job.stage === 'pickup' ? pickupText : `${deliverText} (${Math.ceil(job.timer)}s)`,
    };
    if (job.stage === 'deliver') {
      job.timer -= dt;
      if (job.timer <= 0) {
        failJob(job.kind === 'taxi' ? 'The fare walked off.' : job.kind === 'getaway' ? 'The trail went cold.' : 'The parcel went cold.');
        return;
      }
    }
    if (dist(pp.x, pp.y, target.x, target.y) < 42) {
      if (job.stage === 'pickup') {
        job.stage = 'deliver';
        game.audio.pickup();
        if (job.kind === 'taxi' && job.passenger) {
          game.peds = game.peds.filter((p) => p !== job.passenger); // boarded
          job.passenger = null;
        }
        if (job.kind === 'getaway') {
          addHeat(game, 60);
          game.banner = { title: 'Go! Go! Go!', lines: ['The law is coming — reach the hideout!'], t: 0 };
        }
      } else {
        let pay = job.pay;
        if (job.kind === 'taxi' && job.timer > 25) pay = Math.round(pay * 1.3); // speed tip
        finishJob(pay, job.kind === 'taxi' ? 'Fare Delivered' : job.kind === 'getaway' ? 'Clean Getaway' : 'Delivered');
      }
    }
  }
}

export function clearWantedAtRespray(game) {
  clearWanted(game);
}
