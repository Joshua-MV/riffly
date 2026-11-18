//! Bridge to the Riffly C++ audio engine (engine/include/riffly/engine.h) and MP3 encoding.
//! Everything runs on this PC: no server, no network.

use std::ffi::{c_char, c_int, CStr};
use std::ptr;

use mp3lame_encoder::{Bitrate, Builder, FlushNoGap, InterleavedPcm, Quality};

unsafe extern "C" {
    fn riffly_analyze(data: *const u8, size: usize, max_duration_seconds: f64, json_out: *mut *mut c_char, error_out: *mut *mut c_char) -> c_int;
    fn riffly_decode(
        data: *const u8,
        size: usize,
        samples_out: *mut *mut f32,
        frames_out: *mut usize,
        channels_out: *mut c_int,
        sample_rate_out: *mut c_int,
        error_out: *mut *mut c_char,
    ) -> c_int;
    fn riffly_is_mp3(data: *const u8, size: usize) -> c_int;
    fn riffly_free(ptr: *mut std::ffi::c_void);
}

/// Take ownership of an engine-allocated C string.
unsafe fn take_string(p: *mut c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    let s = unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
    unsafe { riffly_free(p.cast()) };
    s
}

pub const MAX_DURATION_SECONDS: f64 = 12.0 * 60.0;

/// Analyse MP3/WAV bytes; returns the analysis JSON (same shape as the Python engine).
pub fn analyze(bytes: &[u8]) -> Result<String, String> {
    let mut json: *mut c_char = ptr::null_mut();
    let mut err: *mut c_char = ptr::null_mut();
    let rc = unsafe { riffly_analyze(bytes.as_ptr(), bytes.len(), MAX_DURATION_SECONDS, &mut json, &mut err) };
    if rc == 0 {
        Ok(unsafe { take_string(json) })
    } else {
        Err(unsafe { take_string(err) })
    }
}

/// Return the song as MP3: MP3 input is kept byte-for-byte (no quality loss); anything else is
/// decoded by the engine and encoded with LAME at 192 kbps.
pub fn to_mp3(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if unsafe { riffly_is_mp3(bytes.as_ptr(), bytes.len()) } == 1 {
        return Ok(bytes.to_vec());
    }
    let mut samples: *mut f32 = ptr::null_mut();
    let (mut frames, mut channels, mut rate) = (0usize, 0 as c_int, 0 as c_int);
    let mut err: *mut c_char = ptr::null_mut();
    let rc = unsafe { riffly_decode(bytes.as_ptr(), bytes.len(), &mut samples, &mut frames, &mut channels, &mut rate, &mut err) };
    if rc != 0 {
        return Err(unsafe { take_string(err) });
    }
    let ch = channels.clamp(1, 2) as usize;
    // Interleaved 16-bit PCM, keeping at most two channels.
    let pcm: Vec<i16> = {
        let all = unsafe { std::slice::from_raw_parts(samples, frames * channels as usize) };
        let mut out = Vec::with_capacity(frames * ch);
        for f in 0..frames {
            for c in 0..ch {
                let v = all[f * channels as usize + c].clamp(-1.0, 1.0);
                out.push((v * 32767.0) as i16);
            }
        }
        out
    };
    unsafe { riffly_free(samples.cast()) };

    let mut builder = Builder::new().ok_or("Could not start the MP3 encoder")?;
    builder.set_num_channels(ch as u8).map_err(|e| format!("MP3 encoder: {e:?}"))?;
    builder.set_sample_rate(rate as u32).map_err(|e| format!("MP3 encoder: {e:?}"))?;
    builder.set_brate(Bitrate::Kbps192).map_err(|e| format!("MP3 encoder: {e:?}"))?;
    builder.set_quality(Quality::NearBest).map_err(|e| format!("MP3 encoder: {e:?}"))?;
    let mut encoder = builder.build().map_err(|e| format!("MP3 encoder: {e:?}"))?;
    // encode_to_vec writes only into the Vec's *spare capacity*, and LAME treats a zero-size
    // output buffer as "unlimited", so the worst case must be reserved up front
    // (LAME's documented bound: 1.25 * samples per channel + 7200 bytes).
    let mut mp3 = Vec::with_capacity(frames + frames / 4 + 7200);
    if ch == 2 {
        encoder.encode_to_vec(InterleavedPcm(&pcm), &mut mp3).map_err(|e| format!("MP3 encoding failed: {e:?}"))?;
    } else {
        encoder.encode_to_vec(mp3lame_encoder::MonoPcm(&pcm), &mut mp3).map_err(|e| format!("MP3 encoding failed: {e:?}"))?;
    }
    mp3.reserve(7200);
    encoder.flush_to_vec::<FlushNoGap>(&mut mp3).map_err(|e| format!("MP3 encoding failed: {e:?}"))?;
    Ok(mp3)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(samples: &[i16], rate: u32) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&(36 + samples.len() as u32 * 2).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&rate.to_le_bytes());
        b.extend_from_slice(&(rate * 2).to_le_bytes());
        b.extend_from_slice(&2u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&(samples.len() as u32 * 2).to_le_bytes());
        for s in samples {
            b.extend_from_slice(&s.to_le_bytes());
        }
        b
    }

    #[test]
    fn wav_becomes_valid_smaller_mp3_and_analyses() {
        // 6 s of an A-major triad.
        let rate = 22050u32;
        let samples: Vec<i16> = (0..rate * 6)
            .map(|i| {
                let t = i as f32 / rate as f32;
                let v: f32 = [220.0f32, 277.18, 329.63].iter().map(|f| (2.0 * std::f32::consts::PI * f * t).sin()).sum();
                (v / 3.0 * 20000.0) as i16
            })
            .collect();
        let input = wav(&samples, rate);
        let mp3 = to_mp3(&input).expect("encode");
        assert!(mp3.len() < input.len() / 2, "mp3 {} vs wav {}", mp3.len(), input.len());
        assert_eq!(unsafe { riffly_is_mp3(mp3.as_ptr(), mp3.len()) }, 1);
        // The MP3 we produced must decode and analyse as an A major chord.
        let json = analyze(&mp3).expect("analyse");
        assert!(json.contains("\"label\":\"A\""), "{json}");
    }

    #[test]
    fn mp3_passes_through_unchanged() {
        let fake_mp3 = [0x49u8, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0];
        assert_eq!(to_mp3(&fake_mp3).unwrap(), fake_mp3.to_vec());
    }

    #[test]
    fn rejects_non_audio() {
        assert!(analyze(b"<html>not audio</html>").unwrap_err().contains("Unsupported"));
    }
}

