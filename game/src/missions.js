// Story missions and courier side jobs. Rhea Calloway owes Old Tomas money;
// six jobs across Cinder Bay settle the debt. Each mission is a chain of
// stages (go to, pick up, deliver, race, shootout, tail, steal) driven by
// updateMissions, which also maintains the HUD objective and map marker.

import { clamp, dist, angleDiff } from './rng.js';
import { laneTarget, nearestIntersection, randomRoadPoint } from './city.js';
import { makeCar, makePed, makePickup, stepCarPhysics, collideCar } from './entities.js';
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
}

function passStage(game) {
  const story = game.story;
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
  story.active = false;
  story.data = {};
  game.objective = null;
  game.audio.missionFail();
  game.banner = { title: 'Mission Failed', lines: [reason, 'See Tomas at the diner to try again.'], t: 0 };
}

export function startCourierJob(game) {
  if (game.job) return false;
  const a = randomRoadPoint(game.rng);
  const b = randomRoadPoint(game.rng);
  const d = dist(a.x, a.y, b.x, b.y);
  game.job = {
    stage: 'pickup',
    from: a,
    to: b,
    timer: 40 + d / 22,
    pay: Math.round(40 + d * 0.055),
  };
  game.banner = { title: 'Courier Job', lines: [`Pick up the parcel. Pay $${game.job.pay}.`], t: 0 };
  return true;
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
    }
    return;
  }

  // Courier side job.
  if (game.job) {
    const job = game.job;
    const target = job.stage === 'pickup' ? job.from : job.to;
    game.objective = {
      x: target.x, y: target.y,
      text: job.stage === 'pickup' ? 'Pick up the parcel' : `Deliver the parcel (${Math.ceil(job.timer)}s)`,
    };
    if (job.stage === 'deliver') {
      job.timer -= dt;
      if (job.timer <= 0) {
        game.job = null;
        game.audio.missionFail();
        game.banner = { title: 'Job Failed', lines: ['The parcel went cold.'], t: 0 };
        return;
      }
    }
    if (dist(pp.x, pp.y, target.x, target.y) < 42) {
      if (job.stage === 'pickup') {
        job.stage = 'deliver';
        game.audio.pickup();
      } else {
        game.player.money += job.pay;
        game.stats.jobsDone++;
        game.audio.cash();
        game.banner = { title: 'Delivered', lines: [`+$${job.pay}`], t: 0 };
        game.job = null;
        game.saveDirty = true;
      }
    }
  }
}

export function clearWantedAtRespray(game) {
  clearWanted(game);
}
