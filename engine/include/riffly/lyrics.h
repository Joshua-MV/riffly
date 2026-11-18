/* Riffly on-device lyrics (whisper.cpp). Part of the app build only (not the engine CLI). */
#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*riffly_progress_fn)(int percent, void* user);

/*
 * Transcribe 16 kHz mono samples with the whisper model at `model_path`. On success returns 0
 * and sets *json_out to {"language":"en","segments":[{"start":s,"end":s,"text":"..."}]}.
 * Free strings with riffly_free.
 */
int riffly_transcribe(const char* model_path, const float* samples, size_t count, int threads, riffly_progress_fn progress, void* user,
                      char** json_out, char** error_out);

#ifdef __cplusplus
}
#endif
