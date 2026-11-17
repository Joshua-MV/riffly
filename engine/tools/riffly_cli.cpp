// riffly-cli <audio file>: print the engine's analysis JSON (for comparisons and debugging).
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>

#include "riffly/engine.h"

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: riffly-cli <file.mp3|file.wav>\n");
    return 2;
  }
  std::ifstream f(argv[1], std::ios::binary);
  if (!f) {
    std::fprintf(stderr, "cannot open %s\n", argv[1]);
    return 2;
  }
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(f)), {});
  char* json = nullptr;
  char* err = nullptr;
  if (riffly_analyze(bytes.data(), bytes.size(), 12 * 60, &json, &err) != 0) {
    std::fprintf(stderr, "error: %s\n", err ? err : "unknown");
    riffly_free(err);
    return 1;
  }
  std::printf("%s\n", json);
  riffly_free(json);
  return 0;
}
