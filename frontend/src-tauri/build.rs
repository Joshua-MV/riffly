fn main() {
    // Compile the Riffly C++ audio engine (engine/) into the app.
    let engine = std::path::Path::new("../../engine");
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .include(engine.join("include"))
        .files(["src/engine.cpp", "src/analysis.cpp", "src/dsp.cpp", "src/audio_io.cpp"].map(|f| engine.join(f)))
        .warnings(false)
        .opt_level(3);
    if build.get_compiler().is_like_msvc() {
        build.flag("/utf-8").flag("/EHsc").define("_CRT_SECURE_NO_WARNINGS", None);
    }
    build.compile("riffly_engine");
    for dir in ["src", "include", "third_party"] {
        println!("cargo:rerun-if-changed={}", engine.join(dir).display());
    }

    tauri_build::build()
}
