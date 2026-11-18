// Riffly analysis: chroma -> chord HMM, beat tracking, key, progression.
// A C++ port of backend/app/audio (same templates, HMM and confidence definitions).
#include "analysis.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <numeric>
#include <sstream>

#include "dsp.h"

namespace riffly {

namespace {

constexpr double kPi = 3.14159265358979323846;
const char* const kPitchNames[12] = {"C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"};

// Analysis parameters. Defaults are the tuned values; RIFFLY_* environment variables override
// them for evaluation runs only (see engine/tools/tune.py).
struct Params {
  size_t chroma_fft = 16384;
  int refine_mode = 1;  // 0 none, 1 "what is ringing", 2 attack-weighted
  double reach = 0.7;
  double snap = 0.12;
  int vocab = 1;              // 0 major/minor only, 1 extended (7, maj7, m7, sus, add9, 5, dim, slash)
  double bass_weight = 0.25;  // how much the bass note counts towards a chord
  double complexity = 2.0;    // scales the penalty for richer chords (they must earn their extra note)
  double key_bonus = 0.03;    // bonus for chords whose notes all belong to the song's key
  double harmonics = 1.0;     // overtone removal strength (0 = off)
  int sync = 1;               // 1: decide chords per half-beat on the beat grid (0: per frame, v0.1)
  int units_per_beat = 2;     // decoding resolution on the beat grid
  double switch_beat = 0.10;  // chance of a change at a beat
  double switch_half = 0.02;  // chance of a change half way through a beat (pushed changes)
  double vocab_prior = 0.0;   // song-vocabulary prior strength (2nd pass); 0 = off
  double seg_complexity = 0.6;  // complexity penalty scale when re-deciding a whole chord's quality
  int median = 3;             // chroma median filter length in frames
  int tempo_comb = 2;         // tempo: also reward the lag's multiples (metre-consistent periods)
  double grid_bass = 0.4;     // bass weight when decoding on the beat grid
  double ext_ratio = 0.9;     // an extra note (7, maj7, add9) must reach this share of the root/fifth level
  double sus_ratio = 0.8;     // sus: the 2nd/4th must reach this share of the root, with a weak 3rd
  double slash_ratio = 1.8;   // slash chord: another chord tone must be this much stronger in the bass
  size_t hop = 1024;          // chroma hop in samples
  int grid_slash = 1;         // decode slash triads (bass on the 3rd/5th) too
  double trim = 0.0;          // skip this fraction of each unit's start (the previous chord's tail)
  size_t treble_fft = 8192;   // separate (shorter) window for the treble chroma; 0 = same as chroma_fft
};
const Params& tuning_params() {
  static const Params p = [] {
    Params q;
    if (const char* v = std::getenv("RIFFLY_CHROMA_FFT")) q.chroma_fft = static_cast<size_t>(std::atoi(v));
    if (const char* v = std::getenv("RIFFLY_REFINE")) q.refine_mode = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_REACH")) q.reach = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SNAP")) q.snap = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_VOCAB")) q.vocab = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_BASS")) q.bass_weight = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_COMPLEXITY")) q.complexity = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_KEYBONUS")) q.key_bonus = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_HARM")) q.harmonics = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SYNC")) q.sync = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_UPB")) q.units_per_beat = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_SWBEAT")) q.switch_beat = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SWHALF")) q.switch_half = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_VPRIOR")) q.vocab_prior = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SEGCX")) q.seg_complexity = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_MEDIAN")) q.median = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_COMB")) q.tempo_comb = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_GBASS")) q.grid_bass = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_EXT")) q.ext_ratio = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SUS")) q.sus_ratio = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SLASH")) q.slash_ratio = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_HOP")) q.hop = static_cast<size_t>(std::atoi(v));
    if (const char* v = std::getenv("RIFFLY_GSLASH")) q.grid_slash = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_TRIM")) q.trim = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_TFFT")) q.treble_fft = static_cast<size_t>(std::atoi(v));
    return q;
  }();
  return p;
}

// Chroma STFT: long window for pitch resolution down to C2, 2048-sample hop (~93 ms),
// matching the Python engine's frame rate.
#define kChromaFft (tuning_params().chroma_fft)
#define kChromaHop (tuning_params().hop)
constexpr double kMinHz = 65.406;   // C2
constexpr double kMaxHz = 4186.0;   // C8

// Chord HMM parameters (identical to the Python engine).
constexpr double kSharpness = 18.0;
constexpr double kNoChordSimilarity = 0.55;
constexpr double kSelfTransition = 0.97;
constexpr double kSilenceRatio = 0.03;

// Onset / beat tracking (librosa defaults).
constexpr size_t kOnsetFft = 2048;
constexpr size_t kOnsetHop = 512;

double midi_of(double hz) { return 69.0 + 12.0 * std::log2(hz / 440.0); }

void l2_normalise(std::array<float, 12>& v) {
  double n = 0;
  for (float x : v) n += x * x;
  n = std::sqrt(n);
  if (n > 1e-9) for (float& x : v) x = static_cast<float>(x / n);
}

/** Estimate the recording's tuning offset (in semitones, -0.5..0.5) from spectral peaks. */
double estimate_tuning(const std::vector<float>& x) {
  double sx = 0, sy = 0;
  const double sr = kAnalysisRate;
  const double bin_hz = sr / 4096.0;
  stft_magnitudes(x, 4096, 4096, [&](size_t, const std::vector<float>& m) {
    float peak = 0;
    for (float v : m) peak = std::max(peak, v);
    if (peak <= 1e-6f) return;
    const size_t lo = static_cast<size_t>(80.0 / bin_hz), hi = std::min<size_t>(m.size() - 2, static_cast<size_t>(2000.0 / bin_hz));
    for (size_t b = std::max<size_t>(lo, 1); b <= hi; ++b) {
      if (m[b] < 0.1f * peak || m[b] < m[b - 1] || m[b] < m[b + 1]) continue;
      const double a = std::log(m[b - 1] + 1e-9), c = std::log(m[b] + 1e-9), d = std::log(m[b + 1] + 1e-9);
      const double denom = a - 2 * c + d;
      const double offset = denom != 0 ? 0.5 * (a - d) / denom : 0.0;
      const double hz = (b + offset) * bin_hz;
      const double frac = midi_of(hz) - std::round(midi_of(hz));
      sx += m[b] * std::cos(2 * kPi * frac);
      sy += m[b] * std::sin(2 * kPi * frac);
    }
  });
  if (sx == 0 && sy == 0) return 0.0;
  return std::atan2(sy, sx) / (2 * kPi);
}

struct QualityDef {
  const char* name;
  const char* suffix;
  std::vector<int> intervals;
  double complexity;            // penalty: richer chords must be clearly supported by their extra note
  std::vector<int> slash_bass;  // intervals that may appear as a different bass note (G/B, D/F#…)
};

const std::vector<QualityDef>& qualities() {
  static const std::vector<QualityDef> all = [] {
    std::vector<QualityDef> q = {
        {"maj", "", {0, 4, 7}, 0.0, {4, 7}},
        {"min", "m", {0, 3, 7}, 0.0, {3, 7}},
    };
    if (tuning_params().vocab >= 1) {
      q.push_back({"7", "7", {0, 4, 7, 10}, 0.035, {4, 10}});
      q.push_back({"maj7", "maj7", {0, 4, 7, 11}, 0.045, {}});
      q.push_back({"m7", "m7", {0, 3, 7, 10}, 0.035, {}});
      q.push_back({"sus2", "sus2", {0, 2, 7}, 0.03, {}});
      q.push_back({"sus4", "sus4", {0, 5, 7}, 0.03, {}});
      q.push_back({"add9", "add9", {0, 4, 7, 2}, 0.04, {4}});
      q.push_back({"5", "5", {0, 7}, 0.02, {}});
      q.push_back({"dim", "dim", {0, 3, 6}, 0.06, {}});
    }
    return q;
  }();
  return all;
}

struct State {
  std::string label;
  int root;
  std::string quality;
  int bass;  // pitch class expected in the bass (root, or another chord tone for slash chords)
  double prior;  // log-domain-free score adjustment (complexity penalty)
  std::array<float, 12> tpl;
  std::vector<int> tones;
};

