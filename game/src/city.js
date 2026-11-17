// city.js — builds Solmar City: the road grid, the blocks, the buildings,
// the park, the beach, the docks and the landmarks the story uses.
// Everything is placed from a seeded RNG, so one seed is one city.

import { CITY, PALETTE } from './config.js';
import { RNG } from './rng.js';

const BUILDING_COLORS = [
  '#c98f6a', '#d9b380', '#a8b8c4', '#c4a8b8', '#e0cfa8',
  '#9fb8a0', '#c4a08a', '#b8c4d4', '#d4b8a0', '#a0b0a8',
  '#e8d8b0', '#b09a80', '#c8b8d8', '#98b8c8',
];
const ROOF_COLORS = ['#7a5f4c', '#6b5a4a', '#5a6b7a', '#8a7a6a', '#4a5a6a'];

/** A block's interior rectangle, in world coordinates. */
function blockRect(i, j) {
  const half = CITY.roadW / 2 + CITY.blockInset;
  return {
    x: i * CITY.pitch + half,
    y: j * CITY.pitch + half,
    w: CITY.pitch - half * 2,
    h: CITY.pitch - half * 2,
  };
}

/** Split one block rect into 1-4 building rects with small gaps. */
function splitBlock(rng, rect) {
  const buildings = [];
  const count = rng.int(1, 3);
  if (count === 1) {
    const pad = rng.range(6, 26);
    buildings.push({
      x: rect.x + pad, y: rect.y + pad,
      w: rect.w - pad * 2, h: rect.h - pad * 2,
    });
    return buildings;
  }
  const vertical = rng.chance(0.5);
  const gap = rng.range(14, 26);
  if (vertical) {
    const cut = rect.x + rect.w * rng.range(0.35, 0.65);
    buildings.push({ x: rect.x, y: rect.y, w: cut - rect.x - gap / 2, h: rect.h });
    buildings.push({ x: cut + gap / 2, y: rect.y, w: rect.x + rect.w - cut - gap / 2, h: rect.h });
  } else {
    const cut = rect.y + rect.h * rng.range(0.35, 0.65);
    buildings.push({ x: rect.x, y: rect.y, w: rect.w, h: cut - rect.y - gap / 2 });
    buildings.push({ x: rect.x, y: cut + gap / 2, w: rect.w, h: rect.y + rect.h - cut - gap / 2 });
  }
  if (count === 3 && rng.chance(0.6)) {
    const b = buildings[0];
    const cut = b.y + b.h * rng.range(0.4, 0.6);
    buildings.push({ x: b.x, y: cut + gap / 2, w: b.w, h: b.y + b.h - cut - gap / 2 });
    b.h = cut - b.y - gap / 2;
  }
  return buildings.filter((b) => b.w > 40 && b.h > 40);
}

