// C API wrapper around the C++ engine.
#include "riffly/engine.h"

#include <cstdlib>
#include <cstring>
#include <exception>
#include <string>

#include "analysis.h"
#include "audio_io.h"
#include "dsp.h"

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

}  // namespace

extern "C" int riffly_analyze(const uint8_t* data, size_t size, double max_duration_seconds, char** json_out, char** error_out) {
  try {
    riffly::Pcm pcm;
    std::string err;
    if (!data || size == 0) return fail(error_out, "The file is empty.");
    if (!riffly::decode(data, size, pcm, err)) return fail(error_out, err);
    const double duration = static_cast<double>(pcm.frames()) / pcm.sample_rate;
    if (max_duration_seconds > 0 && duration > max_duration_seconds) {
      char buf[160];
      std::snprintf(buf, sizeof buf, "Audio is %.1f min long; the limit is %.0f min.", duration / 60.0, max_duration_seconds / 60.0);
      return fail(error_out, buf);
    }
    std::vector<float> mono = riffly::to_mono(pcm);
    pcm.samples.clear();
    pcm.samples.shrink_to_fit();
    mono = riffly::resample(mono, pcm.sample_rate, riffly::kAnalysisRate);
    const riffly::Analysis a = riffly::analyse(mono);
    *json_out = dup(riffly::to_json(a));
    return *json_out ? 0 : fail(error_out, "Out of memory.");
  } catch (const std::exception& e) {
    return fail(error_out, std::string("Analysis failed: ") + e.what());
  } catch (...) {
    return fail(error_out, "Analysis failed unexpectedly.");
  }
}

extern "C" int riffly_decode(const uint8_t* data, size_t size, float** samples_out, size_t* frames_out, int* channels_out,
                             int* sample_rate_out, char** error_out) {
  try {
    riffly::Pcm pcm;
    std::string err;
    if (!riffly::decode(data, size, pcm, err)) return fail(error_out, err);
    float* buf = static_cast<float*>(std::malloc(pcm.samples.size() * sizeof(float)));
    if (!buf) return fail(error_out, "Out of memory.");
    std::memcpy(buf, pcm.samples.data(), pcm.samples.size() * sizeof(float));
    *samples_out = buf;
    *frames_out = pcm.frames();
    *channels_out = pcm.channels;
    *sample_rate_out = pcm.sample_rate;
    return 0;
  } catch (const std::exception& e) {
    return fail(error_out, std::string("Decoding failed: ") + e.what());
  }
}

extern "C" int riffly_is_mp3(const uint8_t* data, size_t size) {
  return riffly::sniff(data, size) == riffly::Container::Mp3 ? 1 : 0;
}

extern "C" void riffly_free(void* ptr) { std::free(ptr); }