std::vector<State> chord_states() {
  std::vector<State> out;
  const double slash_penalty = 0.03;
  for (const auto& q : qualities()) {
    for (int r = 0; r < 12; ++r) {
      std::array<float, 12> t{};
      std::vector<int> tones;
      for (size_t i = 0; i < q.intervals.size(); ++i) {
        const int pc = (r + q.intervals[i]) % 12;
        t[pc] = i == 0 ? 1.2f : 1.0f;
        tones.push_back(pc);
      }
      l2_normalise(t);
      const std::string base = std::string(kPitchNames[r]) + q.suffix;
      out.push_back({base, r, q.name, r, -q.complexity * tuning_params().complexity, t, tones});
      if (tuning_params().vocab >= 1) {
        for (int iv : q.slash_bass) {
          const int b = (r + iv) % 12;
          out.push_back({base + "/" + kPitchNames[b], r, q.name, b, -(q.complexity + slash_penalty) * tuning_params().complexity, t, tones});
        }
      }
    }
  }
  return out;
}

/** True when every note of the chord belongs to the key's scale (natural/harmonic minor too). */
bool diatonic(const std::vector<int>& tones, int tonic, bool major) {
  static const int major_scale[] = {0, 2, 4, 5, 7, 9, 11};
  static const int minor_scale[] = {0, 2, 3, 5, 7, 8, 10, 11};  // natural + raised 7th
  const int* scale = major ? major_scale : minor_scale;
  const int n = major ? 7 : 8;
  for (int pc : tones) {
    const int rel = ((pc - tonic) % 12 + 12) % 12;
    if (std::find(scale, scale + n, rel) == scale + n) return false;
  }
  return true;
}

double trimmed_mean_interval(const std::vector<double>& beats, double* cv_out) {
  std::vector<double> iv;
  for (size_t i = 1; i < beats.size(); ++i) iv.push_back(beats[i] - beats[i - 1]);
  const double lo = percentile(iv, 10), hi = percentile(iv, 90);
  double sum = 0;
  int n = 0;
  for (double v : iv) if (v >= lo && v <= hi) { sum += v; ++n; }
  const double mean_all = std::accumulate(iv.begin(), iv.end(), 0.0) / iv.size();
  double var = 0;
  for (double v : iv) var += (v - mean_all) * (v - mean_all);
  if (cv_out) *cv_out = std::sqrt(var / iv.size()) / mean_all;
  return n ? sum / n : mean_all;
}

}  // namespace

std::string KeyResult::name() const { return std::string(kPitchNames[tonic]) + (major ? " major" : " minor"); }

ChromaResult compute_chroma(const std::vector<float>& x) {
  ChromaResult res;
  res.frame_seconds = kChromaHop / kAnalysisRate;
  res.tuning_semitones = estimate_tuning(x);

  // Three bands from one STFT: the full range (key estimation, timing), the treble (C3 up:
  // what the chord is) and the bass (E1-B2: which note is in the bass, for slash chords and to
  // tell e.g. G from Em). Triangular weighting toward the nearest semitone centre, divided by
  // bins-per-semitone so every octave counts equally (like a CQT).
  const double bin_hz = kAnalysisRate / kChromaFft;
  struct BinMap { size_t bin; int pc; float w; };
  auto band = [&](double lo_hz, double hi_hz) {
    std::vector<BinMap> map;
    for (size_t b = 1; b <= kChromaFft / 2; ++b) {
      const double hz = b * bin_hz;
      if (hz < lo_hz || hz > hi_hz) continue;
      const double m = midi_of(hz) - res.tuning_semitones;
      const double nearest = std::round(m);
      const double w = 1.0 - 2.0 * std::abs(m - nearest);
      if (w <= 0) continue;
      const double bins_per_semitone = hz * (std::pow(2.0, 1.0 / 12.0) - 1.0) / bin_hz;
      const int pc = ((static_cast<int>(nearest) % 12) + 12) % 12;
      map.push_back({b, pc, static_cast<float>(w / std::max(1.0, bins_per_semitone))});
    }
    return map;
  };
  const auto full_map = band(kMinHz, kMaxHz);

  // Note-level ("semitone") spectrum from E1 (MIDI 28) to C8 (MIDI 108) for the bass and treble
  // chroma, with overtones removed: every note also sounds its harmonics (octave, fifth above
  // the octave, two octaves, major third…), which otherwise look like extra chord notes (the B
  // and D overtones of a C chord's E and G make it look like Cmaj7 or Cadd9). Going from the
  // lowest note up, each note's expected harmonics are subtracted from the notes above it, a
  // simplified version of the NNLS approximate transcription used by Chordino.
  constexpr int kLowMidi = 28, kHighMidi = 108, kNotes = kHighMidi - kLowMidi + 1;
  struct NoteBin { size_t bin; int note; float w; };
  auto make_note_map = [&](size_t n_fft) {
    std::vector<NoteBin> map;
    const double bhz = kAnalysisRate / n_fft;
    for (size_t b = 1; b <= n_fft / 2; ++b) {
      const double hz = b * bhz;
      const double m = midi_of(hz) - res.tuning_semitones;
      const double nearest = std::round(m);
      if (nearest < kLowMidi || nearest > kHighMidi) continue;
      const double w = 1.0 - 2.0 * std::abs(m - nearest);
      if (w <= 0) continue;
      const double per_semitone = hz * (std::pow(2.0, 1.0 / 12.0) - 1.0) / bhz;
      map.push_back({b, static_cast<int>(nearest) - kLowMidi, static_cast<float>(w / std::max(1.0, per_semitone))});
    }
    return map;
  };
  const std::vector<NoteBin> note_map = make_note_map(kChromaFft);
  static const int harmonic_offsets[] = {12, 19, 24, 28, 31};  // harmonics 2..6 in semitones
  const double strength = tuning_params().harmonics;
  auto remove_overtones = [&](std::vector<float>& notes) {
    if (strength <= 0) return;
    for (int n = 0; n < kNotes; ++n) {
      const float a = notes[n];
      if (a <= 0) continue;
      float h = 1.0f;
      for (int off : harmonic_offsets) {
        h *= 0.6f;
        if (n + off < kNotes) notes[n + off] = std::max(0.0f, notes[n + off] - static_cast<float>(strength) * a * h);
      }
    }
  };

  std::vector<std::array<float, 12>> raw_full, raw_treble, raw_bass;
  std::vector<float> notes(kNotes);
  stft_magnitudes(x, kChromaFft, kChromaHop, [&](size_t, const std::vector<float>& mags) {
    std::array<float, 12> f{}, t{}, b{};
    for (const auto& e : full_map) f[e.pc] += mags[e.bin] * e.w;
    std::fill(notes.begin(), notes.end(), 0.0f);
    for (const auto& e : note_map) notes[e.note] += mags[e.bin] * e.w;
    remove_overtones(notes);
    for (int n = 0; n < kNotes; ++n) {
      const int midi = n + kLowMidi;
      if (midi >= 48) t[midi % 12] += notes[n];       // C3 and up: chord identity
      else if (midi <= 47) b[midi % 12] += notes[n];  // E1-B2: the bass note
    }
    raw_full.push_back(f);
    raw_treble.push_back(t);
    raw_bass.push_back(b);
  });
  // Treble from a shorter window: the long window resolves bass notes but blurs short chords
  // into their neighbours (a chord held for two beats picks up the previous chord's tail).
  const size_t tfft = tuning_params().treble_fft;
  if (tfft && tfft != kChromaFft) {
    const std::vector<NoteBin> tmap = make_note_map(tfft);
    size_t i = 0;
    stft_magnitudes(x, tfft, kChromaHop, [&](size_t, const std::vector<float>& mags) {
      if (i >= raw_treble.size()) return;
      std::fill(notes.begin(), notes.end(), 0.0f);
      for (const auto& e : tmap) notes[e.note] += mags[e.bin] * e.w;
      remove_overtones(notes);
      std::array<float, 12> t{};
      for (int n = 48 - kLowMidi; n < kNotes; ++n) t[(n + kLowMidi) % 12] += notes[n];
      raw_treble[i++] = t;
    });
  }

  // Log compression relative to the band's loudest value, then a temporal median filter
  // (9 frames ~ 0.8 s) that suppresses drum hits and passing notes.
  auto smooth = [](std::vector<std::array<float, 12>>& raw) {
    float peak = 0;
    for (const auto& c : raw) for (float v : c) peak = std::max(peak, v);
    for (auto& c : raw) for (float& v : c) v = std::log1p(100.0f * v / (peak + 1e-9f));
    const size_t T = raw.size();
    Chroma out(T);
    std::vector<float> window;
    const long long half = std::max(0, tuning_params().median / 2);
    for (size_t t = 0; t < T; ++t) {
      for (int k = 0; k < 12; ++k) {
        window.clear();
        for (long long d = -half; d <= half; ++d) {
          const long long i = std::clamp<long long>(static_cast<long long>(t) + d, 0, static_cast<long long>(T) - 1);
          window.push_back(raw[static_cast<size_t>(i)][k]);
        }
        out[t][k] = median_inplace(window.data(), window.data() + window.size());
      }
    }
    return out;
  };
  Chroma full = smooth(raw_full), treble = smooth(raw_treble), bass = smooth(raw_bass);
  const size_t T = full.size();
  res.energy.resize(T);
  std::vector<double> bass_energy(T);
  for (size_t t = 0; t < T; ++t) {
    res.energy[t] = std::accumulate(full[t].begin(), full[t].end(), 0.0f);
    bass_energy[t] = std::accumulate(bass[t].begin(), bass[t].end(), 0.0);
    l2_normalise(full[t]);
    l2_normalise(treble[t]);
  }
  // Bass: per frame relative to its strongest pitch class (0..1), scaled down when there is
  // little bass at all, so quiet or absent bass doesn't decide anything.
  const double bass_ref = std::max(1e-9, percentile(bass_energy, 90));
  for (size_t t = 0; t < T; ++t) {
    const float mx = *std::max_element(bass[t].begin(), bass[t].end());
    const float presence = static_cast<float>(std::min(1.0, bass_energy[t] / (0.3 * bass_ref)));
    for (float& v : bass[t]) v = mx > 0 ? v / mx * presence : 0.0f;
  }
  res.chroma = std::move(full);
  res.treble = std::move(treble);
  res.bass = std::move(bass);
  return res;
}

