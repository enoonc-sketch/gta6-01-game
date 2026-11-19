// Renderer: chunked pre-rendered ground, y-sorted extruded buildings and
// entities, day/night lighting with headlights, and the minimap.
// Everything is drawn with Canvas 2D shapes — the game ships no image files.

import { WORLD, WORLD_W, WORLD_H, PALETTE } from './config.js';
import { clamp, dist } from './rng.js';
import { WATER_Y, roadCenterX, roadCenterY } from './city.js';
import { RACES } from './activities.js';

const CHUNK = 1024;

export function nightFactor(clock) {
  // 0 at midday, 1 in the small hours; smooth dawn and dusk ramps.
  const t = ((clock % 24) + 24) % 24;
  if (t > 7 && t < 17) return 0;
  if (t >= 17 && t <= 20) return (t - 17) / 3;
  if (t > 20 || t < 5) return 1;
  return 1 - (t - 5) / 2;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const chunks = new Map();
  let minimapBase = null;

  function groundChunk(game, cx, cy) {
    const key = `${cx},${cy}`;
    if (chunks.has(key)) return chunks.get(key);
    const c = document.createElement('canvas');
    c.width = CHUNK;
    c.height = CHUNK;
    const g = c.getContext('2d');
    const ox = cx * CHUNK;
    const oy = cy * CHUNK;
    g.translate(-ox, -oy);

    // Base grass with subtle mow stripes.
    g.fillStyle = PALETTE.grass;
    g.fillRect(ox, oy, CHUNK, CHUNK);
    g.fillStyle = PALETTE.grassDark;
    for (let y = Math.floor(oy / 64) * 64; y < oy + CHUNK; y += 128) g.fillRect(ox, y, CHUNK, 64);

    // Beach sand and the bay.
    if (oy + CHUNK > WORLD_H - 320) {
      g.fillStyle = PALETTE.sand;
      g.fillRect(ox, WORLD_H - 320, CHUNK, 320);
      g.fillStyle = PALETTE.waterDeep;
      g.fillRect(ox, WATER_Y, CHUNK, WORLD_H - WATER_Y + CHUNK);
      g.fillStyle = PALETTE.water;
      g.fillRect(ox, WATER_Y, CHUNK, 26);
    }

    // Sidewalk slabs around each block.
    const bi0 = Math.max(0, Math.floor(ox / WORLD.cell) - 1);
    const bi1 = Math.min(WORLD.blocksX - 1, Math.floor((ox + CHUNK) / WORLD.cell) + 1);
    const bj0 = Math.max(0, Math.floor(oy / WORLD.cell) - 1);
    const bj1 = Math.min(WORLD.blocksY - 1, Math.floor((oy + CHUNK) / WORLD.cell) + 1);
    for (let j = bj0; j <= bj1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        if (j >= 14) continue;
        const bx = i * WORLD.cell + WORLD.road / 2;
        const by = j * WORLD.cell + WORLD.road / 2;
        const bw = WORLD.cell - WORLD.road;
        g.fillStyle = PALETTE.sidewalk;
        g.fillRect(bx, by, bw, bw);
        g.strokeStyle = PALETTE.sidewalkEdge;
        g.lineWidth = 2;
        g.strokeRect(bx + 1, by + 1, bw - 2, bw - 2);
        // Park paths and pond.
        if (i === 4 && j === 10) {
          g.fillStyle = PALETTE.grass;
          g.fillRect(bx + 6, by + 6, bw - 12, bw - 12);
          g.fillStyle = PALETTE.parkPath;
          g.fillRect(bx, by + bw / 2 - 9, bw, 18);
          g.fillRect(bx + bw / 2 - 9, by, 18, bw);
          g.fillStyle = PALETTE.water;
          g.beginPath();
          g.ellipse(bx + bw / 2, by + bw / 2, 34, 24, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Roads: asphalt strips, centre dashes, crosswalks.
    g.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= WORLD.blocksX; i++) {
      const x = roadCenterX(i);
      if (x + 40 < ox || x - 40 > ox + CHUNK) continue;
      g.fillRect(x - WORLD.road / 2, oy, WORLD.road, CHUNK);
    }
    for (let j = 0; j <= WORLD.blocksY; j++) {
      const y = roadCenterY(j);
      if (y + 40 < oy || y - 40 > oy + CHUNK) continue;
      g.fillRect(ox, y - WORLD.road / 2, CHUNK, WORLD.road);
    }
    g.fillStyle = PALETTE.line;
    for (let i = 0; i <= WORLD.blocksX; i++) {
      const x = roadCenterX(i);
      if (x + 40 < ox || x - 40 > ox + CHUNK) continue;
      for (let y = Math.floor(oy / 48) * 48; y < oy + CHUNK; y += 48) {
        if (Math.abs(((y % WORLD.cell) + WORLD.cell) % WORLD.cell) < 46) continue;
        g.fillRect(x - 2, y, 4, 24);
      }
    }
    for (let j = 0; j <= WORLD.blocksY; j++) {
      const y = roadCenterY(j);
      if (y + 40 < oy || y - 40 > oy + CHUNK) continue;
      for (let x = Math.floor(ox / 48) * 48; x < ox + CHUNK; x += 48) {
        if (Math.abs(((x % WORLD.cell) + WORLD.cell) % WORLD.cell) < 46) continue;
        g.fillRect(x, y - 2, 24, 4);
      }
    }
    // Crosswalk stripes at intersections.
    g.fillStyle = 'rgba(232,228,216,0.75)';
    for (let j = 0; j <= WORLD.blocksY; j++) {
      for (let i = 0; i <= WORLD.blocksX; i++) {
        const x = roadCenterX(i);
        const y = roadCenterY(j);
        if (x < ox - 60 || x > ox + CHUNK + 60 || y < oy - 60 || y > oy + CHUNK + 60) continue;
        for (let s = -30; s <= 30; s += 12) {
          g.fillRect(x + s - 3, y - WORLD.road / 2 + 4, 6, 12);
          g.fillRect(x + s - 3, y + WORLD.road / 2 - 16, 6, 12);
          g.fillRect(x - WORLD.road / 2 + 4, y + s - 3, 12, 6);
          g.fillRect(x + WORLD.road / 2 - 16, y + s - 3, 12, 6);
        }
      }
    }

    // Piers into the bay.
    g.fillStyle = '#8a6d4b';
    for (const pier of game.city.piers) {
      if (pier.x + pier.w < ox || pier.x > ox + CHUNK) continue;
      g.fillRect(pier.x, pier.y, pier.w, pier.h);
      g.fillStyle = '#75582f';
      for (let y = pier.y; y < pier.y + pier.h; y += 14) g.fillRect(pier.x, y, pier.w, 3);
      g.fillStyle = '#8a6d4b';
    }

    chunks.set(key, c);
    return c;
  }

  function drawBuilding(b, view) {
    const h = b.height;
    const ex = h * 0.34; // extrusion offset (south-east)
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + ex * 0.7, b.y + ex * 0.7, b.w, b.h);
    // East and south faces
    ctx.fillStyle = shade(b.color, 0.62);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + ex, b.y + ex);
    ctx.lineTo(b.x + b.w + ex, b.y + b.h + ex);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.color, 0.78);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + ex, b.y + b.h + ex);
    ctx.lineTo(b.x + ex, b.y + b.h + ex);
    ctx.closePath();
    ctx.fill();
    // Windows on the south face
    ctx.fillStyle = 'rgba(255,240,180,0.5)';
    const cols = Math.max(2, Math.floor(b.w / 26));
    for (let i = 0; i < cols; i++) {
      const wx = b.x + 8 + i * ((b.w - 16) / cols);
      ctx.fillRect(wx, b.y + b.h + ex * 0.35, 9, 7);
    }
    // Roof
    ctx.fillStyle = shade(b.color, 1.06);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Rooftop clutter from the building's seed.
    let s = b.roofSeed;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    const units = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < units; i++) {
      const uw = 12 + rnd() * 20;
      const uh = 10 + rnd() * 14;
      ctx.fillRect(b.x + 8 + rnd() * Math.max(1, b.w - uw - 16), b.y + 8 + rnd() * Math.max(1, b.h - uh - 16), uw, uh);
    }
    if (b.height > 70) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shop sign band with the name.
    if (b.name) {
      ctx.fillStyle = b.special ? '#ffd166' : '#2f3542';
      ctx.fillRect(b.x, b.y + b.h - 16, b.w, 16);
      ctx.fillStyle = b.special ? '#2f3542' : '#f5f6fa';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h - 4, b.w - 6);
    }
  }

  function drawProp(p, t) {
    if (p.type === 'tree' || p.type === 'palm') {
      const sway = Math.sin(t * 1.3 + (p.sway || 0)) * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(p.x + 4, p.y + 4, p.r + 4, p.r + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.type === 'palm' ? '#3f9e4d' : '#2f7d3a';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + (p.sway || 0);
        ctx.beginPath();
        ctx.ellipse(p.x + Math.cos(a) * 5 + sway, p.y + Math.sin(a) * 5, p.r + 3, p.r - 1, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#6d4c2f';
      ctx.beginPath();
      ctx.arc(p.x + sway * 0.4, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'lamp') {
      ctx.fillStyle = '#57606f';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.fillStyle = '#ffeaa7';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'bench') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle || 0);
      ctx.fillStyle = '#8a6d4b';
      ctx.fillRect(-9, -3, 18, 6);
      ctx.restore();
    } else if (p.type === 'hydrant') {
      ctx.fillStyle = '#d63031';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'umbrella') {
      ctx.fillStyle = p.color || '#e74c3c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'booth') {
      ctx.fillStyle = '#0984e3';
      ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
      ctx.fillStyle = '#dfe6e9';
      ctx.fillRect(p.x - 4, p.y - 4, 8, 5);
    } else if (p.type === 'barrier') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle || 0);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-13, -2, 28, 7);
      ctx.fillStyle = '#e17055';
      ctx.fillRect(-14, -4, 28, 8);
      ctx.fillStyle = '#f5f6fa';
      for (let s = -12; s < 14; s += 8) ctx.fillRect(s, -4, 4, 8);
      ctx.restore();
    }
  }

  function drawCar(car, t) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const L = car.length;
    const W = car.width;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(-L / 2 + 3, -W / 2 + 4, L, W, 7);
    ctx.fill();
    // Wheels
    ctx.fillStyle = '#1e272e';
    for (const [wx, wy] of [[-L / 2 + 8, -W / 2 - 1], [L / 2 - 14, -W / 2 - 1], [-L / 2 + 8, W / 2 - 3], [L / 2 - 14, W / 2 - 3]]) {
      ctx.fillRect(wx, wy, 9, 4);
    }
    // Body
    ctx.fillStyle = car.dead ? '#3d3d3d' : car.color;
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Cabin and glass
    ctx.fillStyle = shade(car.dead ? '#3d3d3d' : car.color, 0.82);
    ctx.beginPath();
    ctx.roundRect(-L * 0.24, -W / 2 + 3, L * 0.46, W - 6, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(L * 0.1, -W / 2 + 4, 7, W - 8);
    ctx.fillRect(-L * 0.24, -W / 2 + 4, 6, W - 8);
    // Headlights and tail lights
    ctx.fillStyle = '#fff6bf';
    ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 5);
    ctx.fillRect(L / 2 - 3, W / 2 - 7, 3, 5);
    ctx.fillStyle = '#e84118';
    ctx.fillRect(-L / 2, -W / 2 + 2, 3, 5);
    ctx.fillRect(-L / 2, W / 2 - 7, 3, 5);
    if (car.police) {
      ctx.fillStyle = '#274472';
      ctx.fillRect(-L * 0.1, -W / 2 + 1, L * 0.2, W - 2);
      const flash = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3838' : '#7a1f1f';
      ctx.fillRect(-5, -W / 2 + 3, 10, 5);
      ctx.fillStyle = flash ? '#3867ff' : '#1f3a7a';
      ctx.fillRect(-5, W / 2 - 8, 10, 5);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 2.5);
    }
    ctx.restore();
  }

  function drawPerson(e, t, isPlayer) {
    const bob = Math.sin(e.walkPhase) * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(e.x + 2, e.y + 3, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e.dead) {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 13, 7, e.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.skin || '#f1c27d';
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.angle) * 12, e.y + Math.sin(e.angle) * 12, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Body
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y + bob * 0.3, 8.5, 0, Math.PI * 2);
    ctx.fill();
    // Shoulders toward facing
    ctx.fillStyle = shade(e.color && e.color.startsWith('#') ? e.color : '#888888', 0.85);
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(e.angle) * 3, e.y + Math.sin(e.angle) * 3 + bob * 0.3, 6, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = e.skin || '#f1c27d';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(e.angle) * 2, e.y + Math.sin(e.angle) * 2 + bob * 0.3, 4.6, 0, Math.PI * 2);
    ctx.fill();
    if (e.kind === 'cop') {
      ctx.fillStyle = '#1b2a4a';
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.angle) * 2, e.y + Math.sin(e.angle) * 2 + bob * 0.3, 4.8, e.angle - 1.2, e.angle + 1.2);
      ctx.fill();
    }
    // Archetype tells: vendor apron, tourist camera, jogger headband.
    if (e.type === 'vendor') {
      ctx.fillStyle = '#f5f6fa';
      ctx.fillRect(e.x - 4, e.y - 1 + bob * 0.3, 8, 6);
    } else if (e.type === 'tourist') {
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(e.x + Math.cos(e.angle) * 8 - 2.5, e.y + Math.sin(e.angle) * 8 - 2 + bob * 0.3, 5, 4);
    } else if (e.type === 'jogger') {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.angle) * 2, e.y + Math.sin(e.angle) * 2 + bob * 0.3, 4.2, e.angle - 1.4, e.angle + 1.4);
      ctx.stroke();
    }
    if (isPlayer) {
      // Weapon in hand
      const wa = e.aimAngle;
      const hx = e.x + Math.cos(wa) * 10;
      const hy = e.y + Math.sin(wa) * 10 + bob * 0.3;
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(wa) * (e.currentWeapon === 'fists' ? 5 : 11), hy + Math.sin(wa) * (e.currentWeapon === 'fists' ? 5 : 11));
      ctx.stroke();
      if (e.punchAnim > 0) {
        ctx.fillStyle = e.skin || '#f1c27d';
        ctx.beginPath();
        ctx.arc(hx + Math.cos(wa) * 8, hy + Math.sin(wa) * 8, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Health pips for hostiles and cops in a fight
    if ((e.hostile || e.kind === 'cop') && e.hp < 60) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - 11, e.y - 18, 22, 4);
      ctx.fillStyle = e.kind === 'cop' ? '#54a0ff' : '#ff6b81';
      ctx.fillRect(e.x - 10, e.y - 17, 20 * clamp(e.hp / 60, 0, 1), 2);
    }
  }

  function drawPickup(pk, t) {
    const bob = Math.sin(pk.bobPhase) * 2.5;
    const colors = { cash: '#2ecc71', health: '#ff6b81', armor: '#54a0ff', ammo: '#feca57', pistol: '#dfe6e9', smg: '#dfe6e9', scatter: '#dfe6e9' };
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(pk.x, pk.y + 4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors[pk.type] || '#fff';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const glyph = { cash: '$', health: '+', armor: 'A', ammo: '≡', pistol: 'P', smg: 'S', scatter: 'X' }[pk.type] || '?';
    ctx.fillText(glyph, pk.x, pk.y + bob + 3);
  }

  function drawRaceMarkers(game, t) {
    // Start markers: chequered flags where the three time trials begin.
    if (!game.race) {
      for (const race of RACES) {
        const s = race.start;
        ctx.fillStyle = '#222';
        ctx.fillRect(s.x - 10, s.y - 10, 20, 20);
        ctx.fillStyle = '#f5f6fa';
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            if ((i + j) % 2 === 0) ctx.fillRect(s.x - 10 + i * 5, s.y - 10 + j * 5, 5, 5);
          }
        }
        ctx.strokeStyle = 'rgba(84,160,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 20 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }
    // Active race: the next checkpoint ring, the rest faint.
    const race = game.race;
    race.def.checkpoints.forEach((cp, i) => {
      if (i < race.cp) return;
      const next = i === race.cp;
      const pulse = next ? 1 + Math.sin(t * 5) * 0.1 : 1;
      ctx.strokeStyle = next ? 'rgba(84,220,255,0.95)' : 'rgba(84,220,255,0.3)';
      ctx.lineWidth = next ? 4 : 2;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      if (next) {
        ctx.fillStyle = 'rgba(84,220,255,0.15)';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 34 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawHeli(game, t) {
    const h = game.heli;
    if (!h) return;
    // Spotlight pool on the ground (daytime faint; the night pass brightens it).
    ctx.fillStyle = 'rgba(255,250,200,0.16)';
    ctx.beginPath();
    ctx.arc(h.tx, h.ty, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,200,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Shadow, offset as if the sun is high and west.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(h.x + 42, h.y + 52, 30, 13, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Airframe.
    const ang = Math.atan2(h.vy, h.vx);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(ang);
    ctx.fillStyle = '#2f3542';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57606f';
    ctx.fillRect(-38, -2.5, 18, 5);
    ctx.fillStyle = '#a4b0be';
    ctx.beginPath();
    ctx.ellipse(8, 0, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#54a0ff';
    ctx.fillRect(-4, -11, 9, 4);
    ctx.fillRect(-4, 7, 9, 4);
    ctx.restore();
    // Rotor disc + blades.
    ctx.strokeStyle = 'rgba(40,40,50,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const a = h.rotor + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(h.x - Math.cos(a) * 34, h.y - Math.sin(a) * 34);
      ctx.lineTo(h.x + Math.cos(a) * 34, h.y + Math.sin(a) * 34);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,40,50,0.12)';
    ctx.beginPath();
    ctx.arc(h.x, h.y, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(game) {
    const vw = canvas.width;
    const vh = canvas.height;
    const cam = game.camera;
    const t = game.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2f76a8';
    ctx.fillRect(0, 0, vw, vh);

    const shakeX = game.shake > 0 ? (Math.random() - 0.5) * game.shake * 14 : 0;
    const shakeY = game.shake > 0 ? (Math.random() - 0.5) * game.shake * 14 : 0;
    ctx.translate(vw / 2 + shakeX, vh / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const view = {
      x0: cam.x - vw / 2 / cam.zoom - 80,
      y0: cam.y - vh / 2 / cam.zoom - 80,
      x1: cam.x + vw / 2 / cam.zoom + 80,
      y1: cam.y + vh / 2 / cam.zoom + 80,
    };

    // Ground chunks.
    const cx0 = Math.max(0, Math.floor(view.x0 / CHUNK));
    const cx1 = Math.min(4, Math.floor(view.x1 / CHUNK));
    const cy0 = Math.max(0, Math.floor(view.y0 / CHUNK));
    const cy1 = Math.min(4, Math.floor(view.y1 / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        ctx.drawImage(groundChunk(game, cx, cy), cx * CHUNK, cy * CHUNK);
      }
    }
    // Animated water shimmer south of the beach.
    if (view.y1 > WATER_Y) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 26; i++) {
        const wx = view.x0 + ((i * 173 + Math.floor(t * 14)) % Math.max(1, view.x1 - view.x0));
        const wy = WATER_Y + 14 + ((i * 47) % 130);
        ctx.fillRect(wx, wy, 22, 2.5);
      }
    }

    // Skid marks under everything else.
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.lineWidth = 4;
    for (const s of game.skids) {
      ctx.globalAlpha = clamp(s.life / 6, 0, 0.5);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Objective beacon (under entities, over ground).
    if (game.objective && !game.objective.noMarker) {
      const o = game.objective;
      const pulse = 1 + Math.sin(t * 4) * 0.12;
      ctx.strokeStyle = 'rgba(255,209,102,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,209,102,0.18)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 26 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pickups and shells.
    for (const pk of game.pickups) {
      if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
      drawPickup(pk, t);
    }
    for (const sh of game.city.shells) {
      if (sh.taken || sh.x < view.x0 || sh.x > view.x1 || sh.y < view.y0 || sh.y > view.y1) continue;
      const bob = Math.sin(t * 2.4 + sh.x) * 2;
      ctx.fillStyle = '#ffeaa7';
      ctx.beginPath();
      ctx.arc(sh.x, sh.y + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e17055';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y + bob, 3.4, 0.4, 2.6);
      ctx.stroke();
    }

    // Y-sorted drawables: buildings, props, cars, people.
    const drawables = [];
    for (const b of game.city.buildings) {
      if (b.x + b.w + 60 < view.x0 || b.x - 60 > view.x1 || b.y + b.h + 80 < view.y0 || b.y - 60 > view.y1) continue;
      drawables.push({ y: b.y + b.h, fn: () => drawBuilding(b, view) });
    }
    for (const p of game.city.props) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      drawables.push({ y: p.y, fn: () => drawProp(p, t) });
    }
    for (const car of game.cars) {
      if (car.x < view.x0 || car.x > view.x1 || car.y < view.y0 || car.y > view.y1) continue;
      drawables.push({ y: car.y, fn: () => drawCar(car, t) });
    }
    for (const ped of game.peds) {
      if (ped.x < view.x0 || ped.x > view.x1 || ped.y < view.y0 || ped.y > view.y1) continue;
      drawables.push({ y: ped.y, fn: () => drawPerson(ped, t, false) });
    }
    for (const cop of game.cops) {
      if (cop.x < view.x0 || cop.x > view.x1 || cop.y < view.y0 || cop.y > view.y1) continue;
      drawables.push({ y: cop.y, fn: () => drawPerson(cop, t, false) });
    }
    if (!game.player.inCar && !game.player.dead) {
      drawables.push({ y: game.player.y, fn: () => drawPerson(game.player, t, true) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.fn();

    // Race rings and the police helicopter sit above the street.
    drawRaceMarkers(game, t);
    drawHeli(game, t);

    // Bullets as tracers.
    ctx.strokeStyle = 'rgba(255,230,150,0.9)';
    ctx.lineWidth = 2;
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Particles.
    for (const p of game.particles) {
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = p.type === 'smoke' ? a * 0.4 : a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating text (cash, pickups).
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of game.floaters) {
      ctx.globalAlpha = clamp(1 - f.life / 1.2, 0, 1);
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y - f.life * 34);
      ctx.fillText(f.text, f.x, f.y - f.life * 34);
    }
    ctx.globalAlpha = 1;

    // ---- Screen-space: night tint, lights, objective arrow, vignette.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const nf = nightFactor(game.clock);
    if (nf > 0.02) {
      ctx.fillStyle = `rgba(10,16,48,${nf * 0.52})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = 'lighter';
      const toScreen = (x, y) => [(x - cam.x) * cam.zoom + vw / 2, (y - cam.y) * cam.zoom + vh / 2];
      const glow = (x, y, r, color) => {
        const [sx, sy] = toScreen(x, y);
        if (sx < -r || sx > vw + r || sy < -r || sy > vh + r) return;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const car of game.cars) {
        if (car.dead) continue;
        const hx = car.x + Math.cos(car.angle) * (car.length / 2 + 26);
        const hy = car.y + Math.sin(car.angle) * (car.length / 2 + 26);
        glow(hx, hy, 90 * cam.zoom, `rgba(255,240,180,${0.16 * nf})`);
        // Headlight cone thrown ahead of the car.
        const [fx, fy] = toScreen(car.x + Math.cos(car.angle) * (car.length / 2), car.y + Math.sin(car.angle) * (car.length / 2));
        const reach = 175 * cam.zoom;
        const spread = 0.34;
        const grad = ctx.createLinearGradient(fx, fy, fx + Math.cos(car.angle) * reach, fy + Math.sin(car.angle) * reach);
        grad.addColorStop(0, `rgba(255,244,190,${0.2 * nf})`);
        grad.addColorStop(1, 'rgba(255,244,190,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(car.angle - spread) * reach, fy + Math.sin(car.angle - spread) * reach);
        ctx.lineTo(fx + Math.cos(car.angle + spread) * reach, fy + Math.sin(car.angle + spread) * reach);
        ctx.closePath();
        ctx.fill();
        if (car.police) {
          const flash = Math.floor(t * 6) % 2 === 0;
          glow(car.x, car.y, 110 * cam.zoom, flash ? `rgba(255,60,60,${0.14 * nf})` : `rgba(60,110,255,${0.14 * nf})`);
        }
      }
      // Helicopter spotlight burns through the dark.
      if (game.heli) {
        glow(game.heli.tx, game.heli.ty, 130 * cam.zoom, `rgba(255,250,200,${0.3 * nf})`);
      }
      for (const p of game.city.props) {
        if (p.type !== 'lamp') continue;
        glow(p.x, p.y, 52 * cam.zoom, `rgba(255,220,150,${0.1 * nf})`);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Rain: a grey veil plus slanted streaks over the whole frame.
    const rain = game.weather ? game.weather.rain : 0;
    if (rain > 0.02) {
      ctx.fillStyle = `rgba(70,90,115,${0.14 * rain})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = `rgba(190,215,240,${0.4 * rain})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const drops = Math.floor(130 * rain);
      for (let i = 0; i < drops; i++) {
        const rx = ((i * 137.5 + t * 260) % (vw + 80)) - 40;
        const ry = ((i * 89.3 + t * 620) % (vh + 60)) - 30;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + 13);
      }
      ctx.stroke();
    }

    // Objective edge arrow.
    if (game.objective && !game.objective.noMarker) {
      const o = game.objective;
      const sx = (o.x - cam.x) * cam.zoom + vw / 2;
      const sy = (o.y - cam.y) * cam.zoom + vh / 2;
      if (sx < 30 || sx > vw - 30 || sy < 30 || sy > vh - 30) {
        const cx = clamp(sx, 36, vw - 36);
        const cy = clamp(sy, 36, vh - 36);
        const ang = Math.atan2(sy - cy, sx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, -7);
        ctx.lineTo(-8, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Hurt flash and bust warning vignettes.
    if (game.hurtFlash > 0) {
      ctx.fillStyle = `rgba(200,30,30,${game.hurtFlash * 0.28})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (game.bust > 0.05) {
      ctx.fillStyle = `rgba(40,80,220,${game.bust * 0.2})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  function buildMinimapBase(game) {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 480;
    const g = c.getContext('2d');
    const s = 480 / WORLD_W;
    g.fillStyle = '#5d8a4a';
    g.fillRect(0, 0, 480, 480);
    g.fillStyle = '#3d8fc4';
    g.fillRect(0, WATER_Y * s, 480, 480 - WATER_Y * s);
    g.fillStyle = '#e8d29a';
    g.fillRect(0, (WORLD_H - 320) * s, 480, (WATER_Y - (WORLD_H - 320)) * s);
    g.fillStyle = '#4a4a52';
    for (let i = 0; i <= WORLD.blocksX; i++) g.fillRect(roadCenterX(i) * s - 3, 0, 6, 480);
    for (let j = 0; j <= WORLD.blocksY; j++) g.fillRect(0, roadCenterY(j) * s - 3, 480, 6);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const b of game.city.buildings) g.fillRect(b.x * s, b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    minimapBase = c;
    return c;
  }

  function drawMinimap(game, mm) {
    const g = mm.getContext('2d');
    const size = mm.width;
    if (!minimapBase) buildMinimapBase(game);
    const p = game.player.inCar || game.player;
    const viewWorld = 1500; // world pixels across the minimap
    const scale = size / viewWorld;
    const srcScale = 480 / WORLD_W;
    const sx = (p.x - viewWorld / 2) * srcScale;
    const sy = (p.y - viewWorld / 2) * srcScale;
    g.fillStyle = '#2f76a8';
    g.fillRect(0, 0, size, size);
    g.drawImage(minimapBase, sx, sy, viewWorld * srcScale, viewWorld * srcScale, 0, 0, size, size);
    const toMm = (x, y) => [size / 2 + (x - p.x) * scale, size / 2 + (y - p.y) * scale];
    const blip = (x, y, color, r) => {
      const [mx, my] = toMm(x, y);
      if (mx < -4 || mx > size + 4 || my < -4 || my > size + 4) return;
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx, my, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1;
      g.stroke();
    };
    for (const car of game.cars) {
      if (car.police && !car.dead) blip(car.x, car.y, '#54a0ff', 3.2);
    }
    for (const cop of game.cops) {
      if (!cop.dead) blip(cop.x, cop.y, '#54a0ff', 2.6);
    }
    const places = game.city.places;
    blip(places.diner.x, places.diner.y, '#ffd166', 3.4);
    blip(places.gunShop.x, places.gunShop.y, '#dfe6e9', 3);
    blip(places.pharmacy.x, places.pharmacy.y, '#58b09c', 3);
    blip(places.respray.x, places.respray.y, '#c56cf0', 3);
    blip(places.garage.x, places.garage.y, '#ff9f43', 3);
    blip(places.hospital.x, places.hospital.y, '#ff6b81', 3);
    if (!game.race) {
      for (const race of RACES) blip(race.start.x, race.start.y, '#54dcff', 3);
    }
    if (game.heli) blip(game.heli.x, game.heli.y, '#ffffff', 3.4);
    if (game.objective && !game.objective.noMarker) {
      blip(game.objective.x, game.objective.y, '#ffd166', 4.4);
    }
    // Player arrow.
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate((game.player.inCar ? game.player.inCar.angle : game.player.angle) + Math.PI / 2);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.4, 5);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.strokeStyle = '#222';
    g.stroke();
    g.restore();
    // North marker.
    g.fillStyle = '#fff';
    g.font = 'bold 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('N', size / 2, 12);
  }

  return { draw, drawMinimap };
}
