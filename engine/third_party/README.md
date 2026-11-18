# Third-party code (vendored, unmodified)

| Library | Files | Licence | Source (pinned commit) |
|---|---|---|---|
| minimp3 | `minimp3/minimp3.h`, `minimp3/minimp3_ex.h` | CC0 1.0 (public domain) | https://github.com/lieff/minimp3/tree/a2ad968c94819fb98589cca8026e0a57958c963c |
| dr_wav | `dr_libs/dr_wav.h` | Public domain or MIT-0 | https://github.com/mackron/dr_libs/tree/c2d31fed078120f67263fd36237c0dcaae6bc07b |

Both are single-header decoders compiled into the engine (`src/audio_io.cpp`). No other
third-party code is used: the FFT, resampler and all analysis are Riffly's own.