std::vector<ChordSegment> recognise_chords(const ChromaResult& cr, double duration) {
  static const std::vector<State> states = chord_states();
  const size_t S = states.size() + 1;  // + "no chord"
  const size_t T = cr.chroma.size();
  if (T == 0) return {};

  std::vector<double> energies(cr.energy.begin(), cr.energy.end());
  const double quiet_threshold = kSilenceRatio * percentile(energies, 95);

  // Key prior: chords whose notes all fit the song's key get a small bonus.
  const auto key = estimate_key(cr, {});
  const Params& P = tuning_params();
  std::vector<double> state_bonus(S - 1, 0.0);
  for (size_t s = 0; s + 1 < S; ++s) {
    state_bonus[s] = states[s].prior + (key && diatonic(states[s].tones, key->tonic, key->major) ? P.key_bonus : 0.0);
  }

  // Emission scores: cosine similarity of the treble chroma with the chord's notes, plus how
  // strongly the expected bass note sounds, plus the priors above. Softmax over states + N.
  std::vector<double> probs(T * S);
  for (size_t t = 0; t < T; ++t) {
    double* p = &probs[t * S];
    const auto& treble = P.vocab >= 1 ? cr.treble[t] : cr.chroma[t];
    for (size_t s = 0; s + 1 < S; ++s) {
      double sim = 0;
      for (int k = 0; k < 12; ++k) sim += states[s].tpl[k] * treble[k];
      const double bass = P.vocab >= 1 ? P.bass_weight * cr.bass[t][states[s].bass] : 0.0;
      p[s] = kSharpness * (sim + bass + state_bonus[s]);
    }
    const double n_level = kNoChordSimilarity + (P.vocab >= 1 ? 0.5 * P.bass_weight : 0.0);
    p[S - 1] = kSharpness * (cr.energy[t] < quiet_threshold ? 2.0 + P.bass_weight : n_level);
    const double mx = *std::max_element(p, p + S);
    double sum = 0;
    for (size_t s = 0; s < S; ++s) sum += (p[s] = std::exp(p[s] - mx));
    for (size_t s = 0; s < S; ++s) p[s] /= sum;
  }

  // Viterbi with a uniform self-loop transition matrix, in the log domain. Because every
  // "switch" has the same probability, the best predecessor is O(1) per state.
  const double log_stay = std::log(kSelfTransition);
  const double log_switch = std::log((1.0 - kSelfTransition) / (S - 1));
  std::vector<double> delta(S), next(S);
  std::vector<uint16_t> back(T * S);
  for (size_t s = 0; s < S; ++s) delta[s] = std::log(probs[s] + 1e-300) + std::log(1.0 / S);
  for (size_t t = 1; t < T; ++t) {
    size_t best = 0;
    for (size_t s = 1; s < S; ++s) if (delta[s] > delta[best]) best = s;
    for (size_t s = 0; s < S; ++s) {
      const double stay = delta[s] + log_stay;
      const double move = delta[best] + log_switch;
      const bool from_self = stay >= move || best == s;
      next[s] = (from_self ? stay : move) + std::log(probs[t * S + s] + 1e-300);
      back[t * S + s] = static_cast<uint16_t>(from_self ? s : best);
    }
    delta.swap(next);
  }
  std::vector<size_t> path(T);
  path[T - 1] = static_cast<size_t>(std::max_element(delta.begin(), delta.end()) - delta.begin());
  for (size_t t = T - 1; t > 0; --t) path[t - 1] = back[t * S + path[t]];

  std::vector<ChordSegment> segs;
  for (size_t start = 0, i = 1; i <= T; ++i) {
    if (i < T && path[i] == path[start]) continue;
    const size_t s = path[start];
    // Confidence = how sure we are of the chord's root: probability summed over the states
    // sharing it (C, Cadd9, C/E… are variations of one chord, not competitors).
    double conf = 0;
    for (size_t t = start; t < i; ++t) {
      if (s == S - 1) {
        conf += probs[t * S + s];
        continue;
      }
      for (size_t o = 0; o + 1 < S; ++o) if (states[o].root == states[s].root) conf += probs[t * S + o];
    }
    ChordSegment seg;
    seg.start = start * cr.frame_seconds;
    seg.end = i < T ? std::min(i * cr.frame_seconds, duration) : duration;
    seg.confidence = conf / (i - start);
    if (s == S - 1) {
      seg.label = "N";
    } else {
      seg.label = states[s].label;
      seg.root = states[s].root;
      seg.quality = states[s].quality;
      seg.bass = states[s].bass;
    }
    segs.push_back(seg);
    start = i;
  }
  return segs;
}

std::vector<double> beat_units(const std::vector<double>& beats, double duration, int per_beat, std::vector<char>* on_beat) {
  // Full beat grid: the tracked beats, extended to the start and end of the song with the
  // median beat interval (trackers lock on a little after the music starts).
  std::vector<double> grid;
  if (beats.size() >= 4) {
    std::vector<double> iv;
    for (size_t i = 1; i < beats.size(); ++i) iv.push_back(beats[i] - beats[i - 1]);
    const double med = percentile(iv, 50);
    for (double t = beats.front() - med; t > 0.05; t -= med) grid.push_back(t);
    std::reverse(grid.begin(), grid.end());
    for (double b : beats) if (b < duration) grid.push_back(b);
    for (double t = grid.back() + med; t < duration - 0.05; t += med) grid.push_back(t);
  } else {
    for (double t = 0.5; t < duration - 0.05; t += 0.5) grid.push_back(t);
  }
  std::vector<double> bounds{0.0};
  on_beat->assign(1, 1);
  for (size_t i = 0; i < grid.size(); ++i) {
    const double a = grid[i], b = i + 1 < grid.size() ? grid[i + 1] : std::min(duration, a + (grid.size() > 1 ? grid[i] - grid[i - 1] : 0.5));
    if (a > bounds.back() + 1e-3) { bounds.push_back(a); on_beat->push_back(1); }
    for (int k = 1; k < per_beat; ++k) {
      const double t = a + (b - a) * k / per_beat;
      if (t < duration - 1e-3 && t > bounds.back() + 1e-3) { bounds.push_back(t); on_beat->push_back(0); }
    }
  }
  if (duration > bounds.back() + 1e-3) bounds.push_back(duration);
  else bounds.back() = duration, on_beat->pop_back();
  on_beat->resize(bounds.size() - 1);
  return bounds;
}

