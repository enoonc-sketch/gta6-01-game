// render.js — everything the player sees: the city from above, the cars and
// people in it, the HUD with its minimap, and the menus. All drawing is
// plain canvas 2D; there are no image assets anywhere in the game.

import { CITY, GAME_SUBTITLE, GAME_TITLE, PALETTE, STORY } from './config.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, align, weight) {
  ctx.font = `${weight || '600'} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function textOutline(ctx, str, x, y, size, color, align, weight) {
  ctx.font = `${weight || '700'} ${size}px ${FONT}`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(10, 12, 18, 0.85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// ---- the world ---------------------------------------------------------------

function drawGround(ctx, game) {
  const city = game.city;
  // Dry grass everywhere, then the beach and the sea along the south edge.
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(city.worldMin, city.worldMin, city.worldMax - city.worldMin, city.worldBottom - city.worldMin);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(city.worldMin, city.beachTop, city.worldMax - city.worldMin, city.waterTop - city.beachTop);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(city.worldMin, city.waterTop, city.worldMax - city.worldMin, city.worldBottom - city.waterTop);
  // Animated wave lines on the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const y = city.waterTop + 26 + k * 42;
    ctx.beginPath();
    for (let x = city.worldMin; x <= city.worldMax; x += 24) {
      const yy = y + Math.sin(x * 0.02 + game.time * 1.4 + k * 1.7) * 4;
      if (x === city.worldMin) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Parks and plazas.
  for (const park of city.parks) {
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(park.x, park.y, park.w, 10);
  }
  for (const plaza of city.plazas) {
    ctx.fillStyle = PALETTE.plaza;
    ctx.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
  }
}

function drawRoads(ctx, game) {
  const city = game.city;
  const half = CITY.roadW / 2;
  const side = half + CITY.sidewalk;
  // Sidewalks first, then asphalt, then markings.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const line of city.roadLines) {
    ctx.fillRect(line - side, city.worldMin, side * 2, city.worldBottom - city.worldMin);
    ctx.fillRect(city.worldMin, line - side, city.worldMax - city.worldMin, side * 2);
  }
  ctx.fillStyle = PALETTE.road;
  for (const line of city.roadLines) {
    ctx.fillRect(line - half, city.worldMin, half * 2, city.worldBottom - city.worldMin);
    ctx.fillRect(city.worldMin, line - half, city.worldMax - city.worldMin, half * 2);
  }
  // Centre dashes and edge lines.
  ctx.strokeStyle = PALETTE.laneDash;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const line of city.roadLines) {
    ctx.beginPath();
    ctx.moveTo(line, city.worldMin);
    ctx.lineTo(line, city.worldBottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(city.worldMin, line);
    ctx.lineTo(city.worldMax, line);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (const line of city.roadLines) {
    ctx.beginPath();
    ctx.moveTo(line - half + 3, city.worldMin);
    ctx.lineTo(line - half + 3, city.worldBottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(line + half - 3, city.worldMin);
    ctx.lineTo(line + half - 3, city.worldBottom);
    ctx.stroke();
  }
}

function drawBuildings(ctx, game) {
  for (const b of game.city.buildings) {
    // Drop shadow.
    ctx.fillStyle = 'rgba(20, 24, 30, 0.25)';
    ctx.fillRect(b.x + 6, b.y + 7, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof inset.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, 10);
    }
    if (b.shed) {
      // Chimneys.
      ctx.fillStyle = '#4a3a2c';
      ctx.fillRect(b.x + b.w - 22, b.y - 12, 10, 16);
      ctx.fillRect(b.x + 16, b.y - 12, 10, 16);
    }
    if (b.crate) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
  }
  // Trees and palms.
  for (const t of game.city.trees) {
    ctx.fillStyle = 'rgba(20, 24, 30, 0.2)';
    ctx.beginPath();
    ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.palm ? PALETTE.treeLight : PALETTE.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  // Landmark name tags.
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const key of Object.keys(game.city.landmarks)) {
    const lm = game.city.landmarks[key];
    const w = ctx.measureText(lm.name).width + 16;
    ctx.fillStyle = 'rgba(12, 16, 24, 0.7)';
    roundRect(ctx, lm.x - w / 2, lm.y - 44, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#f5f2e8';
    ctx.fillText(lm.name, lm.x, lm.y - 34);
    // A small gold pin at the landmark itself.
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawMissionMarker(ctx, game) {
  const m = game.missions;
  if (!m.active || m.done || !m.marker) return;
  const pulse = 1 + Math.sin(game.time * 4) * 0.18;
  const { x, y } = m.marker;
  // A beam of light so the marker reads from far away.
  const grad = ctx.createLinearGradient(x, y - 220, x, y);
  grad.addColorStop(0, 'rgba(255, 176, 46, 0)');
  grad.addColorStop(1, 'rgba(255, 176, 46, 0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 14, y - 220, 28, 220);
  ctx.save();
  ctx.translate(x, y - 18);
  ctx.rotate(Math.PI / 4);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(-11, -11, 22, 22);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-11, -11, 22, 22);
  ctx.restore();
  // A ring on the ground.
  ctx.strokeStyle = `rgba(255, 176, 46, ${0.5 + 0.4 * Math.sin(game.time * 4)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

// ---- entities ------------------------------------------------------------------

function drawCar(ctx, car, game) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(20, 24, 30, 0.3)';
  roundRect(ctx, -24, -11, 52, 26, 7);
  ctx.fill();
  const wrecked = car.dead;
  const body = wrecked ? '#3a3a3a' : car.color;
  ctx.fillStyle = body;
  roundRect(ctx, -26, -13, 52, 26, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (car.police) {
    // White doors and a flashing light bar.
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(-6, -13, 14, 26);
    ctx.fillStyle = game.time * 2 % 1 < 0.5 ? PALETTE.policeRed : PALETTE.policeBlue;
    ctx.fillRect(-4, -15, 8, 5);
  } else {
    // Windshield and roof.
    ctx.fillStyle = 'rgba(20, 28, 38, 0.85)';
    roundRect(ctx, 8, -10, 10, 20, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, -8, -10, 12, 20, 3);
    ctx.fill();
  }
  // Headlights.
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(24, -10, 3, 4);
  ctx.fillRect(24, 6, 3, 4);
  // Damage smoke.
  if (car.health < 40 && !wrecked && game.rng.chance(0.3)) {
    game.addSmoke(car.x, car.y);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, opts) {
  const o = opts || {};
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(20, 24, 30, 0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (o.down) {
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(angle);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = o.skin || '#e8b98d';
  ctx.beginPath();
  ctx.arc(4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (o.gun) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
  }
  if (o.ring) {
    ctx.strokeStyle = o.ring;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEntities(ctx, game) {
  const p = game.player;
  // Pedestrians.
  for (const ped of game.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, { down: ped.state === 'down' });
  }
  // Gang members.
  for (const v of game.vipers) {
    drawPerson(ctx, v.x, v.y, v.angle, v.shirt, {
      down: v.state === 'down', gun: v.state === 'attack', skin: '#d8a878',
    });
  }
  // Foot officers.
  for (const cop of game.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#22364e', { skin: '#e8b98d' });
    ctx.fillStyle = '#22364e';
    ctx.beginPath();
    ctx.arc(cop.x + Math.cos(cop.angle) * 4, cop.y + Math.sin(cop.angle) * 4, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars.
  for (const car of game.cars) {
    if (car === p.inCar) continue;
    drawCar(ctx, car, game);
  }
  if (p.inCar) drawCar(ctx, p.inCar, game);
  // The player, on foot.
  if (!p.inCar && game.state !== 'menu') {
    drawPerson(ctx, p.x, p.y, p.angle, '#2fae8d', {
      skin: '#e8b98d', ring: '#ffffff',
    });
  }
  // Bullets.
  ctx.fillStyle = '#ffe9a0';
  for (const b of game.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const pt of game.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- HUD ---------------------------------------------------------------------

function drawMinimap(ctx, game, x, y, size) {
  const city = game.city;
  const span = city.worldBottom - city.worldMin;
  const scale = size / span;
  const toMap = (wx, wy) => [x + (wx - city.worldMin) * scale, y + (wy - city.worldMin) * scale];
  ctx.save();
  ctx.fillStyle = 'rgba(12, 16, 24, 0.78)';
  roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  roundRect(ctx, x, y, size, size, 8);
  ctx.clip();
  // Sea and sand.
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(x, y, size, size);
  let bx;
  let by;
  let bw;
  let bh;
  [bx, by] = toMap(city.worldMin, city.beachTop);
  [bw, bh] = toMap(city.worldMax, city.waterTop);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(bx, by, bw - bx, bh - by);
  [bx, by] = toMap(city.worldMin, city.waterTop);
  [bw, bh] = toMap(city.worldMax, city.worldBottom);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(bx, by, bw - bx, bh - by);
  // Parks.
  ctx.fillStyle = PALETTE.park;
  for (const park of city.parks) {
    const [px, py] = toMap(park.x, park.y);
    ctx.fillRect(px, py, park.w * scale, park.h * scale);
  }
  // Roads.
  ctx.strokeStyle = 'rgba(220, 220, 220, 0.75)';
  ctx.lineWidth = 2;
  for (const line of city.roadLines) {
    const [ax, ay] = toMap(line, city.worldMin);
    const [cx, cy] = toMap(line, city.worldBottom);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    const [dx, dy] = toMap(city.worldMin, line);
    const [ex, ey] = toMap(city.worldMax, line);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const b of city.buildings) {
    const [px, py] = toMap(b.x, b.y);
    ctx.fillRect(px, py, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
  }
  // Viper blips.
  ctx.fillStyle = '#ff5a4a';
  for (const v of game.vipers) {
    if (v.state === 'down') continue;
    const [px, py] = toMap(v.x, v.y);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips, flashing.
  const flash = game.time * 2 % 1 < 0.5;
  ctx.fillStyle = flash ? PALETTE.policeBlue : PALETTE.policeRed;
  for (const car of game.cars) {
    if (!car.police) continue;
    const [px, py] = toMap(car.x, car.y);
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of game.cops) {
    const [px, py] = toMap(cop.x, cop.y);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker.
  const m = game.missions;
  if (m.active && !m.done && m.marker) {
    const [px, py] = toMap(m.marker.x, m.marker.y);
    const pulse = 5 + Math.sin(game.time * 4) * 1.5;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.restore();
  }
  // Player arrow.
  const pl = game.player;
  const [px, py] = toMap(pl.x, pl.y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(pl.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  // North tick.
  ctx.restore();
  text(ctx, 'N', x + size / 2, y - 16, 12, '#f5f2e8', 'center', '700');
}

function drawHUD(ctx, game, w, h) {
  const p = game.player;
  const m = game.missions;

  // Top-left: health, cash, ammo.
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, 14, 14, 228, 86, 12);
  ctx.fill();
  text(ctx, 'JAX MORENO', 28, 30, 13, '#f5f2e8', 'left', '700');
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  roundRect(ctx, 28, 46, 180, 12, 6);
  ctx.fill();
  const hpFrac = Math.max(0, p.health / p.maxHealth);
  ctx.fillStyle = hpFrac > 0.5 ? '#34c759' : hpFrac > 0.25 ? '#ff9f0a' : '#ff3b30';
  roundRect(ctx, 28, 46, 180 * hpFrac, 12, 6);
  ctx.fill();
  text(ctx, `${Math.ceil(p.health)}`, 214, 52, 11, '#fff', 'right', '700');
  text(ctx, `$${p.cash.toLocaleString('en-US')}`, 28, 76, 18, '#7be495', 'left', '700');
  if (p.hasPistol) {
    text(ctx, `PISTOL  ${p.ammo} rounds`, 150, 76, 12, '#ffd94a', 'left', '700');
  }

  // Top-right: wanted stars.
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, w - 214, 14, 200, 54, 12);
  ctx.fill();
  const stars = game.wanted.stars;
  let starStr = '';
  for (let i = 0; i < 5; i++) starStr += i < stars ? '★' : '☆';
  text(ctx, starStr, w - 114, 34, 22, stars > 0 ? '#ffb02e' : 'rgba(255,255,255,0.4)', 'center', '700');
  text(ctx, stars > 0 ? 'WANTED — SOLMAR PD' : 'CLEAN', w - 114, 56, 11, stars > 0 ? '#ff8a7a' : '#9aa0a8', 'center', '700');

  // Top-centre: current mission.
  if (m.active && !m.done && m.current) {
    const obj = m.objective;
    const dist = m.marker ? `  ·  ${m.markerDistance()}m` : '';
    const label = `${m.current.title.toUpperCase()} — ${obj}${dist}`;
    ctx.font = `700 14px ${FONT}`;
    const tw = ctx.measureText(label).width + 32;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, (w - tw) / 2, 14, tw, 40, 12);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect((w - tw) / 2 + 10, 24, 4, 20);
    text(ctx, label, (w - tw) / 2 + 24, 34, 14, '#f5f2e8', 'left', '700');
  } else if (m.done) {
    ctx.font = `700 14px ${FONT}`;
    const label = 'STORY COMPLETE — free roam Solmar City';
    const tw = ctx.measureText(label).width + 32;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, (w - tw) / 2, 14, tw, 40, 12);
    ctx.fill();
    text(ctx, label, w / 2, 34, 14, '#7be495', 'center', '700');
  }

  // Toasts under the mission bar.
  let ty = 68;
  for (const toast of game.toasts) {
    ctx.globalAlpha = Math.min(1, toast.life);
    ctx.font = `600 14px ${FONT}`;
    const tw = ctx.measureText(toast.text).width + 28;
    ctx.fillStyle = 'rgba(12, 16, 24, 0.72)';
    roundRect(ctx, (w - tw) / 2, ty, tw, 30, 10);
    ctx.fill();
    text(ctx, toast.text, w / 2, ty + 15, 14, toast.color, 'center', '600');
    ctx.globalAlpha = 1;
    ty += 36;
  }

  // Bottom-left: minimap.
  const mapSize = Math.min(200, Math.max(150, w * 0.16));
  drawMinimap(ctx, game, 20, h - mapSize - 20, mapSize);

  // Bottom-right: speed and car, or controls on foot.
  if (p.inCar) {
    const kmh = Math.round(Math.abs(p.inCar.speed) * 0.18);
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, w - 214, h - 84, 200, 70, 12);
    ctx.fill();
    text(ctx, `${kmh}`, w - 34, h - 58, 34, '#f5f2e8', 'right', '800');
    text(ctx, 'km/h', w - 30, h - 32, 12, '#9aa0a8', 'right', '600');
    text(ctx, p.inCar.model, w - 200, h - 58, 13, '#ffd94a', 'left', '700');
    text(ctx, 'E — get out', w - 200, h - 34, 11, '#c9c4b4', 'left', '600');
  } else {
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, w - 404, h - 54, 390, 40, 12);
    ctx.fill();
    text(ctx, 'WASD move · Shift run · E car · Click shoot · F punch · M mute', w - 209, h - 34, 11, '#c9c4b4', 'center', '600');
  }

  // Context prompt, bottom-centre.
  if (!p.inCar) {
    const car = game.nearestCar(64);
    if (car && !car.dead) {
      const label = car.driver === 'police'
        ? 'That car belongs to the Solmar PD'
        : `Press E to steal the ${car.model}`;
      ctx.font = `700 15px ${FONT}`;
      const tw = ctx.measureText(label).width + 28;
      ctx.fillStyle = 'rgba(12, 16, 24, 0.8)';
      roundRect(ctx, (w - tw) / 2, h - 54, tw, 34, 12);
      ctx.fill();
      text(ctx, label, w / 2, h - 37, 15, '#ffd94a', 'center', '700');
    }
  }

  // Crosshair when armed.
  if (p.hasPistol) {
    const mx = game.input.mouse.x;
    const my = game.input.mouse.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(mx, my, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- screens -------------------------------------------------------------------

function drawMenu(ctx, game, w, h) {
  // Dim the city behind the title.
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  textOutline(ctx, GAME_TITLE, cx, h * 0.2, 84, '#ffb02e', 'center', '800');
  text(ctx, GAME_SUBTITLE, cx, h * 0.2 + 58, 20, '#f5f2e8', 'center', '600');
  const save = game.save;
  const story = 'Fresh out of prison, Jax Moreno owes Sal Vega one last job —\n'
    + 'six missions across Solmar City: steal, drive, run, fight, and get out clean.';
  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = '#e8e4da';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = story.split('\n');
  lines.forEach((line, i) => ctx.fillText(line, cx, h * 0.38 + i * 24));

  // Save summary.
  if (save.missionsDone.length > 0 || save.cash !== 250) {
    text(ctx, `Continue: $${save.cash.toLocaleString('en-US')}  ·  ${save.missionsDone.length} / 6 missions done${save.storyComplete ? '  ·  story complete' : ''}`,
      cx, h * 0.5, 15, '#7be495', 'center', '700');
  }
  // Controls.
  const controls = [
    'WASD / Arrows — move and drive      Shift — sprint',
    'E — steal / enter a car, get out      Mouse — aim, Click — shoot',
    'F — punch      M — mute      Esc — pause',
  ];
  controls.forEach((line, i) => text(ctx, line, cx, h * 0.58 + i * 26, 15, '#c9c4b4', 'center', '600'));

  // Start button.
  const bw = 320;
  const bh = 58;
  const pulse = 1 + Math.sin(game.time * 3) * 0.03;
  ctx.save();
  ctx.translate(cx, h * 0.74);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#ffb02e';
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 14);
  ctx.fill();
  text(ctx, 'PRESS ENTER OR CLICK TO PLAY', 0, 1, 18, '#1c1408', 'center', '800');
  ctx.restore();
  text(ctx, 'An original game. No network, no downloads — everything runs from these files.',
    cx, h * 0.74 + 52, 13, '#9aa0a8', 'center', '600');
}

function drawCenterOverlay(ctx, w, h, title, titleColor, lines, prompt) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
  ctx.fillRect(0, 0, w, h);
  textOutline(ctx, title, w / 2, h * 0.36, 72, titleColor, 'center', '800');
  lines.forEach((line, i) => text(ctx, line, w / 2, h * 0.5 + i * 28, 17, '#e8e4da', 'center', '600'));
  if (prompt) text(ctx, prompt, w / 2, h * 0.66, 15, '#ffb02e', 'center', '700');
}

export function drawGame(ctx, game, w, h) {
  // Camera transform with screen shake.
  const cam = game.camera;
  const shakeX = game.shake > 0 ? (game.rng.float() - 0.5) * game.shake : 0;
  const shakeY = game.shake > 0 ? (game.rng.float() - 0.5) * game.shake : 0;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

  drawGround(ctx, game);
  drawRoads(ctx, game);
  drawBuildings(ctx, game);
  drawMissionMarker(ctx, game);
  drawEntities(ctx, game);
  ctx.restore();

  if (game.state === 'menu') {
    drawMenu(ctx, game, w, h);
    return;
  }
  drawHUD(ctx, game, w, h);

  if (game.state === 'paused') {
    drawCenterOverlay(ctx, w, h, 'PAUSED', '#f5f2e8',
      ['Take a breath. Solmar will wait.', 'Esc — resume      M — mute'],
      'Press Esc to keep playing');
  } else if (game.state === 'busted') {
    drawCenterOverlay(ctx, w, h, 'BUSTED', '#7fb5ff',
      ['The Solmar PD caught up with you.', 'You lost $150 in fines and impound fees.'],
      game.stateTimer > 1.2 ? 'Press Enter to wake up at Solmar General' : '');
  } else if (game.state === 'wasted') {
    drawCenterOverlay(ctx, w, h, 'WASTED', '#ff5a4a',
      ['Solmar is a rough town.', 'You lost $200 in hospital bills.'],
      game.stateTimer > 1.2 ? 'Press Enter to wake up at Solmar General' : '');
  } else if (game.state === 'complete') {
    const s = game.save.stats;
    drawCenterOverlay(ctx, w, h, 'THE SOLMAR JOB — DONE', '#ffb02e',
      [`All six missions complete. Dario Kane is finished in this town.`,
       `Cars stolen: ${s.carsStolen}   ·   Missions played: ${s.missionsPlayed}   ·   Cash: $${game.player.cash.toLocaleString('en-US')}`],
      'Press Enter to keep roaming Solmar City');
  }
}
