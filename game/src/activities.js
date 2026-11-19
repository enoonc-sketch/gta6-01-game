// Street-race activities: three checkpoint time trials scattered around
// Cinder Bay. Drive to a chequered start marker in any car, press E, and
// run the checkpoints against the clock. Gold / silver / bronze payouts by
// time; best times are kept in game.stats.raceBest and saved.

import { dist } from './rng.js';

const C = 320; // one city block, matches WORLD.cell

export const RACES = [
  {
    id: 'downtown-loop',
    name: 'Downtown Loop',
    start: { x: 7 * C, y: 7 * C },
    checkpoints: [
      { x: 9 * C, y: 7 * C }, { x: 9 * C, y: 5 * C }, { x: 6 * C, y: 5 * C },
      { x: 6 * C, y: 8 * C }, { x: 7 * C, y: 7 * C },
    ],
    par: 55,
    pay: [450, 280, 130],
  },
  {
    id: 'harbor-sprint',
    name: 'Harbor Sprint',
    start: { x: 13 * C, y: 13 * C },
    checkpoints: [
      { x: 10 * C, y: 13 * C }, { x: 10 * C, y: 11 * C }, { x: 12 * C, y: 11 * C },
      { x: 13 * C, y: 12 * C }, { x: 13 * C, y: 13 * C },
    ],
    par: 60,
    pay: [500, 300, 140],
  },
  {
    id: 'bayshore-run',
    name: 'Bayshore Run',
    start: { x: 2 * C, y: 14 * C },
    checkpoints: [
      { x: 5 * C, y: 14 * C }, { x: 8 * C, y: 14 * C }, { x: 11 * C, y: 14 * C },
      { x: 13 * C, y: 13 * C }, { x: 13 * C, y: 14 * C },
    ],
    par: 65,
    pay: [550, 330, 150],
  },
];

export function raceAt(x, y, maxD = 60) {
  for (const race of RACES) {
    if (dist(x, y, race.start.x, race.start.y) < maxD) return race;
  }
  return null;
}

export function startRace(game, race) {
  if (game.race || game.story.active || game.job) return false;
  game.race = { def: race, cp: 0, time: 0, grace: 0 };
  game.banner = {
    title: race.name,
    lines: [`${race.checkpoints.length} checkpoints. Gold under ${race.par}s pays $${race.pay[0]}.`],
    t: 0,
  };
  game.audio.star();
  return true;
}

export function cancelRace(game, reason) {
  if (!game.race) return;
  game.race = null;
  game.audio.missionFail();
  game.banner = { title: 'Race Abandoned', lines: [reason], t: 0 };
}

export function updateRace(game, dt) {
  const race = game.race;
  if (!race) return;
  const p = game.player;
  const pp = p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };

  // Leaving the car starts an 8-second grace timer; stay out and the run dies.
  if (!p.inCar) {
    race.grace += dt;
    game.objective = { x: race.def.checkpoints[race.cp].x, y: race.def.checkpoints[race.cp].y, text: `Get back in a car! (${Math.ceil(8 - race.grace)}s)` };
    if (race.grace > 8) cancelRace(game, 'You left the car too long.');
    return;
  }
  race.grace = 0;
  race.time += dt;

  const cp = race.def.checkpoints[race.cp];
  const last = race.cp === race.def.checkpoints.length - 1;
  game.objective = {
    x: cp.x, y: cp.y,
    text: `${race.def.name} — ${last ? 'Finish' : `Checkpoint ${race.cp + 1}/${race.def.checkpoints.length}`} · ${race.time.toFixed(1)}s`,
  };

  if (dist(pp.x, pp.y, cp.x, cp.y) < 62) {
    race.cp++;
    game.audio.star();
    if (race.cp >= race.def.checkpoints.length) {
      const t = race.time;
      const tier = t <= race.def.par ? 0 : t <= race.def.par * 1.3 ? 1 : 2;
      const pay = race.def.pay[tier];
      const medal = ['Gold', 'Silver', 'Bronze'][tier];
      p.money += pay;
      game.stats.racesWon++;
      const best = game.stats.raceBest[race.def.id];
      const isBest = !best || t < best;
      if (isBest) game.stats.raceBest[race.def.id] = Math.round(t * 10) / 10;
      game.audio.cash();
      game.banner = {
        title: `${race.def.name} — ${medal}!`,
        lines: [`${t.toFixed(1)}s · +$${pay}${isBest ? ' · new best time!' : ''}`],
        t: 0,
      };
      game.race = null;
      game.saveDirty = true;
    }
  }
}
