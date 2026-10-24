// TANGERINE · the rooms.
//
// The three reverberations of Loopra Stage (room, hall, vast), unchanged: each
// impulse is shaped noise that darkens as it dies, with a few early reflections,
// scaled to unit energy so that a send of -13 dB returns about -13 dB of sound.

import { mulberry32, hashSeed } from './rng.js';

// Shapes of the three rooms. rt60 is the time the tail takes to fall by 60 dB;
// bright is the sparkle of the tail at its start and at its end (it darkens as it
// dies, as real rooms do); early reflections come first, the dense tail follows.
export const SPACES = {
  room: { seconds: 1.8, rt60: 1.0, bright: [11000, 3500], early: 18, span: 0.045, predelay: 0, build: 0.012, earlyGain: 1.0 },
  hall: { seconds: 8.0, rt60: 4.6, bright: [8000, 1600], early: 10, span: 0.09, predelay: 0.012, build: 0.05, earlyGain: 0.7 },
  vast: { seconds: 18.0, rt60: 12.5, bright: [5500, 900], early: 4, span: 0.12, predelay: 0.02, build: 0.12, earlyGain: 0.4 },
};

export function makeSpaceImpulse(ctx, spec, seed, name) {
  const rate = ctx.sampleRate;
  const length = Math.max(64, Math.floor(rate * spec.seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const decay = 6.907755 / spec.rt60;
  const start = Math.floor(spec.predelay * rate);
  const lowCut = 1 - Math.exp(-2 * Math.PI * 90 / rate);
  for (let channel = 0; channel < 2; channel++) {
    const random = mulberry32(hashSeed(seed, 'space', name, channel));
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    let floor = 0;
    let coefficient = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / rate;
      if (((i - start) & 63) === 0) {
        const cutoff = spec.bright[1] + (spec.bright[0] - spec.bright[1]) * Math.exp(-t / (spec.rt60 * 0.3));
        coefficient = 1 - Math.exp(-2 * Math.PI * cutoff / rate);
      }
      const noise = (random() + random() + random() - 1.5) * 2;
      smooth += coefficient * (noise - smooth);
      floor += lowCut * (smooth - floor);
      const body = Math.min(1, t / spec.build);
      data[i] = (smooth - floor) * Math.exp(-decay * t) * body * body;
    }
    for (let k = 0; k < spec.early; k++) {
      const tau = spec.predelay + 0.003 + random() * spec.span;
      const index = Math.floor(tau * rate);
      if (index + 2 >= length) continue;
      const amount = (random() < 0.5 ? -1 : 1) * (0.5 + 0.5 * random()) * Math.exp(-tau * 24) * spec.earlyGain * 1.4;
      data[index] += amount * 0.5;
      data[index + 1] += amount;
      data[index + 2] += amount * 0.5;
    }
    // Unit energy: a send of -13 dB returns about -13 dB of sound, whatever the room.
    let energy = 0;
    for (let i = 0; i < length; i++) energy += data[i] * data[i];
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 1;
    for (let i = 0; i < length; i++) data[i] *= scale;
  }
  return buffer;
}
