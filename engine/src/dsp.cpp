#include "dsp.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace riffly {

namespace {
constexpr double kPi = 3.14159265358979323846;
}

FFT::FFT(size_t n) : n_(n), rev_(n), twiddle_(n / 2) {
  if (n < 2 || (n & (n - 1)) != 0) throw std::invalid_argument("FFT size must be a power of two");
  size_t bits = 0;
  while ((size_t{1} << bits) < n) ++bits;
  for (size_t i = 0; i < n; ++i) {
    size_t r = 0;
    for (size_t b = 0; b < bits; ++b) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev_[i] = r;
  }
  for (size_t k = 0; k < n / 2; ++k) {
    const double a = -2.0 * kPi * static_cast<double>(k) / static_cast<double>(n);
    twiddle_[k] = cfloat(static_cast<float>(std::cos(a)), static_cast<float>(std::sin(a)));
  }
}

void FFT::forward(std::vector<cfloat>& data) const {
  for (size_t i = 0; i < n_; ++i) {
    if (i < rev_[i]) std::swap(data[i], data[rev_[i]]);
  }
  for (size_t len = 2; len <= n_; len <<= 1) {
    const size_t half = len / 2;
    const size_t step = n_ / len;
    for (size_t i = 0; i < n_; i += len) {
      for (size_t j = 0; j < half; ++j) {
        const cfloat t = twiddle_[j * step] * data[i + j + half];
        data[i + j + half] = data[i + j] - t;
        data[i + j] += t;
      }
    }
  }
}

std::vector<float> hann(size_t n) {
  std::vector<float> w(n);
  for (size_t i = 0; i < n; ++i) w[i] = static_cast<float>(0.5 - 0.5 * std::cos(2.0 * kPi * i / n));
  return w;
}

size_t stft_magnitudes(const std::vector<float>& x, size_t n_fft, size_t hop,
                       const std::function<void(size_t, const std::vector<float>&)>& on_frame) {
  const FFT fft(n_fft);
  const std::vector<float> window = hann(n_fft);
  const size_t pad = n_fft / 2;
  const size_t padded = x.size() + 2 * pad;
  const size_t frames = padded >= n_fft ? 1 + (padded - n_fft) / hop : 0;
  std::vector<cfloat> buf(n_fft);
  std::vector<float> mags(n_fft / 2 + 1);
  for (size_t f = 0; f < frames; ++f) {
    const long long start = static_cast<long long>(f * hop) - static_cast<long long>(pad);
    for (size_t i = 0; i < n_fft; ++i) {
      const long long idx = start + static_cast<long long>(i);
      const float s = (idx >= 0 && idx < static_cast<long long>(x.size())) ? x[static_cast<size_t>(idx)] : 0.0f;
      buf[i] = cfloat(s * window[i], 0.0f);
    }
    fft.forward(buf);
    for (size_t b = 0; b < mags.size(); ++b) mags[b] = std::abs(buf[b]);
    on_frame(f, mags);
  }
  return frames;
}

std::vector<float> resample(const std::vector<float>& x, double from_rate, double to_rate) {
  if (x.empty() || from_rate == to_rate) return x;
  const double ratio = to_rate / from_rate;
  const double cutoff = std::min(1.0, ratio) * 0.97;  // keep below the new Nyquist
  const int zeros = 16;
  const double support = zeros / cutoff;  // half-width in input samples
  const size_t out_len = static_cast<size_t>(std::floor(x.size() * ratio));
  std::vector<float> out(out_len);
  for (size_t i = 0; i < out_len; ++i) {
    const double t = i / ratio;
    const long long lo = static_cast<long long>(std::ceil(t - support));
    const long long hi = static_cast<long long>(std::floor(t + support));
    double acc = 0.0;
    for (long long k = std::max<long long>(lo, 0); k <= hi && k < static_cast<long long>(x.size()); ++k) {
      const double d = (t - static_cast<double>(k)) * cutoff;
      const double sinc = std::abs(d) < 1e-9 ? 1.0 : std::sin(kPi * d) / (kPi * d);
      const double u = (static_cast<double>(k) - t) / support;  // -1..1
      const double blackman = 0.42 + 0.5 * std::cos(kPi * u) + 0.08 * std::cos(2.0 * kPi * u);
      acc += x[static_cast<size_t>(k)] * sinc * blackman * cutoff;
    }
    out[i] = static_cast<float>(acc);
  }
  return out;
}

float median_inplace(float* begin, float* end) {
  const auto n = end - begin;
  if (n <= 0) return 0.0f;
  float* mid = begin + n / 2;
  std::nth_element(begin, mid, end);
  return *mid;
}

double percentile(std::vector<double> v, double p) {
  if (v.empty()) return 0.0;
  std::sort(v.begin(), v.end());
  const double pos = (p / 100.0) * (v.size() - 1);
  const size_t lo = static_cast<size_t>(std::floor(pos));
  const size_t hi = std::min(lo + 1, v.size() - 1);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

}  // namespace riffly