namespace {

struct UnitFeatures {
  std::vector<std::array<float, 12>> treble, bass;
  std::vector<double> energy;
};

// Average the frame features over each unit [bounds[u], bounds[u+1]).
UnitFeatures unit_features(const ChromaResult& cr, const std::vector<double>& bounds) {
  const size_t U = bounds.size() - 1, T = cr.treble.size();
  UnitFeatures f;
  f.treble.assign(U, {});
  f.bass.assign(U, {});
  f.energy.assign(U, 0.0);
  for (size_t u = 0; u < U; ++u) {
    const double from = bounds[u] + tuning_params().trim * (bounds[u + 1] - bounds[u]);
    size_t a = static_cast<size_t>(std::ceil(from / cr.frame_seconds));
    size_t b = static_cast<size_t>(std::ceil(bounds[u + 1] / cr.frame_seconds));
    a = std::min(a, T - 1);
    b = std::clamp(b, a + 1, T);
    for (size_t t = a; t < b; ++t) {
      for (int k = 0; k < 12; ++k) {
        f.treble[u][k] += cr.treble[t][k];
        f.bass[u][k] += cr.bass[t][k];
      }
      f.energy[u] += cr.energy[t];
    }
    const double n = static_cast<double>(b - a);
    for (int k = 0; k < 12; ++k) f.bass[u][k] = static_cast<float>(f.bass[u][k] / n);
    f.energy[u] /= n;
    l2_normalise(f.treble[u]);
  }
  return f;
}

double chord_score(const State& s, const std::array<float, 12>& treble, const std::array<float, 12>& bass, double bass_weight) {
  double sim = 0;
  for (int k = 0; k < 12; ++k) sim += s.tpl[k] * treble[k];
  return sim + bass_weight * bass[s.bass];
}

}  // namespace

/**
 * Name a chord from a whole segment's average: the root and major/minor family are already
 * decided; add the extra note (7, maj7, add9, m7), sus or power-chord quality and a slash bass
 * only when that note clearly sounds.
 */
ChordSegment describe_chord(int root, bool minor, const std::array<float, 12>& tr, const std::array<float, 12>& bs) {
  const Params& P = tuning_params();
  auto lv = [&](int iv) { return static_cast<double>(tr[(root + iv) % 12]); };
  const double r = lv(0), fifth = lv(7), third = minor ? lv(3) : lv(4);
  const double base = std::min(r, fifth > 0.3 * r ? fifth : r);
  // Non-chord-tone "noise floor": the typical level of the notes outside the triad.
  std::vector<double> others;
  for (int iv = 0; iv < 12; ++iv) if (iv != 0 && iv != 7 && iv != (minor ? 3 : 4)) others.push_back(lv(iv));
  const double floor = percentile(others, 50);
  std::string quality = minor ? "min" : "maj";
  std::vector<int> tones = {0, minor ? 3 : 4, 7};
  if (P.vocab >= 1) {
    const double s4 = lv(5), s2 = lv(2);
    auto clear = [&](double v, double ratio) { return v >= ratio * base && v > 1.6 * floor; };
    if (!minor && third < 0.55 * std::max(s4, s2) && (clear(s4, P.sus_ratio) || clear(s2, P.sus_ratio))) {
      quality = s4 >= s2 ? "sus4" : "sus2";
      tones = {0, s4 >= s2 ? 5 : 2, 7};
    } else if (minor) {
      if (clear(lv(10), P.ext_ratio)) { quality = "m7"; tones.push_back(10); }
    } else {
      struct Ext { const char* q; int iv; };
      const Ext exts[] = {{"7", 10}, {"maj7", 11}, {"add9", 2}};
      const Ext* best = nullptr;
      for (const auto& e : exts) if (clear(lv(e.iv), P.ext_ratio) && (!best || lv(e.iv) > lv(best->iv))) best = &e;
      if (best) { quality = best->q; tones.push_back(best->iv); }
      else if (third < 0.3 * base && third < 1.2 * floor) { quality = "5"; tones = {0, 7}; }
    }
  }
  static const std::map<std::string, std::string> suffix = {{"maj", ""}, {"min", "m"}, {"7", "7"}, {"maj7", "maj7"}, {"m7", "m7"},
                                                            {"sus2", "sus2"}, {"sus4", "sus4"}, {"add9", "add9"}, {"5", "5"}};
  ChordSegment seg;
  seg.root = root;
  seg.quality = quality;
  seg.bass = root;
  seg.label = std::string(kPitchNames[root]) + suffix.at(quality);
  // Slash bass: another chord tone clearly stronger than the root in the bass register.
  if (P.vocab >= 1) {
    double bsum = 0;
    for (float v : bs) bsum += v;
    if (bsum > 0.2) {
      int arg = -1;
      double best = 0;
      for (int iv : tones) {
        if (iv == 0) continue;
        const int pc = (root + iv) % 12;
        if (bs[pc] > best) { best = bs[pc]; arg = pc; }
      }
      if (arg >= 0 && best >= P.slash_ratio * bs[root] && best >= 0.5) {
        seg.bass = arg;
        seg.label += std::string("/") + kPitchNames[arg];
      }
    }
  }
  return seg;
}

std::vector<ChordSegment> recognise_chords_on_grid(const ChromaResult& cr, const std::vector<double>& beats, double duration) {
  // Decoding uses plain major/minor triads (with the root in the bass): that decides the
  // chord's root and family reliably. The full name is decided per segment afterwards.
  static const std::vector<State> states = [] {
    std::vector<State> all = chord_states(), out;
    for (auto& s : all)
      if ((s.quality == "maj" || s.quality == "min") && (s.bass == s.root || tuning_params().grid_slash)) out.push_back(s);
    return out;
  }();
  const Params& P = tuning_params();
  std::vector<char> on_beat;
  const std::vector<double> bounds = beat_units(beats, duration, std::max(1, P.units_per_beat), &on_beat);
  const size_t U = bounds.size() - 1;
  if (U == 0 || cr.treble.empty()) return {};
  const UnitFeatures f = unit_features(cr, bounds);
  if (const char* dump = std::getenv("RIFFLY_DUMP")) {  // evaluation only: per-unit features
    const double t_end = std::atof(dump);
    std::fprintf(stderr, "tuning %.3f semitones\n", cr.tuning_semitones);
    for (size_t u = 0; u < bounds.size() - 1 && bounds[u] < t_end; ++u) {
      std::array<int, 12> order;
      std::iota(order.begin(), order.end(), 0);
      std::sort(order.begin(), order.end(), [&](int a, int b) { return f.treble[u][a] > f.treble[u][b]; });
      const int bmax = static_cast<int>(std::max_element(f.bass[u].begin(), f.bass[u].end()) - f.bass[u].begin());
      std::fprintf(stderr, "%6.2f %c treble %-2s %-2s %-2s %-2s (%.2f %.2f %.2f %.2f) bass %-2s %.2f\n", bounds[u], on_beat[u] ? '|' : ' ',
                   kPitchNames[order[0]], kPitchNames[order[1]], kPitchNames[order[2]], kPitchNames[order[3]], f.treble[u][order[0]],
                   f.treble[u][order[1]], f.treble[u][order[2]], f.treble[u][order[3]], kPitchNames[bmax], f.bass[u][bmax]);
    }
  }
  const size_t S = states.size() + 1;  // + "no chord"

  std::vector<double> energies(cr.energy.begin(), cr.energy.end());
  const double quiet_threshold = kSilenceRatio * percentile(energies, 95);
  const auto key = estimate_key(cr, {});
  std::vector<double> base_bonus(S - 1);
  for (size_t s = 0; s + 1 < S; ++s) base_bonus[s] = states[s].prior + (key && diatonic(states[s].tones, key->tonic, key->major) ? P.key_bonus : 0.0);

  // Each unit's emission is weighted by its length in frames, so a long unit (a slow beat)
  // counts as much evidence as several short ones.
  auto decode = [&](const std::vector<double>& bonus, std::vector<double>* probs_out) {
    std::vector<double> logp(U * S);
    std::vector<double>& probs = *probs_out;
    probs.assign(U * S, 0.0);
    for (size_t u = 0; u < U; ++u) {
      double* p = &logp[u * S];
      for (size_t s = 0; s + 1 < S; ++s) p[s] = kSharpness * (chord_score(states[s], f.treble[u], f.bass[u], P.grid_bass) + bonus[s]);
      p[S - 1] = kSharpness * (f.energy[u] < quiet_threshold ? 2.0 + P.grid_bass : kNoChordSimilarity + 0.5 * P.grid_bass);
      const double mx = *std::max_element(p, p + S);
      double sum = 0;
      for (size_t s = 0; s < S; ++s) sum += std::exp(p[s] - mx);
      const double lse = mx + std::log(sum);
      const double frames = std::max(1.0, (bounds[u + 1] - bounds[u]) / cr.frame_seconds);
      for (size_t s = 0; s < S; ++s) {
        probs[u * S + s] = std::exp(p[s] - lse);
        p[s] = (p[s] - lse) * std::sqrt(frames);
      }
    }
    std::vector<double> delta(S), next(S);
    std::vector<uint16_t> back(U * S);
    for (size_t s = 0; s < S; ++s) delta[s] = logp[s];
    for (size_t u = 1; u < U; ++u) {
      const double sw = on_beat[u] ? P.switch_beat : P.switch_half;
      const double log_stay = std::log(1.0 - sw), log_switch = std::log(sw / (S - 1));
      size_t best = 0;
      for (size_t s = 1; s < S; ++s) if (delta[s] > delta[best]) best = s;
      for (size_t s = 0; s < S; ++s) {
        const double stay = delta[s] + log_stay, move = delta[best] + log_switch;
        const bool from_self = stay >= move || best == s;
        next[s] = (from_self ? stay : move) + logp[u * S + s];
        back[u * S + s] = static_cast<uint16_t>(from_self ? s : best);
      }
      delta.swap(next);
    }
    std::vector<size_t> path(U);
    path[U - 1] = static_cast<size_t>(std::max_element(delta.begin(), delta.end()) - delta.begin());
    for (size_t u = U - 1; u > 0; --u) path[u - 1] = back[u * S + path[u]];
    return path;
  };

  std::vector<double> probs;
  std::vector<size_t> path = decode(base_bonus, &probs);

  // Second pass with a song-vocabulary prior: songs reuse a handful of chords, so chords that
  // the first pass found for a good share of the song get a bonus and one-off chords a penalty.
  if (P.vocab_prior > 0) {
    std::vector<double> root_share(12 * 2, 0.0);  // by root and major/minor family
    double total = 0;
    auto family = [&](const State& s) { return (s.quality == "min" || s.quality == "m7" || s.quality == "dim") ? 1 : 0; };
    for (size_t u = 0; u < U; ++u) {
      if (path[u] == S - 1) continue;
      const double len = bounds[u + 1] - bounds[u];
      root_share[states[path[u]].root * 2 + family(states[path[u]])] += len;
      total += len;
    }
    if (total > 0) {
      std::vector<double> bonus = base_bonus;
      for (size_t s = 0; s + 1 < S; ++s) {
        const double share = root_share[states[s].root * 2 + family(states[s])] / total;
        bonus[s] += P.vocab_prior * std::log((share + 0.01) / 0.11);  // 0 at a 10% share
      }
      path = decode(bonus, &probs);
    }
  }

  // Segments: runs of units with the same chord *root* (C, Cadd9 and C/E flickering is one
  // chord). Each segment's quality and bass are then re-decided from the whole segment's
  // average, which is far cleaner evidence than single beats.
  std::vector<ChordSegment> segs;
  auto key_of = [&](size_t s) { return s == S - 1 ? -1 : states[s].root * 2 + ((states[s].quality == "min" || states[s].quality == "m7" || states[s].quality == "dim") ? 1 : 0); };
  for (size_t start = 0, i = 1; i <= U; ++i) {
    if (i < U && key_of(path[i]) == key_of(path[start])) continue;
    ChordSegment seg;
    seg.start = bounds[start];
    seg.end = bounds[i];
    const size_t s0 = path[start];
    if (s0 == S - 1) {
      seg.label = "N";
      double c = 0;
      for (size_t u = start; u < i; ++u) c += probs[u * S + S - 1];
      seg.confidence = c / (i - start);
    } else {
      std::array<float, 12> tr{}, bs{};
      double w_total = 0;
      for (size_t u = start; u < i; ++u) {
        const double w = bounds[u + 1] - bounds[u];
        for (int k = 0; k < 12; ++k) { tr[k] += static_cast<float>(f.treble[u][k] * w); bs[k] += static_cast<float>(f.bass[u][k] * w); }
        w_total += w;
      }
      for (float& v : bs) v = static_cast<float>(v / w_total);
      l2_normalise(tr);
      const int root = states[s0].root;
      const ChordSegment named = describe_chord(root, key_of(s0) % 2 == 1, tr, bs);
      seg.label = named.label;
      seg.root = root;
      seg.quality = named.quality;
      seg.bass = named.bass;
      double c = 0;
      for (size_t u = start; u < i; ++u)
        for (size_t o = 0; o + 1 < S; ++o) if (states[o].root == root) c += probs[u * S + o];
      seg.confidence = c / (i - start);
    }
    segs.push_back(seg);
    start = i;
  }
  return segs;
}

