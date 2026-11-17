// Small, dependency-free DSP building blocks: FFT, windows, streaming STFT, resampling.
#pragma once

#include <complex>
#include <cstddef>
#include <functional>
#include <vector>

namespace riffly {

using cfloat = std::complex<float>;

// Iterative radix-2 complex FFT. Size must be a power of two.
class FFT {
 public:
  explicit FFT(size_t n);
  void forward(std::vector<cfloat>& data) const;
  size_t size() const { return n_; }

 private:
  size_t n_;
  std::vector<size_t> rev_;
  std::vector<cfloat> twiddle_;
};

std::vector<float> hann(size_t n);

// Streams centred STFT frames (zero-padded by n_fft/2 at both ends) and calls
// `on_frame(index, magnitudes)` with n_fft/2+1 magnitudes. Nothing is stored, so memory stays
// small however long the song is. Returns the number of frames.
size_t stft_magnitudes(const std::vector<float>& x, size_t n_fft, size_t hop,
                       const std::function<void(size_t, const std::vector<float>&)>& on_frame);

// Band-limited resampling with a Blackman-windowed sinc (16 zero crossings).
std::vector<float> resample(const std::vector<float>& x, double from_rate, double to_rate);

// Median of [begin, end) (reorders the range).
float median_inplace(float* begin, float* end);

// Percentile (0-100) of a copy of the values, linear interpolation.
double percentile(std::vector<double> values, double p);

}  // namespace riffly
