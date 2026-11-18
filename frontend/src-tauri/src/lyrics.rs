//! On-device lyrics: whisper.cpp (MIT licence, engine/third_party) listens to the song and
//! writes down the words with their times. The speech model (~148 MB) is downloaded once, when
//! the user asks for it, into the app's data folder; after that everything runs offline.

use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::ptr;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::engine;

type ProgressFn = unsafe extern "C" fn(percent: c_int, user: *mut c_void);

unsafe extern "C" {
    fn riffly_transcribe(
        model_path: *const c_char,
        samples: *const f32,
        count: usize,
        threads: c_int,
        progress: Option<ProgressFn>,
        user: *mut c_void,
        json_out: *mut *mut c_char,
        error_out: *mut *mut c_char,
    ) -> c_int;
    fn riffly_free(ptr: *mut c_void);
}

unsafe fn take_string(p: *mut c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    let s = unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
    unsafe { riffly_free(p.cast()) };
    s
}

unsafe extern "C" fn on_progress(percent: c_int, user: *mut c_void) {
    let app = unsafe { &*(user as *const AppHandle) };
    let _ = app.emit("lyrics-progress", percent);
}

#[derive(Deserialize)]
struct RawResult {
    segments: Vec<RawSegment>,
}

#[derive(Deserialize)]
struct RawSegment {
    start: f64,
    end: f64,
    text: String,
}

/// Multilingual "base" model: a good balance of accuracy, speed (about real time / 10 on a
/// modern laptop CPU) and size.
const MODEL_FILE: &str = "ggml-base.bin";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
pub const MODEL_BYTES: u64 = 147_951_465;

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    Ok(dir.join(MODEL_FILE))
}

#[derive(Serialize)]
pub struct ModelStatus {
    pub present: bool,
    pub bytes: u64,
}

pub fn status(app: &AppHandle) -> Result<ModelStatus, String> {
    let path = model_path(app)?;
    let present = fs::metadata(&path).map(|m| m.len() > 50_000_000).unwrap_or(false);
    Ok(ModelStatus { present, bytes: MODEL_BYTES })
}

#[derive(Clone, Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

/// Download the speech model, reporting progress as `lyrics-model-progress` events.
pub fn download(app: &AppHandle) -> Result<(), String> {
    let path = model_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create the models folder: {e}"))?;
    }
    let part = path.with_extension("part");
    let resp = ureq::get(MODEL_URL).call().map_err(|e| format!("Download failed: {e}"))?;
    let total = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(MODEL_BYTES);
    let mut reader = resp.into_body().into_reader();
    let mut file = fs::File::create(&part).map_err(|e| format!("Could not save the model: {e}"))?;
    let mut buf = vec![0u8; 1 << 16];
    let (mut done, mut last) = (0u64, 0u64);
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("Download interrupted: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| format!("Could not save the model: {e}"))?;
        done += n as u64;
        if done - last >= 1 << 20 || done == total {
            last = done;
            let _ = app.emit("lyrics-model-progress", Progress { done, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    // Sanity check: a ggml model starts with the magic "lmgg" and is the expected size.
    let mut magic = [0u8; 4];
    fs::File::open(&part).and_then(|mut f| f.read_exact(&mut magic)).map_err(|e| e.to_string())?;
    if &magic != b"lmgg" || done < 50_000_000 {
        let _ = fs::remove_file(&part);
        return Err("The downloaded file isn't a speech model. Please try again.".into());
    }
    fs::rename(&part, &path).map_err(|e| format!("Could not save the model: {e}"))?;
    Ok(())
}

#[derive(Serialize)]
pub struct LyricSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

/// Lines that are only music markers or whisper's habitual sign-offs, not lyrics.
fn is_noise(text: &str) -> bool {
    let t = text.trim().trim_matches(|c: char| c == '♪' || c == '♫' || c == '*' || c.is_whitespace());
    if t.is_empty() {
        return true;
    }
    let lower = t.to_lowercase();
    let bracketed = (t.starts_with('[') && t.ends_with(']')) || (t.starts_with('(') && t.ends_with(')'));
    bracketed
        || lower.contains("thank you for watching")
        || lower.contains("thanks for watching")
        || lower.contains("subscribe")
        || lower == "you"
}

/// Transcribe the sung words. Progress (0-100) goes out as `lyrics-progress` events.
pub fn transcribe(app: &AppHandle, bytes: &[u8]) -> Result<Vec<LyricSegment>, String> {
    let path = model_path(app)?;
    if !status(app)?.present {
        return Err("The lyrics model isn't downloaded yet.".into());
    }
    let audio = engine::decode_mono(bytes, 16_000)?;
    if audio.is_empty() {
        return Err("The song has no audio.".into());
    }
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8) as c_int;
    let model = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let mut json: *mut c_char = ptr::null_mut();
    let mut err: *mut c_char = ptr::null_mut();
    let user = app as *const AppHandle as *mut c_void;
    let rc = unsafe { riffly_transcribe(model.as_ptr(), audio.as_ptr(), audio.len(), threads, Some(on_progress), user, &mut json, &mut err) };
    if rc != 0 {
        return Err(unsafe { take_string(err) });
    }
    let raw: RawResult = serde_json::from_str(&unsafe { take_string(json) }).map_err(|e| e.to_string())?;

    let mut out: Vec<LyricSegment> = Vec::new();
    for seg in raw.segments {
        let text = seg.text.trim_matches(|c: char| c == '♪' || c == '♫' || c.is_whitespace()).to_string();
        if is_noise(&text) {
            continue;
        }
        let (start, end) = (seg.start, seg.end);
        // Drop exact repeats of the line just before (a common whisper loop on held notes).
        if out.last().map(|l| l.text.eq_ignore_ascii_case(&text) && start - l.end < 0.5).unwrap_or(false) {
            if let Some(l) = out.last_mut() {
                l.end = end;
            }
            continue;
        }
        out.push(LyricSegment { start, end, text });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::is_noise;

    #[test]
    fn filters_music_markers_and_sign_offs() {
        assert!(is_noise("♪♪"));
        assert!(is_noise("[Music]"));
        assert!(is_noise("(guitar strumming)"));
        assert!(is_noise(" Thank you for watching! "));
        assert!(!is_noise("Lady, running down to the riptide"));
    }
}
