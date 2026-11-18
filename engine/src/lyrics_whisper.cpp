// On-device lyrics transcription with whisper.cpp (third_party/whisper.cpp, MIT licence).
// A small C API so the app links it without generated bindings.
#include "riffly/lyrics.h"

#include <cstdlib>
#include <cstring>
#include <exception>
#include <sstream>
#include <string>

#include "whisper.h"

namespace {

char* dup(const std::string& s) {
  char* p = static_cast<char*>(std::malloc(s.size() + 1));
  if (p) std::memcpy(p, s.c_str(), s.size() + 1);
  return p;
}

int fail(char** error_out, const std::string& msg) {
  if (error_out) *error_out = dup(msg);
  return 1;
}

// JSON string escaping; UTF-8 passes through unchanged.
std::string esc(const char* s) {
  std::string o;
  for (const char* p = s; *p; ++p) {
    const unsigned char c = static_cast<unsigned char>(*p);
    if (c == '"' || c == '\\') { o += '\\'; o += static_cast<char>(c); }
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else if (c == '\t') o += "\\t";
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += static_cast<char>(c);
  }
  return o;
}

struct ProgressBridge {
  riffly_progress_fn fn;
  void* user;
};

void quiet_log(enum ggml_log_level, const char*, void*) {}

}  // namespace

extern "C" int riffly_transcribe(const char* model_path, const float* samples, size_t count, int threads, riffly_progress_fn progress,
                                 void* user, char** json_out, char** error_out) {
  try {
    if (!model_path || !samples || count == 0) return fail(error_out, "Nothing to transcribe.");
    whisper_log_set(quiet_log, nullptr);
    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;
    whisper_context* ctx = whisper_init_from_file_with_params(model_path, cparams);
    if (!ctx) return fail(error_out, "Could not load the lyrics model.");

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.greedy.best_of = 2;
    params.language = "auto";
    params.n_threads = threads > 0 ? threads : 4;
    // Each line on its own: carrying text over makes whisper loop on repeated choruses.
    params.no_context = true;
    params.suppress_nst = true;
    params.print_special = false;
    params.print_progress = false;
    params.print_realtime = false;
    params.print_timestamps = false;
    ProgressBridge bridge{progress, user};
    if (progress) {
      params.progress_callback = [](whisper_context*, whisper_state*, int p, void* u) {
        auto* b = static_cast<ProgressBridge*>(u);
        b->fn(p, b->user);
      };
      params.progress_callback_user_data = &bridge;
    }

    if (whisper_full(ctx, params, samples, static_cast<int>(count)) != 0) {
      whisper_free(ctx);
      return fail(error_out, "Transcription failed.");
    }
    std::ostringstream o;
    o << "{\"language\":\"" << esc(whisper_lang_str(whisper_full_lang_id(ctx))) << "\",\"segments\":[";
    const int n = whisper_full_n_segments(ctx);
    for (int i = 0; i < n; ++i) {
      o << (i ? "," : "") << "{\"start\":" << whisper_full_get_segment_t0(ctx, i) / 100.0 << ",\"end\":" << whisper_full_get_segment_t1(ctx, i) / 100.0
        << ",\"text\":\"" << esc(whisper_full_get_segment_text(ctx, i)) << "\"}";
    }
    o << "]}";
    whisper_free(ctx);
    *json_out = dup(o.str());
    return *json_out ? 0 : fail(error_out, "Out of memory.");
  } catch (const std::exception& e) {
    return fail(error_out, std::string("Transcription failed: ") + e.what());
  } catch (...) {
    return fail(error_out, "Transcription failed unexpectedly.");
  }
}
