#!/usr/bin/env python3
"""Tangerine II: writes small synthetic test samples into samples/, to try the colours
without any library. Real samples replace them: delete samples/*-test folders."""

import math
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'samples'
RATE = 44100


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x)) * 32767)) for x in data))


def tone(midi, seconds, decay=None):
    hz = 440 * 2 ** ((midi - 69) / 12)
    return [sum(math.sin(2 * math.pi * hz * k * i / RATE) / k for k in range(1, 8)) * 0.3
            * min(1, i / RATE / 0.3) * (math.exp(-i / RATE / decay) if decay else 1)
            for i in range(int(seconds * RATE))]


for name, midi in [('C3', 48), ('C4', 60), ('C5', 72)]:
    write(ROOT / 'mellotron-choir' / f'Test choir {name}.wav', tone(midi, 4))
write(ROOT / 'prophet-bass' / 'Test bass.wav', tone(33, 1.5, decay=0.5))
random.seed(1)
write(ROOT / '_spaces' / 'church.wav', [random.uniform(-1, 1) * math.exp(-i / RATE / 1.2) * 0.5 for i in range(3 * RATE)])
print(f'Test samples written in {ROOT}')
