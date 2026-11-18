fn main() {
    let engine = std::path::Path::new("../../engine");

    // whisper.cpp (on-device lyrics), built with CMake as static libraries. CPU only, and
    // targeting AVX2 (any PC from about 2013 on) instead of this machine's exact CPU, so the
    // app runs on other people's PCs too.
    let whisper_src = engine.join("third_party/whisper.cpp");
    let whisper = cmake::Config::new(&whisper_src)
        .profile("Release")
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("WHISPER_BUILD_TESTS", "OFF")
        .define("WHISPER_BUILD_EXAMPLES", "OFF")
        .define("WHISPER_BUILD_SERVER", "OFF")
        .define("GGML_OPENMP", "OFF")
        .define("GGML_METAL", "OFF")
        .define("GGML_NATIVE", "OFF")
        .define("GGML_AVX", "ON")
        .define("GGML_AVX2", "ON")
        .define("GGML_FMA", "ON")
        .define("GGML_F16C", "ON")
        .cxxflag("/utf-8")
        .build();
    println!("cargo:rustc-link-search=native={}", whisper.join("lib").display());
    for lib in ["whisper", "ggml", "ggml-base", "ggml-cpu"] {
        println!("cargo:rustc-link-lib=static={lib}");
    }
    println!("cargo:rustc-link-lib=advapi32");

    // The Riffly C++ audio engine (engine/) plus the small lyrics wrapper around whisper.cpp.
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .include(engine.join("include"))
        .include(whisper_src.join("include"))
        .include(whisper_src.join("ggml/include"))
        .files(["src/engine.cpp", "src/analysis.cpp", "src/dsp.cpp", "src/audio_io.cpp", "src/lyrics_whisper.cpp"].map(|f| engine.join(f)))
        .warnings(false)
        .opt_level(3);
    if build.get_compiler().is_like_msvc() {
        build.flag("/utf-8").flag("/EHsc").define("_CRT_SECURE_NO_WARNINGS", None);
    }
    build.compile("riffly_engine");
    for dir in ["src", "include"] {
        println!("cargo:rerun-if-changed={}", engine.join(dir).display());
    }
    println!("cargo:rerun-if-changed={}", whisper_src.join("CMakeLists.txt").display());

    tauri_build::build()
}
