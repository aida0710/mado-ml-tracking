"""Synthetic vowel recordings for the sample audio dataset: short WAV files that look and sound
different in the audio viewer, with a manifest.jsonl of their text and speaker."""

from __future__ import annotations

import json
import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 16000
# First and second formants (Hz) of each vowel; only for telling the synthetic sounds apart.
VOWELS = {"a": (800, 1200), "i": (300, 2300), "u": (350, 1300), "e": (500, 1900), "o": (500, 900)}
VOWEL_SECONDS = 0.8


def write_vowel(path: Path, formants: tuple[int, int], *, pitch: float, seconds: float) -> None:
    frames = int(SAMPLE_RATE * seconds)
    samples = []
    for index in range(frames):
        t = index / SAMPLE_RATE
        envelope = min(1.0, t / 0.05, (seconds - t) / 0.05)
        value = 0.0
        # Harmonics of the voice pitch, boosted only near the formants: a crude vowel synthesis.
        for harmonic in range(1, int(4000 / pitch)):
            frequency = harmonic * pitch
            gain = sum(math.exp(-(((frequency - formant) / 150) ** 2)) for formant in formants) + 0.02
            value += gain * math.sin(2 * math.pi * frequency * t) / harmonic**0.5
        samples.append(value * envelope)
    peak = max(abs(sample) for sample in samples) or 1.0
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(
            b"".join(struct.pack("<h", round(0.6 * 32767 * sample / peak)) for sample in samples)
        )


def prepare_audio_directory(directory: Path, vowels: list[str], pitch: float) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    rows = []
    for vowel in vowels:
        name = f"vowel-{vowel}.wav"
        write_vowel(directory / name, VOWELS[vowel], pitch=pitch, seconds=VOWEL_SECONDS)
        rows.append({"audio": name, "text": vowel, "speaker": f"synthetic-f0-{int(pitch)}"})
    (directory / "manifest.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    )