namespace {

// Slaney mel scale (librosa's default): linear below 1 kHz, logarithmic above.
double hz_to_mel(double hz) {
  const double f_sp = 200.0 / 3, min_log_hz = 1000.0, min_log_mel = min_log_hz / f_sp, logstep = std::log(6.4) / 27.0;
  return hz < min_log_hz ? hz / f_sp : min_log_mel + std::log(hz / min_log_hz) / logstep;
}
double mel_to_hz(double mel) {
  const double f_sp = 200.0 / 3, min_log_hz = 1000.0, min_log_mel = min_log_hz / f_sp, logstep = std::log(6.4) / 27.0;
  return mel < min_log_mel ? mel * f_sp : min_log_hz * std::exp(logstep * (mel - min_log_mel));
}

/** Triangular, area-normalised mel filters: filters[band] = (first bin, weights). */
std::vector<std::pair<size_t, std::vector<float>>> mel_filters(size_t n_fft, double sr, size_t bands) {
  const size_t bins = n_fft / 2 + 1;
  std::vector<double> edges(bands + 2);
  const double mmax = hz_to_mel(sr / 2);
  for (size_t i = 0; i < edges.size(); ++i) edges[i] = mel_to_hz(mmax * i / (bands + 1));
  std::vector<std::pair<size_t, std::vector<float>>> out;
  for (size_t m = 0; m < bands; ++m) {
    const double lo = edges[m], mid = edges[m + 1], hi = edges[m + 2];
    const double norm = 2.0 / (hi - lo);
    size_t first = bins;
    std::vector<float> w;
    for (size_t b = 0; b < bins; ++b) {
      const double hz = b * sr / n_fft;
      const double v = std::max(0.0, std::min((hz - lo) / (mid - lo), (hi - hz) / (hi - mid)));
      if (v > 0) {
        if (first == bins) first = b;
        w.resize(b - first + 1, 0.0f);
        w[b - first] = static_cast<float>(v * norm);
      }
    }
    out.emplace_back(first == bins ? 0 : first, std::move(w));
  }
  return out;
}

}  // namespace

std::vector<ChordSegment> refine_boundaries(const std::vector<float>& x, const std::vector<ChordSegment>& segs, double tuning) {
  if (segs.size() < 2 || tuning_params().refine_mode == 0) return segs;
  // Short-window chroma (4096-point window, 512 hop ~ 23 ms) from C3 up; the long chord window
  // above is good at *which* chord but blurs *when* it changes by a few hundred ms.
  constexpr size_t n_fft = 4096, hop = 512;
  const double bin_hz = kAnalysisRate / n_fft, frame_s = hop / kAnalysisRate;
  struct BinMap { size_t bin; int pc; float w; };
  std::vector<BinMap> map;
  for (size_t b = 1; b <= n_fft / 2; ++b) {
    const double hz = b * bin_hz;
    if (hz < 130.8 || hz > kMaxHz) continue;
    const double m = midi_of(hz) - tuning, nearest = std::round(m), w = 1.0 - 2.0 * std::abs(m - nearest);
    if (w <= 0) continue;
    const double per_semitone = hz * (std::pow(2.0, 1.0 / 12.0) - 1.0) / bin_hz;
    map.push_back({b, ((static_cast<int>(nearest) % 12) + 12) % 12, static_cast<float>(w / std::max(1.0, per_semitone))});
  }
  // "Attack chroma": per pitch class, how much louder it got since the previous frame. A chord
  // change happens where the newly struck notes switch to the new chord; what is still
  // *ringing* lags behind (the old chord's tail overlaps the new strum, and chords that share
  // notes look alike). Each frame keeps its attack strength as a weight.
  Chroma fine;
  std::vector<double> weight;
  std::array<float, 12> prev{};
  bool have_prev = false;
  stft_magnitudes(x, n_fft, hop, [&](size_t, const std::vector<float>& mags) {
    std::array<float, 12> c{};
    for (const auto& e : map) c[e.pc] += mags[e.bin] * e.w;
    if (tuning_params().refine_mode == 1) {  // what is ringing, equal weights
      std::array<float, 12> ring = c;
      l2_normalise(ring);
      fine.push_back(ring);
      weight.push_back(1.0);
      return;
    }
    std::array<float, 12> attack{};
    double w = 0;
    if (have_prev) {
      for (int k = 0; k < 12; ++k) {
        attack[k] = std::max(0.0f, c[k] - prev[k]);
        w += attack[k];
      }
    }
    prev = c;
    have_prev = true;
    l2_normalise(attack);
    fine.push_back(attack);
    weight.push_back(w);
  });
  static const std::vector<State> states = chord_states();
  auto tpl_of = [&](const ChordSegment& s) -> const std::array<float, 12>* {
    for (const auto& st : states) if (st.label == s.label) return &st.tpl;
    return nullptr;
  };
  auto sim = [&](const std::array<float, 12>& t, size_t f) {
    double v = 0;
    for (int k = 0; k < 12; ++k) v += t[k] * fine[f][k];
    return v;
  };

  std::vector<ChordSegment> out(segs);
  for (size_t i = 0; i + 1 < out.size(); ++i) {
    const auto* a = tpl_of(out[i]);
    const auto* b = tpl_of(out[i + 1]);
    if (!a || !b) continue;  // keep boundaries next to "no chord" as they are
    // Change-point search over one fixed window around the boundary: with d = sim(old) - sim(new)
    // per frame, the best split maximises sum(d before) - sum(d after). Using a fixed window
    // (not one that grows or shrinks with the candidate) treats every split fairly, which
    // matters when the two chords share notes (G/D, Em/C).
    const double boundary = out[i].end;
    const double reach = tuning_params().reach;
    const size_t f0 = static_cast<size_t>(std::max(out[i].start + 0.05, boundary - reach) / frame_s);
    const size_t f1 = std::min(fine.size(), static_cast<size_t>(std::min(out[i + 1].end - 0.05, boundary + reach) / frame_s));
    if (f1 <= f0 + 2) continue;
    std::vector<double> prefix(f1 - f0 + 1, 0.0);
    double attack_total = 0, attack_peak = 0;
    for (size_t f = f0; f < f1; ++f) {
      prefix[f - f0 + 1] = prefix[f - f0] + weight[f] * (sim(*a, f) - sim(*b, f));
      attack_total += weight[f];
      attack_peak = std::max(attack_peak, weight[f]);
    }
    // Without clear attacks (pads, sustained organ) there is nothing to time against.
    if (attack_peak <= 0 || attack_total < 3 * attack_peak) continue;
    const double total = prefix.back();
    double best = -1e300;
    size_t best_f = 0;
    // Between strums the score is flat (no attacks); ">=" takes the end of that plateau, i.e.
    // the frame where the new chord's first attack arrives.
    for (size_t k = 1; k < prefix.size() - 1; ++k) {
      const double score = prefix[k] - (total - prefix[k]);
      if (score >= best - 1e-12) { best = std::max(best, score); best_f = f0 + k; }
    }
    const double t = best_f * frame_s;
    out[i].end = t;
    out[i + 1].start = t;
  }
  return out;
}

