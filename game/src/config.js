// CINDER BAY — central tuning constants, palette and naming.
// Every gameplay number lives here so the other modules stay readable.

export const WORLD = {
  blocksX: 15,
  blocksY: 15,
  cell: 320,          // one city block plus its share of road, in world pixels
  road: 76,           // road width between blocks
  sidewalk: 16,       // pavement strip around every block
};

export const WORLD_W = WORLD.blocksX * WORLD.cell;
export const WORLD_H = WORLD.blocksY * WORLD.cell;

export const PLAYER = {
  radius: 11,
  walkSpeed: 168,
  sprintSpeed: 262,
  accel: 1400,
  maxHp: 100,
  maxArmor: 100,
  punchRange: 34,
  punchDamage: 14,
  punchCooldown: 0.34,
  enterCarRange: 46,
};

export const CAR = {
  length: 52,
  width: 26,
  maxSpeed: 430,
  reverseSpeed: 150,
  accel: 300,
  brake: 520,
  drag: 0.55,
  steerRate: 2.5,
  grip: 7.5,
  driftGrip: 2.2,
};

export const TRAFFIC = {
  targetCars: 26,
  cruiseSpeed: 150,
  spawnRadiusMin: 700,
  spawnRadiusMax: 1150,
  despawnRadius: 1500,
};

export const PEDS = {
  target: 34,
  walkSpeed: 52,
  fleeSpeed: 150,
  radius: 9,
};

export const POLICE = {
  carSpeed: 455,
  footSpeed: 205,
  sightRadius: 520,
  bustRadius: 44,
  bustTime: 2.6,
  shootRange: 320,
  spawnInterval: 4.5,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 20,
  decayPerSecond: 1.1,
  crimeHeat: {
    hitPed: 6,
    killPed: 14,
    hitCar: 2.5,
    stealCar: 5,
    shootNearCop: 10,
    killCop: 26,
    explosion: 12,
  },
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 14, cooldown: 0.34, range: 34, auto: false, spread: 0, pellets: 1, ammoUse: 0 },
  pistol: { name: 'P9 Pistol', damage: 26, cooldown: 0.26, range: 520, auto: false, spread: 0.02, pellets: 1, ammoUse: 1 },
  smg: { name: 'Kestrel SMG', damage: 13, cooldown: 0.085, range: 480, auto: true, spread: 0.07, pellets: 1, ammoUse: 1 },
  scatter: { name: 'Scattergun', damage: 9, cooldown: 0.85, range: 300, auto: false, spread: 0.16, pellets: 6, ammoUse: 1 },
};

export const PRICES = {
  pistol: 250,
  smg: 900,
  scatter: 650,
  ammoBox: 60,
  armor: 300,
  respray: 150,
  hospitalFee: 120,
  bailFee: 200,
};

export const PALETTE = {
  grass: '#7fae56',
  grassDark: '#6d9c48',
  sand: '#e8d29a',
  water: '#3d8fc4',
  waterDeep: '#2f76a8',
  asphalt: '#4a4a52',
  asphaltLight: '#565660',
  sidewalk: '#b9b4a8',
  sidewalkEdge: '#a49e90',
  parkPath: '#cbb98d',
  line: '#e8e4d8',
  lineYellow: '#f2c94c',
};

export const DISTRICT_NAMES = {
  downtown: 'Downtown',
  harbor: 'The Harbor',
  suburbs: 'Palm Heights',
  market: 'Old Market',
  park: 'Verdant Park',
  beach: 'South Beach',
  mixed: 'Midtown',
};

export const CAR_MODELS = [
  { name: 'Comet Coupe', color: '#c0392b', speedMul: 1.08 },
  { name: 'Harbor Sedan', color: '#2e6da4', speedMul: 1.0 },
  { name: 'Sun Taxi', color: '#f2c94c', speedMul: 1.02 },
  { name: 'Palm Wagon', color: '#7d8c5c', speedMul: 0.94 },
  { name: 'Dock Pickup', color: '#8a6d4b', speedMul: 0.96 },
  { name: 'Velvet GT', color: '#6c3483', speedMul: 1.14 },
  { name: 'Bay Runner', color: '#148f77', speedMul: 1.05 },
  { name: 'City Hatch', color: '#d5d8dc', speedMul: 0.98 },
];

export const PED_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#ecf0f1', '#e67e22', '#1abc9c', '#fd79a8', '#fdcb6e'];

export const BUILDING_COLORS = ['#d9c7a7', '#c9b8a3', '#b7c4ce', '#e0b8a0', '#a8b8a0', '#cfd4d8', '#e5d3b3', '#bfa48f', '#9fb4c0', '#d8b4b4'];

export const SHOP_NAMES = [
  'Salt & Smoke Diner', 'Cinder Arms', "Milo's Respray", 'Bayview Pharmacy', 'Noodle Nook',
  'Tidewater Grocers', 'The Gilded Palm Hotel', 'Harbor Customs', 'Sunset Records', 'Laundromat Luxe',
  'Cinder Bay Bank', 'Marina Chandlery', 'Palm Court Café', 'Dockside Fitness', 'Old Tomas Pawn',
];
