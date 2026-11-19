// Weather: Cinder Bay cycles between clear skies and rain showers.
// Rain eases in and out over a few seconds; while it falls, tyres lose
// grip (cars slide more) and pedestrians hurry. Rendering reads
// game.weather.rain (0 = dry, 1 = full shower).

import { WEATHER } from './config.js';

export function makeWeather(rng) {
  return {
    rain: 0,
    phase: 'clear',
    timer: rng ? rng.range(WEATHER.clearMin, WEATHER.clearMax) : 120,
  };
}

export function updateWeather(game, dt) {
  const w = game.weather;
  if (!w) return;
  w.timer -= dt;
  if (w.phase === 'clear') {
    w.rain = Math.max(0, w.rain - dt / 5);
    if (w.timer <= 0) {
      w.phase = 'rain';
      w.timer = game.rng.range(WEATHER.rainMin, WEATHER.rainMax);
      game.banner = { title: 'Rain over the bay', lines: ['Roads are slick — easy on the corners.'], t: 0 };
    }
  } else {
    w.rain = Math.min(1, w.rain + dt / 5);
    if (w.timer <= 0) {
      w.phase = 'clear';
      w.timer = game.rng.range(WEATHER.clearMin, WEATHER.clearMax);
    }
  }
}

// Tyre grip multiplier for stepCarPhysics: full rain costs WEATHER.gripLoss.
export function rainGrip(game) {
  const rain = game.weather ? game.weather.rain : 0;
  return 1 - WEATHER.gripLoss * rain;
}
