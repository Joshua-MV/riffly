#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace riffly {

enum class Container { Unknown, Wav, Mp3, Mp4 };

struct Pcm {
  std::vector<float> samples;  // interleaved, [-1, 1]
  int channels = 0;
  int sample_rate = 0;
  size_t frames() const { return channels ? samples.size() / static_cast<size_t>(channels) : 0; }
};

// Identify the container from magic bytes (never trust file names).
Container sniff(const uint8_t* data, size_t size);
bool decode(const uint8_t* data, size_t size, Pcm& out, std::string& error);
std::vector<float> to_mono(const Pcm& pcm);

}  // namespace riffly
