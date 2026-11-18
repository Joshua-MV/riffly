mod engine;

use tauri::ipc::{InvokeBody, Request, Response};

/// Raw bytes sent from the app (no JSON/base64 round-trip for multi-megabyte songs).
fn body_bytes(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err("Expected the song's bytes".into()),
    }
}

/// Analyse a song on this PC with the C++ engine. Returns the analysis JSON.
#[tauri::command]
async fn analyze_audio(request: Request<'_>) -> Result<String, String> {
    let bytes = body_bytes(&request)?;
    tauri::async_runtime::spawn_blocking(move || engine::analyze(&bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// Convert a song to MP3 (MP3 input is kept as-is). Returns raw MP3 bytes.
#[tauri::command]
async fn to_mp3(request: Request<'_>) -> Result<Response, String> {
    let bytes = body_bytes(&request)?;
    let mp3 = tauri::async_runtime::spawn_blocking(move || engine::to_mp3(&bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(mp3))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![analyze_audio, to_mp3])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
