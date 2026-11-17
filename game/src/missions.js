// missions.js — "The Solmar Job": six story missions from Sal Vega, the
// fixer at The Rusty Anchor. Each mission is a small state machine with a
// marker on the map, an objective line on the HUD, and a cash reward.

import { addHeat, clearWanted } from './police.js';
import { makeViper } from './entities.js';

export const MISSIONS = [
  {
    id: 'meet-sal',
    title: 'Meet Sal',
    reward: 150,
    briefing: "Sal Vega wants a word. He runs jobs out of The Rusty Anchor bar. Go and hear him out — on foot, in a car, your call.",
  },
  {
    id: 'borrowed-wheels',
    title: 'Borrowed Wheels',
    reward: 300,
    briefing: 'Sal needs a clean car. Take any car on the street — press E next to one — and bring it to the Color Rush Garage.',
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    reward: 600,
    briefing: 'A package is waiting at the Harbor Docks. Grab it, then bring it back to Sal. The docks are watched — expect company.',
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    reward: 800,
    briefing: "Somebody talked. The Solmar PD has your name and your plate. Survive three stars for a minute, then shake them off.",
  },
  {
    id: 'night-drop',
    title: 'The Night Drop',
    reward: 1200,
    briefing: 'Pick up the cash at Vera Tower and run it to the Palma Beach Hut. Two stars, a 150-second clock, no excuses.',
  },
  {
    id: 'payback',
    title: 'Payback at the Foundry',
    reward: 2000,
    briefing: "Dario Kane's Vipers set you up. They are holed up at the Foundry Yard. End it — all five of them — and Solmar is yours.",
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.index = game.save.missionIndex || 0;
    this.stage = 0;
    this.timer = 0;
    this.active = false;
    this.done = game.save.storyComplete === true;
    this.objective = '';
    this.marker = null;
    this.completedCount = game.save.missionsDone.length;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  startMission(index) {
    const game = this.game;
    this.index = index;
    this.stage = 0;
    this.timer = 0;
    this.active = true;
    const m = MISSIONS[index];
    game.addToast(`New mission: ${m.title}`, '#ffb02e');
    game.audio.fanfare();
    if (index === 3) {
      this.timer = 60;
      addHeat(game, 520, 'the setup');
    }
    this.refreshObjective();
  }

  /** Recompute the objective line and map marker for the current stage. */
  refreshObjective() {
    const game = this.game;
    const L = game.city.landmarks;
    const i = this.index;
    const s = this.stage;
    if (i === 0) {
      this.objective = 'Go to The Rusty Anchor to meet Sal Vega';
      this.marker = L.anchor;
    } else if (i === 1) {
      if (s === 0) {
        this.objective = 'Steal a car — press E next to any car';
        this.marker = null;
      } else {
        this.objective = 'Drive the car to the Color Rush Garage';
        this.marker = L.garage;
      }
    } else if (i === 2) {
      if (s === 0) {
        this.objective = 'Go to the Harbor Docks and pick up the package';
        this.marker = L.docks;
      } else {
        this.objective = 'Deliver the package to Sal at The Rusty Anchor';
        this.marker = L.anchor;
      }
    } else if (i === 3) {
      if (s === 0) {
        this.objective = `Survive the police — ${Math.ceil(this.timer)}s left`;
        this.marker = null;
      } else {
        this.objective = 'Lose the cops — get your wanted level to zero';
        this.marker = null;
      }
    } else if (i === 4) {
      if (s === 0) {
        this.objective = 'Pick up the cash at Vera Tower';
        this.marker = L.tower;
      } else {
        this.objective = `Deliver the cash to the Palma Beach Hut — ${Math.ceil(this.timer)}s left`;
        this.marker = L.beachHut;
      }
    } else if (i === 5) {
      if (s === 0) {
        this.objective = "Get to the Foundry Yard — the Vipers are waiting";
        this.marker = L.foundry;
      } else {
        const left = game.vipers.filter((v) => v.state !== 'down').length;
        this.objective = `Take down the Vipers — ${left} left`;
        this.marker = L.foundry;
      }
    }
  }

  /** Distance from the player to the current marker, in metres (1m = 4px). */
  markerDistance() {
    if (!this.marker) return 0;
    const p = this.game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    return Math.round(Math.hypot(this.marker.x - px, this.marker.y - py) / 4);
  }

  nearMarker(range) {
    if (!this.marker) return false;
    const p = this.game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    return Math.hypot(this.marker.x - px, this.marker.y - py) < range;
  }

  update(dt) {
    const game = this.game;
    if (this.done || !this.active) return;
    const m = this.current;
    if (!m) return;
    const L = game.city.landmarks;

    if (this.index === 0) {
      if (this.nearMarker(70)) this.completeMission();
    } else if (this.index === 1) {
      if (this.stage === 0) {
        if (game.player.inCar) {
          this.stage = 1;
          game.addToast('Nice wheels. Now bring it to the garage.', '#ffb02e');
          this.refreshObjective();
        }
      } else if (this.nearMarker(80) && game.player.inCar) {
        this.completeMission();
      }
    } else if (this.index === 2) {
      if (this.stage === 0) {
        if (this.nearMarker(70)) {
          this.stage = 1;
          game.addToast('Package secured. The docks are hot — move!', '#e03a2f');
          addHeat(game, 120, 'stealing the package');
          this.refreshObjective();
        }
      } else if (this.nearMarker(70)) {
        this.completeMission();
      }
    } else if (this.index === 3) {
      if (this.stage === 0) {
        this.timer -= dt;
        this.refreshObjective();
        if (this.timer <= 0) {
          this.stage = 1;
          game.addToast('A minute survived. Now lose them.', '#ffb02e');
          this.refreshObjective();
        }
      } else if (game.wanted.stars === 0) {
        this.completeMission();
      }
    } else if (this.index === 4) {
      if (this.stage === 0) {
        if (this.nearMarker(70)) {
          this.stage = 1;
          this.timer = 150;
          game.addToast('Cash in hand. Two stars — run the beach road!', '#e03a2f');
          addHeat(game, 300, 'the night drop');
          this.refreshObjective();
        }
      } else {
        this.timer -= dt;
        this.refreshObjective();
        if (this.nearMarker(70)) {
          this.completeMission();
        } else if (this.timer <= 0) {
          game.addToast('Too slow — the drop went cold. Try again.', '#e03a2f');
          this.startMission(4);
        }
      }
    } else if (this.index === 5) {
      if (this.stage === 0) {
        if (this.nearMarker(140)) {
          this.stage = 1;
          game.vipers.length = 0;
          for (let k = 0; k < 5; k++) {
            game.vipers.push(makeViper(
              L.foundry.x + game.rng.range(-120, 180),
              L.foundry.y + game.rng.range(-40, 220),
              game.rng,
            ));
          }
          game.player.hasPistol = true;
          game.player.ammo = Math.max(game.player.ammo, 72);
          game.addToast("Five Vipers. Dario Kane is watching. Make it count.", '#e03a2f');
          addHeat(game, 120, 'the foundry fight');
          this.refreshObjective();
        }
      } else if (game.vipers.every((v) => v.state === 'down')) {
        this.completeMission();
      } else {
        this.refreshObjective();
      }
    }
  }

  completeMission() {
    const game = this.game;
    const m = this.current;
    game.save.cash += m.reward;
    game.player.cash = game.save.cash;
    game.save.missionsDone.push(m.id);
    game.save.stats.missionsPlayed++;
    game.audio.cash();
    game.audio.fanfare();
    game.addToast(`Mission complete: ${m.title}  +$${m.reward}`, '#34c759');
    clearWanted(game);
    game.persistSave();
    if (this.index === 0) {
      game.addToast("Sal: 'You drive good, kid. I got work for you.'", '#ffb02e');
    }
    if (this.index === 1) {
      game.player.hasPistol = true;
      game.player.ammo += 48;
      game.addToast("Sal left a pistol in the glovebox. It's yours now.", '#ffb02e');
    }
    if (this.index === 5) {
      this.done = true;
      this.active = false;
      game.save.storyComplete = true;
      game.save.missionIndex = MISSIONS.length;
      game.persistSave();
      game.storyComplete();
      return;
    }
    this.index++;
    game.save.missionIndex = this.index;
    game.persistSave();
    this.startMission(this.index);
  }
}
