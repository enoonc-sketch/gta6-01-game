// Save and load the player's progress in localStorage: cash, weapons, story
// progress, lucky shells found and where Rhea is standing. No server involved.

const SAVE_KEY = 'cinderbay.save.v1';

export function saveGame(game) {
  try {
    const data = {
      money: game.player.money,
      weapons: game.player.weapons,
      ammo: game.player.ammo,
      currentWeapon: game.player.currentWeapon,
      armor: game.player.armor,
      missionIndex: game.story.index,
      shellsFound: game.city.shells.map((s) => (s.taken ? 1 : 0)).join(''),
      x: game.player.x,
      y: game.player.y,
      clock: game.clock,
      jobsDone: game.stats.jobsDone,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}
