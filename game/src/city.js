// Procedural generation of Cinder Bay: a 15x15 block port city with districts,
// a road grid, buildings, props and the named places the story uses.
// Everything is derived from one seed so every run builds the same city.

import { WORLD, WORLD_W, WORLD_H, BUILDING_COLORS, SHOP_NAMES, DISTRICT_NAMES } from './config.js';
import { makeRng, clamp } from './rng.js';

const CELL = WORLD.cell;
const ROAD = WORLD.road;
const HALF_ROAD = ROAD / 2;
export const LANE_OFFSET = 19;
export const WATER_Y = WORLD_H - 90; // south of this line is the bay

export function roadCenterX(i) { return i * CELL; }
export function roadCenterY(j) { return j * CELL; }

// Lane-correct point on the road between two neighbouring intersections.
// Right-hand traffic: eastbound keeps south, southbound keeps west.
export function laneTarget(fromI, fromJ, toI, toJ) {
  const tx = roadCenterX(toI);
  const ty = roadCenterY(toJ);
  if (toI > fromI) return { x: tx, y: ty + LANE_OFFSET };       // eastbound
  if (toI < fromI) return { x: tx, y: ty - LANE_OFFSET };       // westbound
  if (toJ > fromJ) return { x: tx - LANE_OFFSET, y: ty };       // southbound
  return { x: tx + LANE_OFFSET, y: ty };                        // northbound
}

export function nearestIntersection(x, y) {
  return {
    i: clamp(Math.round(x / CELL), 0, WORLD.blocksX),
    j: clamp(Math.round(y / CELL), 0, WORLD.blocksY),
  };
}

export function isOnRoad(x, y) {
  const fx = ((x % CELL) + CELL) % CELL;
  const fy = ((y % CELL) + CELL) % CELL;
  return fx < HALF_ROAD || fx > CELL - HALF_ROAD || fy < HALF_ROAD || fy > CELL - HALF_ROAD;
}

function districtOf(i, j) {
  if (j >= 14) return 'beach';
  if (i === 4 && j === 10) return 'park';
  if (Math.abs(i - 7) <= 2 && Math.abs(j - 6) <= 2) return 'downtown';
  if (j >= 11 && i >= 9) return 'harbor';
  if (i <= 4 && j >= 4 && j <= 8) return 'market';
  if (i <= 5 && j <= 4) return 'suburbs';
  return 'mixed';
}

export function districtNameAt(x, y) {
  const i = clamp(Math.floor(x / CELL), 0, WORLD.blocksX - 1);
  const j = clamp(Math.floor(y / CELL), 0, WORLD.blocksY - 1);
  const d = districtOf(i, j);
  return DISTRICT_NAMES[d] || 'Cinder Bay';
}