export function buildCity(seed) {
  const rng = new RNG(seed);
  const n = CITY.roads - 1; // blocks per axis
  const buildings = [];
  const trees = [];
  const parks = [];
  const plazas = [];

  // Special blocks, keyed "i,j": park, beach, docks, foundry, plaza.
  const special = new Map();
  special.set('4,4', 'park'); // Palma Park, city centre
  special.set('3,4', 'plaza'); // Meridian Plaza, downtown
  special.set('7,0', 'foundry'); // Foundry Yard, north-east industry
  special.set('7,1', 'foundry');
  special.set('0,6', 'docks'); // the harbour, south-west
  special.set('0,7', 'beach');
  for (let i = 1; i < 8; i++) special.set(`${i},7`, 'beach'); // Palma Beach row

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const rect = blockRect(i, j);
      const kind = special.get(`${i},${j}`) || 'buildings';
      if (kind === 'buildings') {
        for (const b of splitBlock(rng, rect)) {
          buildings.push({
            ...b,
            color: rng.pick(BUILDING_COLORS),
            roof: rng.pick(ROOF_COLORS),
            // A few taller blocks read as towers on the minimap and skyline.
            tall: rng.chance(0.18),
          });
        }
      } else if (kind === 'park') {
        parks.push(rect);
        for (let t = 0; t < 26; t++) {
          trees.push({
            x: rng.range(rect.x + 14, rect.x + rect.w - 14),
            y: rng.range(rect.y + 14, rect.y + rect.h - 14),
            r: rng.range(9, 16),
          });
        }
      } else if (kind === 'plaza') {
        plazas.push(rect);
        for (let t = 0; t < 6; t++) {
          trees.push({
            x: rng.range(rect.x + 16, rect.x + rect.w - 16),
            y: rng.range(rect.y + 16, rect.y + rect.h - 16),
            r: rng.range(8, 12),
          });
        }
      } else if (kind === 'foundry') {
        // Big sheds with chimneys.
        buildings.push({
          x: rect.x + 12, y: rect.y + 12, w: rect.w - 24, h: rect.h * 0.55,
          color: '#8a7a68', roof: '#5a4a3c', tall: false, shed: true,
        });
        buildings.push({
          x: rect.x + 12, y: rect.y + rect.h * 0.62, w: rect.w * 0.45, h: rect.h * 0.3,
          color: '#7a6a58', roof: '#4a3a2c', tall: false, shed: true,
        });
      } else if (kind === 'docks') {
        // Crates and containers along the quay.
        for (let c = 0; c < 8; c++) {
          buildings.push({
            x: rect.x + 10 + (c % 4) * 52, y: rect.y + 14 + Math.floor(c / 4) * 46,
            w: 44, h: 36,
            color: rng.pick(['#b5654a', '#4a7a9a', '#7a9a4a', '#c4a04a']),
            roof: '#3a3230', tall: false, crate: true,
          });
        }
      } else if (kind === 'beach') {
        // A few palms and umbrellas on the sand.
        for (let t = 0; t < 5; t++) {
          trees.push({
            x: rng.range(rect.x + 18, rect.x + rect.w - 18),
            y: rng.range(rect.y + 18, rect.y + rect.h - 18),
            r: rng.range(9, 13), palm: true,
          });
        }
      }
    }
  }

  // Landmark meeting points, on road corners so missions can reach them.
  const at = (i, j) => ({ x: i * CITY.pitch, y: j * CITY.pitch });
  const landmarks = {
    anchor: { ...at(2, 5), name: 'The Rusty Anchor', blurb: "Sal Vega's bar" },
    hospital: { ...at(5, 2), name: 'Solmar General', blurb: 'Hospital — you wake up here' },
    garage: { ...at(1, 3), name: 'Color Rush Garage', blurb: 'Paint shop' },
    docks: { ...at(0, 6), name: 'Harbor Docks', blurb: 'Crates, cranes, quiet water' },
    foundry: { ...at(7, 0), name: 'Foundry Yard', blurb: "The Vipers' turf" },
    tower: { ...at(4, 2), name: 'Vera Tower', blurb: 'Downtown offices' },
    beachHut: { ...at(4, 7), name: 'Palma Beach Hut', blurb: 'The drop point' },
    park: { ...at(4, 4), name: 'Palma Park', blurb: 'The green heart of Solmar' },
  };

  const roadLines = [];
  for (let i = 0; i < CITY.roads; i++) roadLines.push(i * CITY.pitch);

  return {
    seed,
    buildings,
    trees,
    parks,
    plazas,
    landmarks,
    roadLines,
    // The beach strip and the sea beyond the last road.
    beachTop: 7 * CITY.pitch + CITY.roadW / 2,
    waterTop: 8 * CITY.pitch + CITY.roadW / 2 + 60,
    worldMin: -90,
    worldMax: CITY.size + 90,
    worldBottom: 8 * CITY.pitch + CITY.roadW / 2 + 220,
  };
}

/** True when a point sits on asphalt (within a road band). */
export function isOnRoad(city, x, y) {
  const half = CITY.roadW / 2;
  for (const line of city.roadLines) {
    if (Math.abs(x - line) <= half) return true;
    if (Math.abs(y - line) <= half) return true;
  }
  return false;
}

/** Push a circle out of every building it overlaps. Returns corrected {x, y}. */
export function collideBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    if (b.crate) continue; // crates are low: cars and people climb over the gaps
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      y = cy + (dy / d) * r;
    } else {
      // Centre inside the rect: push out along the smallest exit.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  return { x, y };
}

/** True when a circle overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (b.crate) continue;
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** A random point on a road centreline. */
export function randomRoadPoint(rng, city) {
  const vertical = rng.chance(0.5);
  const line = rng.pick(city.roadLines);
  const along = rng.range(40, CITY.size - 40);
  return vertical ? { x: line, y: along } : { x: along, y: line };
}

/** The nearest road centreline point to (x, y). */
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const line of city.roadLines) {
    const d1 = Math.abs(x - line);
    if (d1 < bestD) { bestD = d1; best = { x: line, y }; }
    const d2 = Math.abs(y - line);
    if (d2 < bestD) { bestD = d2; best = { x, y: line }; }
  }
  return best;
}