std::optional<TempoResult> estimate_tempo(const std::vector<float>& x) {
  // 1. Onset strength as librosa computes it: 128-band mel power spectrogram in dB
  //    (80 dB floor), positive first difference, mean over bands. The mel scale weights low
  //    frequencies the way hearing does, so kicks and bass define the beat rather than the
  //    broadband hiss of hi-hats (which would otherwise pull the grid onto the off-beat).
  const double fps = kAnalysisRate / kOnsetHop;
  static const auto filters = mel_filters(kOnsetFft, kAnalysisRate, 128);
  std::vector<std::vector<float>> mel_db;
  float global_max = -1e9f;
  stft_magnitudes(x, kOnsetFft, kOnsetHop, [&](size_t, const std::vector<float>& m) {
    std::vector<float> bands(filters.size());
    for (size_t k = 0; k < filters.size(); ++k) {
      double e = 0;
      const auto& [first, w] = filters[k];
      for (size_t i = 0; i < w.size(); ++i) e += w[i] * static_cast<double>(m[first + i]) * m[first + i];
      bands[k] = static_cast<float>(10.0 * std::log10(std::max(e, 1e-10)));
      global_max = std::max(global_max, bands[k]);
    }
    mel_db.push_back(std::move(bands));
  });
  std::vector<float> onset(mel_db.size(), 0.0f), strum(mel_db.size(), 0.0f);
  // Strum envelope: the same flux over the guitar's main range only (300 Hz - 4 kHz), so kick
  // drums and hi-hats count less than strummed chords.
  const double mmax = hz_to_mel(kAnalysisRate / 2);
  size_t s_lo = filters.size(), s_hi = 0;
  for (size_t k = 0; k < filters.size(); ++k) {
    const double centre = mel_to_hz(mmax * (k + 1) / (filters.size() + 1));
    if (centre >= 300 && centre <= 4000) { s_lo = std::min(s_lo, k); s_hi = std::max(s_hi, k); }
  }
  for (size_t t = 1; t < mel_db.size(); ++t) {
    double flux = 0, sflux = 0;
    for (size_t k = 0; k < filters.size(); ++k) {
      const float cur = std::max(mel_db[t][k], global_max - 80.0f), prev = std::max(mel_db[t - 1][k], global_max - 80.0f);
      const float d = std::max(0.0f, cur - prev);
      flux += d;
      if (k >= s_lo && k <= s_hi) sflux += d;
    }
    onset[t] = static_cast<float>(flux / filters.size());
    strum[t] = static_cast<float>(sflux / std::max<size_t>(1, s_hi - s_lo + 1));
  }
  mel_db.clear();
  mel_db.shrink_to_fit();
  // librosa delays the envelope by n_fft / (2 * hop) frames so each onset sits at the centre
  // of the frame where it begins; do the same so beat times line up.
  onset.insert(onset.begin(), kOnsetFft / (2 * kOnsetHop), 0.0f);
  strum.insert(strum.begin(), kOnsetFft / (2 * kOnsetHop), 0.0f);
  const size_t N = onset.size();
  if (N < 16) return std::nullopt;
  // Normalise by the standard deviation (ddof = 1), exactly as librosa's beat tracker does.
  std::vector<double> env(onset.begin(), onset.end());
  const double mean = std::accumulate(env.begin(), env.end(), 0.0) / N;
  double var = 0;
  for (double v : env) var += (v - mean) * (v - mean);
  const double sd = std::sqrt(var / (N - 1));
  if (sd < 1e-9) return std::nullopt;
  for (double& v : env) v /= sd;

  // 2. Tempo: autocorrelation of the onset envelope, weighted by a log-normal prior around
  //    120 BPM (one octave std), as librosa does.
  const int min_lag = static_cast<int>(std::floor(60.0 * fps / 240.0));
  const int max_lag = std::min<int>(static_cast<int>(N) - 1, static_cast<int>(std::ceil(60.0 * fps / 40.0)));
  int best_lag = 0;
  double best_score = 0;
  const int ac_max = std::min<int>(static_cast<int>(N) - 1, 4 * max_lag + 1);
  std::vector<double> ac(ac_max + 2, 0.0);
  for (int lag = 1; lag <= ac_max; ++lag) {
    double s = 0;
    for (size_t i = static_cast<size_t>(lag); i < N; ++i) s += env[i] * env[i - lag];
    ac[lag] = s / (N - lag);
  }
  for (int lag = min_lag; lag <= max_lag; ++lag) {
    const double bpm = 60.0 * fps / lag;
    const double prior = std::exp(-0.5 * std::pow(std::log2(bpm / 120.0), 2));
    // Comb: a true beat period also repeats at 2 and 4 beats (half bar, bar); a syncopated
    // accent pattern (e.g. every 3 sixteenths) does not, which avoids 4:3 tempo errors.
    double comb = ac[lag];
    if (tuning_params().tempo_comb == 1) {
      if (2 * lag <= ac_max) comb += 0.5 * ac[2 * lag];
      if (4 * lag <= ac_max) comb += 0.25 * ac[4 * lag];
    } else if (tuning_params().tempo_comb == 2) {
      // The beat must also line up with its half (eighth notes) and double (half bar).
      const int h = static_cast<int>(std::lround(lag / 2.0));
      if (h >= 1) comb += 0.5 * ac[h];
      if (2 * lag <= ac_max) comb += 0.5 * ac[2 * lag];
    }
    const double score = comb * prior;
    if (score > best_score) { best_score = score; best_lag = lag; }
  }
  if (best_lag == 0) return std::nullopt;
  double period = best_lag;
  if (best_lag > min_lag && best_lag < max_lag) {  // parabolic refinement
    const double a = ac[best_lag - 1], b = ac[best_lag], c = ac[best_lag + 1];
    const double denom = a - 2 * b + c;
    if (denom != 0) period += 0.5 * (a - c) / denom;
  }

  // 3. Dynamic-programming beat tracker (Ellis 2007).
  std::vector<double> local(N, 0.0);
  const int w = static_cast<int>(std::round(period));
  for (size_t i = 0; i < N; ++i) {
    double s = 0;
    for (int d = -w; d <= w; ++d) {
      const long long j = static_cast<long long>(i) + d;
      if (j < 0 || j >= static_cast<long long>(N)) continue;
      s += env[static_cast<size_t>(j)] * std::exp(-0.5 * std::pow(d * 32.0 / period, 2));
    }
    local[i] = s;
  }
  const double tightness = 100.0;
  std::vector<double> cum(N);
  std::vector<long long> backlink(N, -1);
  const double local_max = *std::max_element(local.begin(), local.end());
  bool started = false;
  for (size_t i = 0; i < N; ++i) {
    double best = -1e300;
    long long arg = -1;
    const long long lo = static_cast<long long>(i) - static_cast<long long>(std::round(2 * period));
    const long long hi = static_cast<long long>(i) - static_cast<long long>(std::round(period / 2));
    for (long long j = std::max<long long>(lo, 0); j <= hi; ++j) {
      const double txwt = -tightness * std::pow(std::log((static_cast<double>(i) - j) / period), 2);
      const double score = cum[static_cast<size_t>(j)] + txwt;
      if (score > best) { best = score; arg = j; }
    }
    if (!started && local[i] > 0.01 * local_max) started = true;
    if (started && arg >= 0) {
      cum[i] = local[i] + best;
      backlink[i] = arg;
    } else {
      cum[i] = local[i];
    }
  }
  // Last beat: the latest local maximum of the cumulative score above half the median of maxima.
  std::vector<double> maxima;
  for (size_t i = 1; i + 1 < N; ++i) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push_back(cum[i]);
  const double med = maxima.empty() ? 0 : percentile(maxima, 50);
  long long last = static_cast<long long>(N) - 1;
  for (long long i = static_cast<long long>(N) - 2; i > 0; --i) {
    if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1] && cum[i] >= 0.5 * med) { last = i; break; }
  }
  std::vector<long long> frames;
  for (long long b = last; b >= 0; b = backlink[static_cast<size_t>(b)]) frames.push_back(b);
  std::reverse(frames.begin(), frames.end());

  // Trim weak beats at the edges (librosa: localscore below half its RMS over beats).
  double sq = 0;
  for (long long f : frames) sq += local[f] * local[f];
  const double thresh = 0.5 * std::sqrt(sq / std::max<size_t>(1, frames.size()));
  while (!frames.empty() && local[frames.front()] < thresh) frames.erase(frames.begin());
  while (!frames.empty() && local[frames.back()] < thresh) frames.pop_back();
  if (frames.size() < 4) return std::nullopt;

  TempoResult res;
  for (long long f : frames) res.beats.push_back(f * kOnsetHop / kAnalysisRate);
  res.strum_env = std::move(strum);
  res.env_fps = fps;
  double cv = 0;
  const double interval = trimmed_mean_interval(res.beats, &cv);
  res.bpm = std::round(600.0 / interval) / 10.0;
  res.confidence = std::round(std::clamp(1.0 - cv * 4.0, 0.0, 1.0) * 1000.0) / 1000.0;
  return res;
}

