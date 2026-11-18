// Engine tests on synthesised songs with exact ground truth (no test framework needed).
#include <cmath>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <iterator>
#include <random>
#include <string>
#include <vector>

#include "../src/analysis.h"
#include "../src/audio_io.h"
#include "riffly/engine.h"

namespace {

int g_failures = 0;
int g_checks = 0;
#define CHECK(cond, ...)                                       \
  do {                                                         \
    ++g_checks;                                                \
    if (!(cond)) {                                             \
      ++g_failures;                                            \
      std::printf("  FAIL %s:%d  %s  ", __FILE__, __LINE__, #cond); \
      std::printf(__VA_ARGS__);                                \
      std::printf("\n");                                       \
    }                                                          \
  } while (0)

constexpr double kSr = 22050.0;
constexpr double kPi = 3.14159265358979323846;

struct Truth { double start, end; std::string label; };

int pc_of(const std::string& name) {
  static const char* names[] = {"C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"};
  for (int i = 0; i < 12; ++i) if (name == names[i]) return i;
  return -1;
}

// Same recipe as backend/tests/synth.py: strum on every beat, kick on beats, hi-hat off-beats.
std::vector<float> render(const std::vector<std::string>& chords, double bpm, int beats_per_chord, int repeats,
                          std::vector<Truth>& truth, unsigned seed = 7) {
  std::mt19937 rng(seed);
  std::uniform_real_distribution<double> phase(0, 2 * kPi);
  std::normal_distribution<double> noise(0, 1);
  const double beat = 60.0 / bpm;
  const int total = static_cast<int>(chords.size()) * beats_per_chord * repeats;
  const size_t n_total = static_cast<size_t>((total * beat + 1.0) * kSr);
  std::vector<double> y(n_total, 0.0);
  const size_t beat_samples = static_cast<size_t>(beat * kSr);
  for (int b = 0; b < total; ++b) {
    const std::string label = chords[(b / beats_per_chord) % chords.size()];
    const size_t start = static_cast<size_t>(b * beat * kSr);
    if (b % beats_per_chord == 0) truth.push_back({b * beat, (b + beats_per_chord) * beat, label});
    const bool minor = label.back() == 'm';
    const int root = pc_of(minor ? label.substr(0, label.size() - 1) : label);
    const int intervals[3] = {0, minor ? 3 : 4, 7};
    std::vector<int> voicing = {36 + root, 48 + root};
    for (int iv : intervals) voicing.push_back(52 + ((root + iv - 4) % 12 + 12) % 12);
    const size_t n = std::min(beat_samples * 2, n_total - start);
    for (int m : voicing) {
      const double f = 440.0 * std::pow(2.0, (m - 69) / 12.0);
      double ph[7];
      for (int k = 1; k <= 6; ++k) ph[k] = phase(rng);
      for (size_t i = 0; i < n; ++i) {
        const double t = i / kSr;
        double v = 0;
        for (int k = 1; k <= 6 && f * k < kSr / 2; ++k) v += std::pow(0.8, k - 1) * std::sin(2 * kPi * f * k * t + ph[k]);
        y[start + i] += 0.15 * v * std::exp(-t * 2.5);
      }
    }
    const size_t kn = std::min<size_t>(static_cast<size_t>(0.15 * kSr), n_total - start);
    for (size_t i = 0; i < kn; ++i) { const double t = i / kSr; y[start + i] += 0.6 * std::sin(2 * kPi * 55 * t) * std::exp(-t * 30); }
    const size_t off = start + beat_samples / 2;
    const size_t hn = off < n_total ? std::min<size_t>(static_cast<size_t>(0.04 * kSr), n_total - off) : 0;
    for (size_t i = 0; i < hn; ++i) y[off + i] += 0.08 * noise(rng) * std::exp(-static_cast<double>(i) / 200);
  }
  double peak = 0;
  for (double v : y) peak = std::max(peak, std::abs(v));
  std::vector<float> out(n_total);
  for (size_t i = 0; i < n_total; ++i) out[i] = static_cast<float>(y[i] / peak);
  return out;
}

double overlap_accuracy(const std::vector<riffly::ChordSegment>& pred, const std::vector<Truth>& truth) {
  int correct = 0, total = 0;
  for (double t = 0; t < truth.back().end; t += 0.05) {
    const Truth* ref = nullptr;
    for (const auto& tr : truth) if (tr.start <= t && t < tr.end) ref = &tr;
    if (!ref) continue;
    std::string p = "N";
    for (const auto& s : pred) if (s.start <= t && t < s.end) p = s.label;
    ++total;
    correct += p == ref->label;
  }
  return total ? static_cast<double>(correct) / total : 0;
}

std::vector<uint8_t> wav_bytes(const std::vector<float>& y, int rate) {
  std::vector<uint8_t> b(44 + y.size() * 2);
  auto put32 = [&](size_t o, uint32_t v) { for (int i = 0; i < 4; ++i) b[o + i] = (v >> (8 * i)) & 0xFF; };
  auto put16 = [&](size_t o, uint16_t v) { b[o] = v & 0xFF; b[o + 1] = v >> 8; };
  std::memcpy(&b[0], "RIFF", 4); put32(4, static_cast<uint32_t>(36 + y.size() * 2)); std::memcpy(&b[8], "WAVEfmt ", 8);
  put32(16, 16); put16(20, 1); put16(22, 1); put32(24, rate); put32(28, rate * 2); put16(32, 2); put16(34, 16);
  std::memcpy(&b[36], "data", 4); put32(40, static_cast<uint32_t>(y.size() * 2));
  for (size_t i = 0; i < y.size(); ++i) put16(44 + i * 2, static_cast<uint16_t>(static_cast<int16_t>(std::lround(std::clamp(y[i], -1.0f, 1.0f) * 32767))));
  return b;
}

void test(const char* name, const std::function<void()>& fn) {
  const int before = g_failures;
  fn();
  std::printf("%s %s\n", g_failures == before ? "ok  " : "FAIL", name);
}

}  // namespace

int main(int argc, char** argv) {
  const std::string data_dir = argc > 1 ? argv[1] : "tests/data";

  std::vector<Truth> pop_truth;
  const std::vector<float> pop = render({"G", "D", "Em", "C"}, 120, 4, 3, pop_truth);
  const riffly::Analysis a = riffly::analyse(pop);

  test("recognises a major/minor progression", [&] {
    const double acc = overlap_accuracy(a.chords, pop_truth);
    CHECK(acc >= 0.85, "accuracy %.1f%%", acc * 100);
  });
  test("estimates the key", [&] { CHECK(a.key && a.key->name() == "G major", "key %s", a.key ? a.key->name().c_str() : "none"); });
  test("estimates the tempo", [&] { CHECK(a.tempo && std::abs(a.tempo->bpm - 120) <= 3, "bpm %.1f", a.tempo ? a.tempo->bpm : 0.0); });
  test("finds the main progression", [&] {
    const std::vector<std::string> want = {"G", "D", "Em", "C"};
    std::string got;
    for (const auto& s : a.progression) got += s + " ";
    CHECK(a.progression == want, "got %s", got.c_str());
  });
  test("chord boundaries land near the truth", [&] {
    // Changes between chords that share notes (Em/C, G/D) while the old chord still rings are
    // inherently ambiguous; require nearly all within 0.3 s and none worse than 0.6 s.
    int close = 0;
    const int changes = static_cast<int>(pop_truth.size()) - 1;
    for (size_t i = 1; i < pop_truth.size(); ++i) {
      double best = 1e9;
      for (const auto& s : a.chords) if (s.label != "N") best = std::min(best, std::abs(s.start - pop_truth[i].start));
      CHECK(best < 0.6, "boundary %.2f off by %.2f", pop_truth[i].start, best);
      close += best < 0.3;
    }
    CHECK(close >= changes - 1, "%d of %d changes within 0.3 s", close, changes);
    if (std::getenv("RIFFLY_TEST_VERBOSE")) {
      const auto chroma = riffly::compute_chroma(pop);
      const auto raw = riffly::recognise_chords(chroma, pop.size() / kSr);
      const auto refined = riffly::refine_boundaries(pop, raw, chroma.tuning_semitones);
      for (size_t i = 0; i < raw.size() && i < 6; ++i)
        std::printf("    raw %.3f-%.3f %s | refined %.3f-%.3f\n", raw[i].start, raw[i].end, raw[i].label.c_str(),
                    i < refined.size() ? refined[i].start : -1.0, i < refined.size() ? refined[i].end : -1.0);
    }
  });
  test("minor-key progression", [&] {
    std::vector<Truth> truth;
    const auto y = render({"Am", "F", "C", "G"}, 96, 4, 3, truth, 3);
    const auto r = riffly::analyse(y);
    const double acc = overlap_accuracy(r.chords, truth);
    CHECK(acc >= 0.8, "accuracy %.1f%%", acc * 100);
    CHECK(r.key && (r.key->name() == "A minor" || r.key->name() == "C major"), "key %s", r.key ? r.key->name().c_str() : "none");
  });
  test("silence yields no chords", [&] {
    const auto r = riffly::analyse(std::vector<float>(static_cast<size_t>(kSr * 5), 0.0f));
    for (const auto& s : r.chords) CHECK(s.label == "N", "got %s", s.label.c_str());
    CHECK(r.progression.empty(), "progression not empty");
  });
  test("C API: WAV at 44.1 kHz stereo-compatible path, JSON output", [&] {
    std::vector<Truth> truth;
    auto y = render({"C", "G", "Am", "F"}, 110, 4, 2, truth);
    // Upsample to 44.1 kHz by sample duplication so the resampler is exercised.
    std::vector<float> y44(y.size() * 2);
    for (size_t i = 0; i < y.size(); ++i) y44[2 * i] = y44[2 * i + 1] = y[i];
    const auto bytes = wav_bytes(y44, 44100);
    char* json = nullptr;
    char* err = nullptr;
    const int rc = riffly_analyze(bytes.data(), bytes.size(), 720, &json, &err);
    CHECK(rc == 0, "error %s", err ? err : "");
    if (rc == 0) {
      const std::string s(json);
      CHECK(s.find("\"bpm\":1") != std::string::npos, "bpm field: %.80s", s.c_str());
      for (const char* label : {"\"label\":\"C\"", "\"label\":\"G\"", "\"label\":\"Am\"", "\"label\":\"F\""})
        CHECK(s.find(label) != std::string::npos, "missing %s", label);
      CHECK(s.find("\"model_version\":\"riffly-cpp-0.5.0+beat-sync\"") != std::string::npos, "model version");
    }
    riffly_free(json);
    riffly_free(err);
  });
  test("C API: rejects unsupported and corrupt input", [&] {
    char* json = nullptr;
    char* err = nullptr;
    const uint8_t html[] = "<html>not audio</html>";
    CHECK(riffly_analyze(html, sizeof html, 720, &json, &err) != 0 && err && std::string(err).find("Unsupported") != std::string::npos, "%s", err ? err : "");
    riffly_free(err);
    err = nullptr;
    uint8_t fake_wav[64] = {'R', 'I', 'F', 'F', 36, 0, 0, 0, 'W', 'A', 'V', 'E', 'f', 'm', 't', ' '};
    CHECK(riffly_analyze(fake_wav, sizeof fake_wav, 720, &json, &err) != 0, "corrupt WAV accepted");
    riffly_free(err);
  });
  test("C API: enforces the length limit", [&] {
    const auto bytes = wav_bytes(std::vector<float>(static_cast<size_t>(kSr * 70), 0.1f), 22050);
    char* json = nullptr;
    char* err = nullptr;
    CHECK(riffly_analyze(bytes.data(), bytes.size(), 60, &json, &err) != 0 && err && std::string(err).find("limit") != std::string::npos, "%s", err ? err : "");
    riffly_free(err);
  });
  test("C API: decodes an MP3 file", [&] {
    std::ifstream f(data_dir + "/g_d_em_c.mp3", std::ios::binary);
    std::vector<uint8_t> mp3((std::istreambuf_iterator<char>(f)), {});
    CHECK(!mp3.empty(), "missing %s/g_d_em_c.mp3", data_dir.c_str());
    if (mp3.empty()) return;
    CHECK(riffly_is_mp3(mp3.data(), mp3.size()) == 1, "not detected as MP3");
    float* pcm = nullptr;
    size_t frames = 0;
    int ch = 0, rate = 0;
    char* err = nullptr;
    CHECK(riffly_decode(mp3.data(), mp3.size(), &pcm, &frames, &ch, &rate, &err) == 0, "%s", err ? err : "");
    CHECK(rate == 22050 && ch == 1 && frames > 22050 * 15, "rate %d ch %d frames %zu", rate, ch, frames);
    riffly_free(pcm);
    char* json = nullptr;
    CHECK(riffly_analyze(mp3.data(), mp3.size(), 720, &json, &err) == 0, "%s", err ? err : "");
    if (json) CHECK(std::string(json).find("\"key\":\"G major\"") != std::string::npos, "%.120s", json);
    riffly_free(json);
  });

  std::printf("\n%d checks, %d failed\n", g_checks, g_failures);
  return g_failures ? 1 : 0;
}
