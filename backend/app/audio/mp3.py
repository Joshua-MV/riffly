"""Convert uploaded audio to MP3 so every song is saved on the user's device in one format.

MP3 uploads are passed through untouched: re-encoding would only lose quality.
WAV is decoded natively; M4A decoding needs FFmpeg (via librosa/audioread).
Encoding uses LAME through the `lameenc` package (LGPL, free).
"""

from __future__ import annotations

import shutil
from pathlib import Path

import lameenc
import librosa
import numpy as np

# Input sample rates LAME accepts directly.
_LAME_RATES = {8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000}
MP3_BITRATE_KBPS = 192


def is_mp3(path: Path) -> bool:
    with path.open("rb") as f:
        head = f.read(3)
    return head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)


def encode_mp3(samples: np.ndarray, sample_rate: int, bitrate: int = MP3_BITRATE_KBPS) -> bytes:
    """Encode float samples shaped (n,) for mono or (channels, n) for stereo."""
    if samples.ndim == 1:
        samples = samples[np.newaxis, :]
    samples = samples[:2]
    if sample_rate not in _LAME_RATES:
        samples = librosa.resample(samples, orig_sr=sample_rate, target_sr=44100)
        sample_rate = 44100
    pcm = (np.clip(samples.T, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(bitrate)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(samples.shape[0])
    encoder.set_quality(2)  # 2 = high quality, 7 = fastest
    return bytes(encoder.encode(pcm) + encoder.flush())


def convert_to_mp3(src: Path, dest: Path) -> None:
    if is_mp3(src):
        shutil.copyfile(src, dest)
        return
    samples, sample_rate = librosa.load(str(src), sr=None, mono=False)
    dest.write_bytes(encode_mp3(samples, int(sample_rate)))
