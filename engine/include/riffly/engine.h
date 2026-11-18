/*
 * Riffly audio engine - C API.
 *
 * Plain C so it can be called from Rust (Windows app), JNI (Android) and tests alike.
 * All strings returned through out-parameters are heap-allocated UTF-8 and must be released
 * with riffly_free(). Functions return 0 on success, non-zero on failure (with *error_out set).
 */
#ifndef RIFFLY_ENGINE_H
#define RIFFLY_ENGINE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define RIFFLY_ENGINE_VERSION "riffly-cpp-0.1.0"

/*
 * Analyse an encoded audio file (MP3 or WAV bytes) and return the analysis as JSON with the
 * same shape as the Python engine: duration, key, key_confidence, bpm, bpm_confidence,
 * chords[{start,end,label,root,quality,confidence}], progression[], beats[], waveform[],
 * model_version, processing_seconds, notes[].
 */
int riffly_analyze(const uint8_t* data, size_t size, double max_duration_seconds, char** json_out, char** error_out);

/* Decode MP3/WAV bytes to interleaved float PCM in [-1, 1]. Free *samples_out with riffly_free. */
int riffly_decode(const uint8_t* data, size_t size, float** samples_out, size_t* frames_out, int* channels_out,
                  int* sample_rate_out, char** error_out);

/* Decode MP3/WAV bytes to mono float PCM at `target_rate` Hz (e.g. 16000 for speech
 * recognition). Free *samples_out with riffly_free. */
int riffly_decode_mono(const uint8_t* data, size_t size, int target_rate, float** samples_out, size_t* frames_out, char** error_out);

/* 1 when the bytes look like an MP3 stream (ID3 tag or MPEG frame sync), else 0. */
int riffly_is_mp3(const uint8_t* data, size_t size);

void riffly_free(void* ptr);

#ifdef __cplusplus
}
#endif

#endif /* RIFFLY_ENGINE_H */
