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
};
const Params& tuning_params() {
  static const Params p = [] {
    Params q;
    if (const char* v = std::getenv("RIFFLY_CHROMA_FFT")) q.chroma_fft = static_cast<size_t>(std::atoi(v));
    if (const char* v = std::getenv("RIFFLY_REFINE")) q.refine_mode = std::atoi(v);
    if (const char* v = std::getenv("RIFFLY_REACH")) q.reach = std::atof(v);
    if (const char* v = std::getenv("RIFFLY_SNAP")) q.snap = std::atof(v);
    return q;
  }();
  return p;
}

// Chroma STFT: long window for pitch resolution down to C2, 2048-sample hop (~93 ms),
// matching the Python engine's frame rate.
#define kChromaFft (tuning_params().chroma_fft)
constexpr size_t kChromaHop = 2048;
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

struct State {
  std::string label;
  int root;
  std::string quality;
  std::array<float, 12> tpl;
};

std::vector<State> chord_states() {
  std::vector<State> out;
  const std::pair<const char*, std::array<int, 3>> qualities[] = {{"maj", {0, 4, 7}}, {"min", {0, 3, 7}}};
  for (const auto& [q, iv] : qualities) {
    for (int r = 0; r < 12; ++r) {
      std::array<float, 12> t{};
      for (size_t i = 0; i < iv.size(); ++i) t[(r + iv[i]) % 12] = i == 0 ? 1.2f : 1.0f;
      l2_normalise(t);
      out.push_back({std::string(kPitchNames[r]) + (std::string(q) == "min" ? "m" : ""), r, q, t});
    }
  }
  return out;
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

  // Precompute each bin's pitch class and weight. Triangular weighting toward the nearest
  // semitone centre; divide by bins-per-semitone so every octave counts equally (like a CQT).
  const double bin_hz = kAnalysisRate / kChromaFft;
  struct BinMap { size_t bin; int pc; float w; };
  std::vector<BinMap> map;
  for (size_t b = 1; b <= kChromaFft / 2; ++b) {
    const double hz = b * bin_hz;
    if (hz < kMinHz || hz > kMaxHz) continue;
    const double m = midi_of(hz) - res.tuning_semitones;
    const double nearest = std::round(m);
    const double w = 1.0 - 2.0 * std::abs(m - nearest);
    if (w <= 0) continue;
    const double bins_per_semitone = hz * (std::pow(2.0, 1.0 / 12.0) - 1.0) / bin_hz;
    const int pc = ((static_cast<int>(nearest) % 12) + 12) % 12;
    map.push_back({b, pc, static_cast<float>(w / std::max(1.0, bins_per_semitone))});
  }

  std::vector<std::array<float, 12>> raw;
  stft_magnitudes(x, kChromaFft, kChromaHop, [&](size_t, const std::vector<float>& mags) {
    std::array<float, 12> c{};
    for (const auto& e : map) c[e.pc] += mags[e.bin] * e.w;
    raw.push_back(c);
  });

  // Log compression relative to the loudest value (as in the Python engine).
  float peak = 0;
  for (const auto& c : raw) for (float v : c) peak = std::max(peak, v);
  for (auto& c : raw) for (float& v : c) v = std::log1p(100.0f * v / (peak + 1e-9f));

  // Temporal median filter (9 frames ~ 0.8 s): suppresses drum hits and passing notes.
  const size_t T = raw.size();
  Chroma smooth(T);
  std::vector<float> window;
  for (size_t t = 0; t < T; ++t) {
    for (int k = 0; k < 12; ++k) {
      window.clear();
      for (long long d = -4; d <= 4; ++d) {
        const long long i = std::clamp<long long>(static_cast<long long>(t) + d, 0, static_cast<long long>(T) - 1);
        window.push_back(raw[static_cast<size_t>(i)][k]);
      }
      smooth[t][k] = median_inplace(window.data(), window.data() + window.size());
    }
  }
  res.energy.resize(T);
  for (size_t t = 0; t < T; ++t) {
    res.energy[t] = std::accumulate(smooth[t].begin(), smooth[t].end(), 0.0f);
    l2_normalise(smooth[t]);
  }
  res.chroma = std::move(smooth);
  return res;
}