// Special places the story and shops hang off, by block coordinates.
const SPECIALS = [
  { key: 'diner', i: 7, j: 7, name: 'Salt & Smoke Diner', color: '#e07840' },
  { key: 'gunShop', i: 3, j: 6, name: 'Cinder Arms', color: '#5d6d7e' },
  { key: 'pharmacy', i: 4, j: 5, name: 'Bayview Pharmacy', color: '#58b09c' },
  { key: 'respray', i: 10, j: 9, name: "Milo's Respray", color: '#7d3c98' },
  { key: 'garage', i: 11, j: 10, name: 'Harbor Customs', color: '#c97b2d' },
  { key: 'hospital', i: 8, j: 4, name: 'St. Brigid General', color: '#ecf0f1' },
  { key: 'police', i: 6, j: 8, name: 'Cinder Bay Police HQ', color: '#2e4053' },
  { key: 'warehouse', i: 12, j: 12, name: 'Pier 9 Warehouse', color: '#935116' },
];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const props = [];
  const solids = [];
  const places = {};
  const parkedSpots = [];
  let shopNameIdx = 0;

  const addBuilding = (b) => {
    buildings.push(b);
    solids.push(b);
    return b;
  };

  for (let j = 0; j < WORLD.blocksY; j++) {
    for (let i = 0; i < WORLD.blocksX; i++) {
      const district = districtOf(i, j);
      const bx = i * CELL + HALF_ROAD;
      const by = j * CELL + HALF_ROAD;
      const bw = CELL - ROAD;
      const bh = CELL - ROAD;

      if (district === 'beach') {
        // Sand, palms and beach clutter; no buildings.
        for (let k = 0; k < 5; k++) {
          props.push({ x: bx + rng.range(10, bw - 10), y: by + rng.range(8, 60), type: 'palm', r: 6, solid: true, sway: rng.range(0, 6.28) });
        }
        for (let k = 0; k < 3; k++) {
          props.push({ x: bx + rng.range(20, bw - 20), y: by + rng.range(70, 130), type: 'umbrella', r: 8, solid: false, color: rng.pick(['#e74c3c', '#f39c12', '#1abc9c', '#fd79a8']) });
        }
        continue;
      }

      if (district === 'park') {
        for (let k = 0; k < 14; k++) {
          props.push({ x: bx + rng.range(16, bw - 16), y: by + rng.range(16, bh - 16), type: 'tree', r: 7, solid: true, sway: rng.range(0, 6.28) });
        }
        for (let k = 0; k < 6; k++) {
          props.push({ x: bx + rng.range(24, bw - 24), y: by + rng.range(24, bh - 24), type: 'bench', r: 6, solid: false, angle: rng.range(0, 3.14) });
        }
        props.push({ x: bx + bw / 2, y: by + bh / 2, type: 'pond', r: 34, solid: true });
        solids.push({ x: bx + bw / 2 - 30, y: by + bh / 2 - 22, w: 60, h: 44 });
        continue;
      }

      // One special building per named block, anchored to the south edge so its door faces a road.
      const special = SPECIALS.find((s) => s.i === i && s.j === j);
      if (special) {
        const w = 150;
        const h = 92;
        const b = addBuilding({
          x: bx + (bw - w) / 2, y: by + bh - h - 6, w, h,
          color: special.color, roof: '#00000022', height: 26,
          district, name: special.name, special: special.key, roofSeed: rng.int(1, 99999),
        });
        places[special.key] = {
          x: b.x + w / 2, y: b.y + h + 26,           // standing spot in front of the door
          doorX: b.x + w / 2, doorY: b.y + h,
          name: special.name, building: b,
        };
        // A smaller neighbour building so the block does not look empty.
        addBuilding({
          x: bx + 14, y: by + 14, w: 96, h: 70,
          color: rng.pick(BUILDING_COLORS), roof: '#00000022', height: rng.int(20, 34),
          district, roofSeed: rng.int(1, 99999),
        });
        continue;
      }

      // Ordinary blocks: a 2x2 or 1x2 arrangement of buildings with alleys between.
      const tall = district === 'downtown';
      const cols = rng.chance(0.5) ? 2 : 1;
      const rows = rng.chance(0.6) ? 2 : 1;
      const gap = 14;
      const cellW = (bw - 24 - gap * (cols - 1)) / cols;
      const cellH = (bh - 24 - gap * (rows - 1)) / rows;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          if (rng.chance(0.12)) continue; // empty lot
          const w = cellW * rng.range(0.78, 0.98);
          const h = cellH * rng.range(0.78, 0.98);
          const isShop = (district === 'market' || district === 'downtown') && rng.chance(0.45);
          addBuilding({
            x: bx + 12 + cx * (cellW + gap) + (cellW - w) / 2,
            y: by + 12 + cy * (cellH + gap) + (cellH - h) / 2,
            w, h,
            color: rng.pick(BUILDING_COLORS),
            roof: '#00000022',
            height: tall ? rng.int(56, 120) : rng.int(16, 38),
            district,
            name: isShop ? SHOP_NAMES[shopNameIdx++ % SHOP_NAMES.length] : null,
            roofSeed: rng.int(1, 99999),
          });
        }
      }
    }
  }

  // Street furniture: lamps on intersection corners, palms along sidewalks, hydrants.
  for (let j = 0; j <= WORLD.blocksY; j++) {
    for (let i = 0; i <= WORLD.blocksX; i++) {
      const cx = roadCenterX(i);
      const cy = roadCenterY(j);
      props.push({ x: cx - HALF_ROAD - 6, y: cy - HALF_ROAD - 6, type: 'lamp', r: 4, solid: true });
      if (rng.chance(0.5)) props.push({ x: cx + HALF_ROAD + 6, y: cy + HALF_ROAD + 6, type: 'lamp', r: 4, solid: true });
    }
  }
  for (let k = 0; k < 260; k++) {
    const i = rng.int(0, WORLD.blocksX - 1);
    const j = rng.int(0, WORLD.blocksY - 2);
    const side = rng.int(0, 3);
    const bx = i * CELL + HALF_ROAD;
    const by = j * CELL + HALF_ROAD;
    const bw = CELL - ROAD;
    let x = bx + rng.range(8, bw - 8);
    let y = by + 8;
    if (side === 1) y = by + bw - 8;
    if (side === 2) { x = bx + 8; y = by + rng.range(8, bw - 8); }
    if (side === 3) { x = bx + bw - 8; y = by + rng.range(8, bw - 8); }
    props.push({ x, y, type: rng.chance(0.6) ? 'palm' : 'tree', r: 6, solid: true, sway: rng.range(0, 6.28) });
  }
  for (let k = 0; k < 40; k++) {
    const i = rng.int(0, WORLD.blocksX - 1);
    const j = rng.int(0, WORLD.blocksY - 2);
    props.push({ x: i * CELL + HALF_ROAD + 4, y: j * CELL + rng.range(60, CELL - 60), type: 'hydrant', r: 4, solid: true });
  }

  // Phone booths for courier jobs.
  const boothBlocks = [[2, 2], [12, 3], [3, 12], [11, 11]];
  places.phoneBooths = boothBlocks.map(([i, j]) => ({
    x: i * CELL + HALF_ROAD + 10, y: j * CELL + HALF_ROAD + 10,
  }));
  for (const b of places.phoneBooths) props.push({ x: b.x, y: b.y, type: 'booth', r: 7, solid: true });

  // Parked car spots along road edges.
  for (let k = 0; k < 90; k++) {
    const vertical = rng.chance(0.5);
    const i = rng.int(1, WORLD.blocksX - 1);
    const j = rng.int(1, WORLD.blocksY - 2);
    if (vertical) {
      parkedSpots.push({ x: roadCenterX(i) + (rng.chance(0.5) ? 30 : -30), y: j * CELL + rng.range(60, CELL - 60), angle: Math.PI / 2 });
    } else {
      parkedSpots.push({ x: i * CELL + rng.range(60, CELL - 60), y: roadCenterY(j) + (rng.chance(0.5) ? 30 : -30), angle: 0 });
    }
  }

  // Twenty lucky shells to find: park, beach, alleys, docks.
  const shells = [];
  const shellSpots = [
    [4 * CELL + 120, 10 * CELL + 90], [4 * CELL + 200, 10 * CELL + 180],
    [2 * CELL + 80, WORLD_H - 160], [6 * CELL + 200, WORLD_H - 150],
    [10 * CELL + 120, WORLD_H - 170], [13 * CELL + 90, WORLD_H - 155],
    [7 * CELL + 60, 7 * CELL + 60], [8 * CELL + 250, 5 * CELL + 70],
    [12 * CELL + 140, 12 * CELL + 60], [12 * CELL + 260, 13 * CELL + 200],
    [1 * CELL + 90, 1 * CELL + 240], [14 * CELL + 200, 2 * CELL + 80],
    [3 * CELL + 260, 6 * CELL + 260], [9 * CELL + 70, 9 * CELL + 250],
    [5 * CELL + 180, 13 * CELL + 120], [11 * CELL + 60, 4 * CELL + 190],
    [0 * CELL + 160, 8 * CELL + 160], [14 * CELL + 80, 9 * CELL + 90],
    [6 * CELL + 200, 2 * CELL + 260], [10 * CELL + 250, 7 * CELL + 60],
  ];
  for (const [x, y] of shellSpots) shells.push({ x, y, taken: false });

  // The docks: piers into the bay at the south-east.
  const piers = [];
  for (const px of [10 * CELL + 60, 12 * CELL + 60, 13 * CELL + 200]) {
    piers.push({ x: px, y: WATER_Y - 10, w: 26, h: 150 });
  }

  return { buildings, props, solids, places, parkedSpots, shells, piers, seed };
}

// Sidewalk ring waypoints around a block, for pedestrians.
export function sidewalkRing(i, j) {
  const bx = i * CELL + HALF_ROAD + 8;
  const by = j * CELL + HALF_ROAD + 8;
  const bw = CELL - ROAD - 16;
  return [
    { x: bx, y: by }, { x: bx + bw, y: by },
    { x: bx + bw, y: by + bw }, { x: bx, y: by + bw },
  ];
}

export function randomRoadPoint(rng) {
  const vertical = rng.chance(0.5);
  if (vertical) {
    const i = rng.int(0, WORLD.blocksX);
    return { x: roadCenterX(i) + rng.range(-26, 26), y: rng.range(40, WORLD_H - 200) };
  }
  const j = rng.int(0, WORLD.blocksY - 1);
  return { x: rng.range(40, WORLD_W - 40), y: roadCenterY(j) + rng.range(-26, 26) };
}
