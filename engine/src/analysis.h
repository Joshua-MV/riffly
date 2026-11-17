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
  std::string quality;  // "maj" | "min" | ""
  double confidence = 0;
};

using Chroma = std::vector<std::array<float, 12>>;  // per frame, L2-normalised

struct ChromaResult {
  Chroma chroma;
  std::vector<float> energy;
  double frame_seconds = 0;
  double tuning_semitones = 0;
};

struct TempoResult {
  double bpm = 0;
  double confidence = 0;
  std::vector<double> beats;  // seconds
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
  std::vector<float> waveform;
  double processing_seconds = 0;
  std::vector<std::string> notes;
};

// Individual stages (exposed for tests).
ChromaResult compute_chroma(const std::vector<float>& mono22k);
std::vector<ChordSegment> recognise_chords(const ChromaResult& chroma, double duration);
// Re-time chord changes with a short analysis window (~23 ms resolution).
std::vector<ChordSegment> refine_boundaries(const std::vector<float>& mono22k, const std::vector<ChordSegment>& segs, double tuning);
std::optional<TempoResult> estimate_tempo(const std::vector<float>& mono22k);
std::vector<ChordSegment> snap_to_beats(const std::vector<ChordSegment>& segs, const std::vector<double>& beats, double tolerance = 0.25);
std::optional<KeyResult> estimate_key(const ChromaResult& chroma, const std::vector<ChordSegment>& segs);
std::vector<std::string> main_progression(const std::vector<ChordSegment>& segs, size_t max_len = 8);
std::vector<float> waveform_peaks(const std::vector<float>& mono, size_t points = 600);

// Full pipeline on mono audio already at kAnalysisRate.
Analysis analyse(const std::vector<float>& mono22k);

std::string to_json(const Analysis& a);

}  // namespace riffly
