// config.js — every tunable number for SOLMAR HEAT lives here, so balancing
// never means hunting through gameplay code.

export const GAME_TITLE = 'SOLMAR HEAT';
export const GAME_SUBTITLE = 'An open-world crime story in Solmar City';
export const SAVE_KEY = 'solmar-heat-save-v1';

// City layout: a grid of square blocks separated by roads.
export const CITY = {
  pitch: 300, // distance between neighbouring road centrelines (px)
  roads: 9, // roads per axis, at 0, 300, ... 2400
  roadW: 72, // asphalt width (px)
  sidewalk: 14, // sidewalk band on each side of a road (px)
  blockInset: 10, // buildings keep this far inside a block (px)
  size: 2400, // last road centreline; the city spans 0..2400 on both axes
};

// Player on foot.
export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  sprintSpeed: 330,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchArc: 1.1, // radians of aim tolerance for a punch
  pistolDamage: 34,
  pistolRange: 520,
  pistolCooldown: 0.22, // seconds between shots
  startAmmo: 48,
};

// Cars.
export const CAR = {
  length: 52,
  width: 26,
  accel: 420, // px/s^2
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560, // px/s, player cars
  trafficSpeed: 150, // px/s, cruising traffic
  policeSpeed: 620, // px/s, police pursuit cars
  turnRate: 2.6, // rad/s at full lock while moving
  health: 100,
  stealRadius: 64, // how close the player must be to press E
};

// Wanted / police.
export const WANTED = {
  // Heat thresholds for each star. Heat decays when no officer can see you.
  starHeat: [0, 120, 300, 520, 760, 1000],
  maxHeat: 1100,
  decayPerSec: 26, // heat lost per second while unseen
  decaySeenPerSec: 4, // heat lost per second while a cop is near
  sightRange: 560, // a cop within this range "sees" the player
  heatStealCar: 120,
  heatHitPed: 90,
  heatShoot: 60,
  heatKillCop: 260,
  heatRamCop: 140,
  bustedHoldSec: 1.6, // an officer must stay this close this long to bust you
  bustedRange: 34,
  maxPoliceCars: 6,
  maxFootCops: 4,
};

// Missions / story.
export const STORY = {
  hero: 'Jax Moreno',
  heroJob: 'wheelman for hire',
  fixer: 'Sal Vega',
  fixerPlace: 'The Rusty Anchor',
  gang: 'The Vipers',
  gangBoss: 'Dario Kane',
  city: 'Solmar City',
};

// Palette: a sun-soaked coastal city, warm late-afternoon light.
export const PALETTE = {
  ground: '#b7c48d', // dry grass between blocks
  sand: '#e9d49b',
  water: '#3f8fb5',
  waterDeep: '#2f6f96',
  road: '#3c414d',
  roadEdge: '#2e323c',
  laneDash: '#e8c95a',
  sidewalk: '#c9c4b4',
  curb: '#a8a28e',
  park: '#6fae5e',
  parkDark: '#5c9a4c',
  tree: '#3f7d33',
  treeLight: '#57a047',
  buildingRoof: '#8a6f5c',
  plaza: '#b9b2a0',
  hudPanel: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f5f2e8',
  accent: '#ffb02e',
  policeBlue: '#2f7fe0',
  policeRed: '#e03a2f',
};

// Car paint jobs (original model names, no real brands).
export const CAR_MODELS = [
  { name: 'Comet GT', color: '#d8433a', maxSpeed: 580 },
  { name: 'Sunset Coupe', color: '#e8912d', maxSpeed: 540 },
  { name: 'Harbor Sedan', color: '#3f6fb5', maxSpeed: 500 },
  { name: 'Palm Taxi', color: '#e8c832', maxSpeed: 480 },
  { name: 'Dune Pickup', color: '#7d8a99', maxSpeed: 520 },
  { name: 'Vice Cruiser', color: '#7a4fa3', maxSpeed: 500 },
  { name: 'Mint Compact', color: '#4fae8d', maxSpeed: 470 },
  { name: 'Night Van', color: '#5a5f6b', maxSpeed: 450 },
];

export const PED_SHIRTS = [
  '#e05a4e', '#4e8fd6', '#e8b13c', '#63b06a', '#9a5fb5',
  '#e8e4da', '#d67ba8', '#5fb5ad', '#c97b3f', '#7a8a99',
];
