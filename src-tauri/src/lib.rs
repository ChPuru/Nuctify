use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    menu::{Menu, MenuItem},
    Manager, Listener, WindowEvent
};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{Arc, Mutex};
use serde::Deserialize;

#[derive(Deserialize)]
struct TrackPayload {
    title: String,
    artist: String,
}

/// Downloads audio from a URL via Rust (bypasses all CORS/webview restrictions)
/// and saves to a temp file. Returns the file path for the webview to play.
#[tauri::command]
async fn proxy_audio(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Fetch error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Read error: {}", e))?;

    // Save to temp dir with a fixed name (overwritten each time)
    let temp_dir = std::env::temp_dir().join("nuctify");
    let _ = std::fs::create_dir_all(&temp_dir);
    let temp_path = temp_dir.join("stream_audio.mp4");
    
    tokio::fs::write(&temp_path, &bytes)
        .await
        .map_err(|e| format!("Write error: {}", e))?;

    Ok(temp_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![proxy_audio])
        .setup(|app| {
            // Setup System Tray
            let quit_i = MenuItem::with_id(app, "quit", "Quit Nuctify", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Nuctify", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Initialize Discord RPC
            let discord_client_id = option_env!("VITE_DISCORD_CLIENT_ID").unwrap_or("");
            let mut client = DiscordIpcClient::new(discord_client_id).unwrap_or_else(|_| DiscordIpcClient::new("").unwrap());
            let _ = client.connect();
            let discord_client = Arc::new(Mutex::new(client));

            let discord_clone = discord_client.clone();
            app.listen("track_changed", move |event| {
                if let Ok(payload) = serde_json::from_str::<TrackPayload>(event.payload()) {
                    let mut d = discord_clone.lock().unwrap();
                    let _ = d.set_activity(activity::Activity::new()
                        .state(&payload.artist)
                        .details(&payload.title)
                        .assets(activity::Assets::new().large_image("icon").large_text("Nuctify"))
                    );
                }
            });

            Ok(())
        })
        // Close the app when the window is closed
        .on_window_event(|_window, event| match event {
            WindowEvent::CloseRequested { .. } => {
                std::process::exit(0);
            }
            _ => {}
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