std::vector<ChordSegment> snap_to_beats(const std::vector<ChordSegment>& segs, const std::vector<double>& beats, double tolerance) {
  if (segs.size() < 2 || beats.empty()) return segs;
  std::vector<ChordSegment> out;
  double prev_end = segs.front().start;
  for (size_t i = 0; i < segs.size(); ++i) {
    double end = segs[i].end;
    if (i + 1 < segs.size()) {
      const auto it = std::min_element(beats.begin(), beats.end(), [&](double a, double b) { return std::abs(a - end) < std::abs(b - end); });
      if (std::abs(*it - end) <= tolerance) end = *it;
    }
    if (end - prev_end <= 1e-6) continue;
    ChordSegment cand = segs[i];
    cand.start = prev_end;
    cand.end = end;
    if (!out.empty() && out.back().label == cand.label) {
      ChordSegment& last = out.back();
      const double a = last.end - last.start, b = cand.end - cand.start;
      last.confidence = (last.confidence * a + cand.confidence * b) / (a + b);
      last.end = end;
    } else {
      out.push_back(cand);
    }
    prev_end = end;
  }
  return out;
}

std::optional<KeyResult> estimate_key(const ChromaResult& cr, const std::vector<ChordSegment>& segs) {
  static const double major[12] = {6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88};
  static const double minor[12] = {6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17};
  if (cr.chroma.empty()) return std::nullopt;
  std::array<double, 12> mean{}, chords{};
  for (const auto& c : cr.chroma) for (int k = 0; k < 12; ++k) mean[k] += c[k];
  for (const auto& s : segs) {
    if (s.root < 0) continue;
    const double dur = s.end - s.start;
    const auto& qs = qualities();
    const auto q = std::find_if(qs.begin(), qs.end(), [&](const QualityDef& d) { return s.quality == d.name; });
    if (q == qs.end()) continue;
    for (size_t i = 0; i < q->intervals.size(); ++i) chords[(s.root + q->intervals[i]) % 12] += (i == 0 ? 2 : 1) * dur;
  }
  auto unit = [](std::array<double, 12>& v) {
    const double t = std::accumulate(v.begin(), v.end(), 0.0);
    if (t > 0) for (double& x : v) x /= t;
  };
  unit(mean);
  unit(chords);
  std::array<double, 12> profile{};
  for (int k = 0; k < 12; ++k) profile[k] = 0.5 * mean[k] + 0.5 * chords[k];
  if (std::accumulate(profile.begin(), profile.end(), 0.0) <= 0) return std::nullopt;

  auto corr = [&](const double* tpl, int tonic) {
    double ma = 0, mb = 0;
    for (int k = 0; k < 12; ++k) { ma += profile[k]; mb += tpl[k]; }
    ma /= 12; mb /= 12;
    double num = 0, da = 0, db = 0;
    for (int k = 0; k < 12; ++k) {
      const double a = profile[k] - ma, b = tpl[((k - tonic) % 12 + 12) % 12] - mb;
      num += a * b; da += a * a; db += b * b;
    }
    return num / std::sqrt(da * db + 1e-12);
  };
  struct Score { double r; int tonic; bool major; };
  std::vector<Score> scores;
  for (int t = 0; t < 12; ++t) {
    scores.push_back({corr(major, t), t, true});
    scores.push_back({corr(minor, t), t, false});
  }
  std::sort(scores.begin(), scores.end(), [](const Score& a, const Score& b) { return a.r > b.r; });
  const double margin = std::max(0.0, scores[0].r - scores[1].r);
  KeyResult k;
  k.tonic = scores[0].tonic;
  k.major = scores[0].major;
  k.confidence = std::round(std::clamp(scores[0].r, 0.0, 1.0) * std::clamp(0.5 + margin * 5, 0.0, 1.0) * 1000) / 1000;
  return k;
}

std::vector<std::string> main_progression(const std::vector<ChordSegment>& segs, size_t max_len) {
  std::vector<std::string> seq;
  for (const auto& s : segs) if (s.label != "N" && (seq.empty() || seq.back() != s.label)) seq.push_back(s.label);
  if (seq.empty()) return {};
  double best_score = 0;
  std::vector<std::string> best;
  for (size_t n = 2; n <= std::min(max_len, seq.size() / 2); ++n) {
    std::map<std::vector<std::string>, int> counts;
    for (size_t i = 0; i + n <= seq.size(); ++i) counts[std::vector<std::string>(seq.begin() + i, seq.begin() + i + n)]++;
    // Most common n-gram; ties broken by first occurrence like Counter.most_common.
    std::vector<std::string> gram;
    int count = 0;
    for (size_t i = 0; i + n <= seq.size(); ++i) {
      std::vector<std::string> g(seq.begin() + i, seq.begin() + i + n);
      if (counts[g] > count) { count = counts[g]; gram = g; }
    }
    std::vector<std::string> uniq(gram);
    std::sort(uniq.begin(), uniq.end());
    uniq.erase(std::unique(uniq.begin(), uniq.end()), uniq.end());
    const double score = count * static_cast<double>(n) * (static_cast<double>(uniq.size()) / n);
    if (count >= 2 && score > best_score) { best_score = score; best = gram; }
  }
  if (!best.empty()) return best;
  std::vector<std::string> distinct;
  for (const auto& l : seq) if (std::find(distinct.begin(), distinct.end(), l) == distinct.end()) distinct.push_back(l);
  if (distinct.size() > 4) distinct.resize(4);
  return distinct;
}

std::vector<float> waveform_peaks(const std::vector<float>& x, size_t points) {
  if (x.empty()) return {};
  points = std::min(points, x.size());
  std::vector<float> peaks(points, 0.0f);
  for (size_t p = 0; p < points; ++p) {
    const size_t a = p * x.size() / points, b = (p + 1) * x.size() / points;
    for (size_t i = a; i < b; ++i) peaks[p] = std::max(peaks[p], std::abs(x[i]));
  }
  const float mx = *std::max_element(peaks.begin(), peaks.end());
  if (mx > 0) for (float& v : peaks) v = std::round(v / mx * 1000.0f) / 1000.0f;
  return peaks;
}

