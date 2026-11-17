// save.js — localStorage save slot for SOLMAR HEAT: cash, story progress
// and lifetime stats. Nothing leaves the player's own browser.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    version: 1,
    cash: 250,
    missionIndex: 0,
    storyComplete: false,
    missionsDone: [],
    stats: {
      carsStolen: 0,
      distanceDriven: 0,
      pedsFled: 0,
      shotsFired: 0,
      missionsPlayed: 0,
    },
    settings: { muted: false },
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const save = defaultSave();
    return {
      ...save,
      ...parsed,
      stats: { ...save.stats, ...(parsed.stats || {}) },
      settings: { ...save.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked (private mode): the game still plays.
  }
}
