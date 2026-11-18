#pragma once

#include <array>
#include <optional>
#include <string>
#include <vector>

namespace riffly {

constexpr double kAnalysisRate = 22050.0;

struct ChordSegment {
  double start = 0, end = 0;
  std::string label;    // "Am", or "N" for no chord
  int root = -1;        // pitch class, -1 for "N"
  std::string quality;  // "maj" | "min" | "7" | "maj7" | "m7" | "sus2" | "sus4" | "add9" | "5" | "dim" | ""
  int bass = -1;        // bass pitch class (differs from root for slash chords like G/B)
  double confidence = 0;
};

using Chroma = std::vector<std::array<float, 12>>;  // per frame, L2-normalised

struct ChromaResult {
  Chroma chroma;  // full range C2-C8 (key, timing)
  Chroma treble;  // C3 and up (chord identity)
  Chroma bass;    // E1-B2, per frame 0..1 relative to the strongest bass note
  std::vector<float> energy;
  double frame_seconds = 0;
  double tuning_semitones = 0;
};

struct TempoResult {
  double bpm = 0;
  double confidence = 0;
  std::vector<double> beats;  // seconds
  std::vector<float> strum_env;  // onset strength in the guitar range, per envelope frame
  double env_fps = 0;
};

struct StrumResult {
  std::string pattern;                  // 8 eighth notes of a 4/4 bar: D (down), U (up), - (rest)
  int downbeat = 0;                     // index (mod 4) of the beat that starts a bar
  bool sixteenth_feel = false;          // strong in-between sixteenths (busy strumming)
  double confidence = 0;
  std::array<double, 16> sixteenths{};  // average strength at each sixteenth, 0..1
  std::array<double, 8> eighths{};
};

struct KeyResult {
  int tonic = 0;
  bool major = true;
  double confidence = 0;
  std::string name() const;
};

struct Analysis {
  double duration = 0;
  std::optional<KeyResult> key;
  std::optional<TempoResult> tempo;
  std::vector<ChordSegment> chords;
  std::vector<std::string> progression;
  std::optional<StrumResult> strum;
  std::vector<float> waveform;
  double processing_seconds = 0;
  std::vector<std::string> notes;
};

// Individual stages (exposed for tests).
ChromaResult compute_chroma(const std::vector<float>& mono22k);
std::vector<ChordSegment> recognise_chords(const ChromaResult& chroma, double duration);
// Beat-synchronous recognition: chords change only on the beat grid (or half way through a beat).
std::vector<ChordSegment> recognise_chords_on_grid(const ChromaResult& chroma, const std::vector<double>& beats, double duration);
// Unit boundaries on the (extended) beat grid; on_beat[u] says whether unit u starts on a beat.
std::vector<double> beat_units(const std::vector<double>& beats, double duration, int per_beat, std::vector<char>* on_beat);
// Re-time chord changes with a short analysis window (~23 ms resolution).
std::vector<ChordSegment> refine_boundaries(const std::vector<float>& mono22k, const std::vector<ChordSegment>& segs, double tuning);
std::optional<TempoResult> estimate_tempo(const std::vector<float>& mono22k);
std::vector<ChordSegment> snap_to_beats(const std::vector<ChordSegment>& segs, const std::vector<double>& beats, double tolerance = 0.25);
std::optional<KeyResult> estimate_key(const ChromaResult& chroma, const std::vector<ChordSegment>& segs);
std::vector<std::string> main_progression(const std::vector<ChordSegment>& segs, size_t max_len = 8);
std::optional<StrumResult> estimate_strum(const TempoResult& tempo, const std::vector<ChordSegment>& chords);
std::vector<float> waveform_peaks(const std::vector<float>& mono, size_t points = 600);

// Full pipeline on mono audio already at kAnalysisRate.
Analysis analyse(const std::vector<float>& mono22k);

std::string to_json(const Analysis& a);

}  // namespace riffly
