// Decoding MP3 (minimp3) and WAV (dr_wav) into float PCM.
#include "audio_io.h"

#include <cstdlib>
#include <cstring>

#define MINIMP3_IMPLEMENTATION
#define MINIMP3_FLOAT_OUTPUT
#include "../third_party/minimp3/minimp3.h"
#include "../third_party/minimp3/minimp3_ex.h"

#define DR_WAV_IMPLEMENTATION
#define DR_WAV_NO_STDIO
#include "../third_party/dr_libs/dr_wav.h"

namespace riffly {

Container sniff(const uint8_t* d, size_t n) {
  if (n >= 12 && std::memcmp(d, "RIFF", 4) == 0 && std::memcmp(d + 8, "WAVE", 4) == 0) return Container::Wav;
  if (n >= 3 && std::memcmp(d, "ID3", 3) == 0) return Container::Mp3;
  if (n >= 2 && d[0] == 0xFF && (d[1] & 0xE0) == 0xE0) return Container::Mp3;
  if (n >= 8 && std::memcmp(d + 4, "ftyp", 4) == 0) return Container::Mp4;
  return Container::Unknown;
}

bool decode(const uint8_t* data, size_t size, Pcm& out, std::string& error) {
  switch (sniff(data, size)) {
    case Container::Wav: {
      unsigned int channels = 0, rate = 0;
      drwav_uint64 frames = 0;
      float* pcm = drwav_open_memory_and_read_pcm_frames_f32(data, size, &channels, &rate, &frames, nullptr);
      if (!pcm || channels == 0 || rate == 0) {
        error = "Could not decode this WAV file.";
        if (pcm) drwav_free(pcm, nullptr);
        return false;
      }
      out.channels = static_cast<int>(channels);
      out.sample_rate = static_cast<int>(rate);
      out.samples.assign(pcm, pcm + frames * channels);
      drwav_free(pcm, nullptr);
      return !out.samples.empty() || (error = "The file contains no audio samples.", false);
    }
    case Container::Mp3: {
      mp3dec_t dec;
      mp3dec_file_info_t info{};
      if (mp3dec_load_buf(&dec, data, size, &info, nullptr, nullptr) != 0 || !info.buffer || info.samples == 0) {
        std::free(info.buffer);
        error = "Could not decode this MP3 file.";
        return false;
      }
      out.channels = info.channels;
      out.sample_rate = info.hz;
      out.samples.assign(info.buffer, info.buffer + info.samples);
      std::free(info.buffer);
      return true;
    }
    case Container::Mp4:
      error = "M4A/AAC files aren't supported by the built-in engine yet. Convert the song to MP3 or WAV.";
      return false;
    default:
      error = "Unsupported file. Use an MP3 or WAV audio file.";
      return false;
  }
}

std::vector<float> to_mono(const Pcm& pcm) {
  const size_t ch = static_cast<size_t>(pcm.channels);
  const size_t frames = pcm.samples.size() / ch;
  std::vector<float> mono(frames);
  for (size_t i = 0; i < frames; ++i) {
    float s = 0.0f;
    for (size_t c = 0; c < ch; ++c) s += pcm.samples[i * ch + c];
    mono[i] = s / static_cast<float>(ch);
  }
  return mono;
}

}  // namespace riffly
