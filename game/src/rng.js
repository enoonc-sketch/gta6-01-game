// Seeded random number generator and small math helpers shared by every module.
// The city is generated from a seed so a screenshot run and a play run see the same Cinder Bay.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const TAU = Math.PI * 2;

// Circle vs axis-aligned box overlap test, used for buildings and props.
export function circleHitsBox(cx, cy, r, box) {
  const nx = clamp(cx, box.x, box.x + box.w);
  const ny = clamp(cy, box.y, box.y + box.h);
  return dist2(cx, cy, nx, ny) < r * r;
}

// Push a circle out of a box; returns the corrected [x, y] and whether it collided.
export function pushCircleOutOfBox(cx, cy, r, box) {
  const nx = clamp(cx, box.x, box.x + box.w);
  const ny = clamp(cy, box.y, box.y + box.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return [cx, cy, false];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [nx + (dx / d) * r, ny + (dy / d) * r, true];
  }
  // Centre inside the box: leave by the shortest side.
  const left = cx - box.x;
  const right = box.x + box.w - cx;
  const top = cy - box.y;
  const bottom = box.y + box.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [box.x - r, cy, true];
  if (m === right) return [box.x + box.w + r, cy, true];
  if (m === top) return [cx, box.y - r, true];
  return [cx, box.y + box.h + r, true];
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function formatClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