std::vector<ChordSegment> recognise_chords(const ChromaResult& cr, double duration) {
  static const std::vector<State> states = chord_states();
  const size_t S = states.size() + 1;  // + "no chord"
  const size_t T = cr.chroma.size();
  if (T == 0) return {};

  std::vector<double> energies(cr.energy.begin(), cr.energy.end());
  const double quiet_threshold = kSilenceRatio * percentile(energies, 95);

  // Emission probabilities: softmax over cosine similarities (+ N state).
  std::vector<double> probs(T * S);
  for (size_t t = 0; t < T; ++t) {
    double* p = &probs[t * S];
    for (size_t s = 0; s + 1 < S; ++s) {
      double sim = 0;
      for (int k = 0; k < 12; ++k) sim += states[s].tpl[k] * cr.chroma[t][k];
      p[s] = kSharpness * sim;
    }
    p[S - 1] = kSharpness * (cr.energy[t] < quiet_threshold ? 2.0 : kNoChordSimilarity);
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
  std::vector<uint8_t> back(T * S);
  for (size_t s = 0; s < S; ++s) delta[s] = std::log(probs[s] + 1e-300) + std::log(1.0 / S);
  for (size_t t = 1; t < T; ++t) {
    size_t best = 0;
    for (size_t s = 1; s < S; ++s) if (delta[s] > delta[best]) best = s;
    for (size_t s = 0; s < S; ++s) {
      const double stay = delta[s] + log_stay;
      const double move = delta[best] + log_switch;
      const bool from_self = stay >= move || best == s;
      next[s] = (from_self ? stay : move) + std::log(probs[t * S + s] + 1e-300);
      back[t * S + s] = static_cast<uint8_t>(from_self ? s : best);
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
    double conf = 0;
    for (size_t t = start; t < i; ++t) conf += probs[t * S + s];
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
  std::vector<float> onset(mel_db.size(), 0.0f);
  for (size_t t = 1; t < mel_db.size(); ++t) {
    double flux = 0;
    for (size_t k = 0; k < filters.size(); ++k) {
      const float cur = std::max(mel_db[t][k], global_max - 80.0f), prev = std::max(mel_db[t - 1][k], global_max - 80.0f);
      flux += std::max(0.0f, cur - prev);
    }
    onset[t] = static_cast<float>(flux / filters.size());
  }
  mel_db.clear();
  mel_db.shrink_to_fit();
  // librosa delays the envelope by n_fft / (2 * hop) frames so each onset sits at the centre
  // of the frame where it begins; do the same so beat times line up.
  onset.insert(onset.begin(), kOnsetFft / (2 * kOnsetHop), 0.0f);
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
  std::vector<double> ac(max_lag + 2, 0.0);
  for (int lag = min_lag; lag <= max_lag + 1 && lag < static_cast<int>(N); ++lag) {
    double s = 0;
    for (size_t i = static_cast<size_t>(lag); i < N; ++i) s += env[i] * env[i - lag];
    ac[lag] = s / (N - lag);
  }
  for (int lag = min_lag; lag <= max_lag; ++lag) {
    const double bpm = 60.0 * fps / lag;
    const double prior = std::exp(-0.5 * std::pow(std::log2(bpm / 120.0), 2));
    const double score = ac[lag] * prior;
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
    const int third = s.quality == "min" ? 3 : 4;
    chords[s.root] += 2 * dur;
    chords[(s.root + third) % 12] += dur;
    chords[(s.root + 7) % 12] += dur;
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

Analysis analyse(const std::vector<float>& x) {
  const auto t0 = std::chrono::steady_clock::now();
  Analysis a;
  a.duration = x.size() / kAnalysisRate;
  a.notes.push_back(
      "Chords are estimated from the full mix (all instruments), not from an isolated guitar track. "
      "Voicings shown in the app are suggestions for playing along.");
  const ChromaResult chroma = compute_chroma(x);
  a.chords = refine_boundaries(x, recognise_chords(chroma, a.duration), chroma.tuning_semitones);
  a.tempo = estimate_tempo(x);
  // Boundaries are already precise; only nudge them onto a beat when one is very close.
  if (a.tempo) a.chords = snap_to_beats(a.chords, a.tempo->beats, tuning_params().snap);
  else a.notes.push_back("No steady beat was detected; tempo is unavailable.");
  a.key = estimate_key(chroma, a.chords);
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
  o << "],\"model_version\":\"riffly-cpp-0.1.0+template-hmm\",\"processing_seconds\":" << num(a.processing_seconds, 2);
  o << ",\"notes\":[";
  for (size_t i = 0; i < a.notes.size(); ++i) o << (i ? "," : "") << "\"" << esc(a.notes[i]) << "\"";
  o << "]}";
  return o.str();
}

}  // namespace riffly