std::optional<StrumResult> estimate_strum(const TempoResult& tempo, const std::vector<ChordSegment>& chords) {
  const auto& beats = tempo.beats;
  const auto& env = tempo.strum_env;
  if (beats.size() < 16 || env.empty()) return std::nullopt;
  // Bar start: the beat phase (mod 4) where most chord changes land.
  std::array<int, 4> votes{};
  for (const auto& c : chords) {
    if (c.label == "N" || c.start < beats.front()) continue;
    const auto it = std::lower_bound(beats.begin(), beats.end(), c.start);
    size_t i = static_cast<size_t>(it - beats.begin());
    if (i > 0 && (i == beats.size() || c.start - beats[i - 1] < beats[i] - c.start)) --i;
    if (std::abs(beats[i] - c.start) < 0.15) votes[i % 4]++;
  }
  const int offset = static_cast<int>(std::max_element(votes.begin(), votes.end()) - votes.begin());
  // Strength at each sixteenth of the bar: the envelope's peak within +-30 ms of that point,
  // relative to the bar's mean so loud and quiet sections count equally.
  auto peak = [&](double t) {
    const long long c = std::llround(t * tempo.env_fps), w = std::max<long long>(1, std::llround(0.03 * tempo.env_fps));
    float m = 0;
    for (long long i = c - w; i <= c + w; ++i)
      if (i >= 0 && i < static_cast<long long>(env.size())) m = std::max(m, env[static_cast<size_t>(i)]);
    return static_cast<double>(m);
  };
  std::array<double, 16> acc{};
  int bars = 0;
  for (size_t b = static_cast<size_t>(offset); b + 4 < beats.size(); b += 4) {
    std::array<double, 16> v{};
    double sum = 0;
    for (int q = 0; q < 4; ++q) {
      const double t0 = beats[b + q], t1 = beats[b + q + 1];
      for (int k = 0; k < 4; ++k) {
        v[q * 4 + k] = peak(t0 + (t1 - t0) * k / 4.0);
        sum += v[q * 4 + k];
      }
    }
    if (sum <= 1e-6) continue;
    for (int i = 0; i < 16; ++i) acc[i] += v[i] / (sum / 16);
    ++bars;
  }
  if (bars < 4) return std::nullopt;
  StrumResult r;
  r.downbeat = offset;
  for (int i = 0; i < 16; ++i) r.sixteenths[i] = acc[i] / bars;
  const double mx = *std::max_element(r.sixteenths.begin(), r.sixteenths.end());
  for (double& v : r.sixteenths) v = mx > 0 ? v / mx : 0;
  for (int j = 0; j < 8; ++j) r.eighths[j] = r.sixteenths[2 * j];
  // Hits: eighths clearly above the quietest ones. Downstrokes on the beat, upstrokes between.
  std::array<double, 8> sorted = r.eighths;
  std::sort(sorted.begin(), sorted.end());
  const double lo = (sorted[0] + sorted[1]) / 2, hi = sorted[7];
  const double cut = lo + 0.45 * (hi - lo);
  double hit_sum = 0, miss_sum = 0;
  int hits = 0, misses = 0;
  for (int j = 0; j < 8; ++j) {
    const bool hit = r.eighths[j] >= cut || j == 0;
    r.pattern += hit ? (j % 2 == 0 ? 'D' : 'U') : '-';
    (hit ? hit_sum : miss_sum) += r.eighths[j];
    (hit ? hits : misses)++;
  }
  // 16th-note feel: the in-between sixteenths are nearly as strong as the eighths.
  double odd = 0, even = 0;
  for (int i = 0; i < 16; ++i) (i % 2 ? odd : even) += r.sixteenths[i];
  r.sixteenth_feel = odd > 0.8 * even;
  const double contrast = hits && misses ? hit_sum / hits - miss_sum / misses : 0.2;
  r.confidence = std::round(std::clamp(contrast * 2.0, 0.0, 1.0) * 1000) / 1000;
  return r;
}

Analysis analyse(const std::vector<float>& x) {
  const auto t0 = std::chrono::steady_clock::now();
  Analysis a;
  a.duration = x.size() / kAnalysisRate;
  a.notes.push_back(
      "Chords are estimated from the full mix (all instruments), not from an isolated guitar track. "
      "Voicings shown in the app are suggestions for playing along.");
  const ChromaResult chroma = compute_chroma(x);
  a.tempo = estimate_tempo(x);
  if (!a.tempo) a.notes.push_back("No steady beat was detected; tempo is unavailable.");
  if (tuning_params().sync) {
    // Chords change on the beat grid (or half way through a beat for pushed changes).
    a.chords = recognise_chords_on_grid(chroma, a.tempo ? a.tempo->beats : std::vector<double>{}, a.duration);
  } else {
    a.chords = refine_boundaries(x, recognise_chords(chroma, a.duration), chroma.tuning_semitones);
    if (a.tempo) a.chords = snap_to_beats(a.chords, a.tempo->beats, tuning_params().snap);
  }
  a.key = estimate_key(chroma, a.chords);
  if (a.tempo) a.strum = estimate_strum(*a.tempo, a.chords);
  a.progression = main_progression(a.chords);
  a.waveform = waveform_peaks(x);
  a.processing_seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  return a;
}

namespace {
std::string esc(const std::string& s) {
  std::string o;
  for (char c : s) {
    if (c == '"' || c == '\\') o += '\\';
    o += c;
  }
  return o;
}
std::string num(double v, int decimals = 3) {
  std::ostringstream os;
  os.setf(std::ios::fixed);
  os.precision(decimals);
  os << v;
  std::string s = os.str();
  if (s.find('.') != std::string::npos) {
    while (s.back() == '0') s.pop_back();
    if (s.back() == '.') s.pop_back();
  }
  return s == "-0" ? "0" : s;
}
}  // namespace

std::string to_json(const Analysis& a) {
  std::ostringstream o;
  o << "{\"duration\":" << num(a.duration);
  o << ",\"key\":" << (a.key ? "\"" + a.key->name() + "\"" : "null");
  o << ",\"key_confidence\":" << (a.key ? num(a.key->confidence) : "null");
  o << ",\"bpm\":" << (a.tempo ? num(a.tempo->bpm, 1) : "null");
  o << ",\"bpm_confidence\":" << (a.tempo ? num(a.tempo->confidence) : "null");
  o << ",\"chords\":[";
  for (size_t i = 0; i < a.chords.size(); ++i) {
    const auto& c = a.chords[i];
    o << (i ? "," : "") << "{\"start\":" << num(c.start) << ",\"end\":" << num(c.end) << ",\"label\":\"" << esc(c.label)
      << "\",\"root\":" << (c.root < 0 ? "null" : std::to_string(c.root))
      << ",\"quality\":" << (c.quality.empty() ? "null" : "\"" + c.quality + "\"") << ",\"confidence\":" << num(c.confidence) << "}";
  }
  o << "],\"progression\":[";
  for (size_t i = 0; i < a.progression.size(); ++i) o << (i ? "," : "") << "\"" << esc(a.progression[i]) << "\"";
  o << "],\"beats\":[";
  if (a.tempo) for (size_t i = 0; i < a.tempo->beats.size(); ++i) o << (i ? "," : "") << num(a.tempo->beats[i]);
  o << "],\"waveform\":[";
  for (size_t i = 0; i < a.waveform.size(); ++i) o << (i ? "," : "") << num(a.waveform[i]);
  o << "]";
  if (a.strum) {
    o << ",\"strum\":{\"pattern\":\"" << a.strum->pattern << "\",\"downbeat\":" << a.strum->downbeat
      << ",\"sixteenth_feel\":" << (a.strum->sixteenth_feel ? "true" : "false") << ",\"confidence\":" << num(a.strum->confidence)
      << ",\"sixteenths\":[";
    for (int i = 0; i < 16; ++i) o << (i ? "," : "") << num(a.strum->sixteenths[i]);
    o << "]}";
  }
  o << ",\"model_version\":\"riffly-cpp-0.2.0+beat-sync\",\"processing_seconds\":" << num(a.processing_seconds, 2);
  o << ",\"notes\":[";
  for (size_t i = 0; i < a.notes.size(); ++i) o << (i ? "," : "") << "\"" << esc(a.notes[i]) << "\"";
  o << "]}";
  return o.str();
}

}  // namespace riffly
