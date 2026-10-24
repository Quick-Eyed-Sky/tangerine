// Seeded randomness for Tangerine (shared with Loopra). The same seed always
// gives the same journey: nothing in here touches Math.random.

export function hashSeed(...parts) {
  let hash = 2166136261 >>> 0;
  for (const part of parts) {
    const text = `${part}|`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One stable number in [0, 1) for any combination of labels and numbers.
export const unit = (...parts) => mulberry32(hashSeed(...parts))();
