use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Listener, Manager, WindowEvent,
};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct TrackPayload {
    title: String,
    artist: String,
}

#[derive(serde::Serialize)]
struct LocalTrack {
    id: String,
    title: String,
    artist: String,
    path: String,
}

const AUDIO_EXTS: &[&str] = &["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "webm"];

#[tauri::command]
async fn scan_local_music() -> Result<Vec<LocalTrack>, String> {
    let music_dir = dirs::audio_dir().ok_or("Music folder not found")?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut tracks = Vec::new();
        for entry in walkdir::WalkDir::new(music_dir)
            .follow_links(false)
            .max_depth(16)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if !AUDIO_EXTS.contains(&ext.as_str()) {
                continue;
            }
            let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let (artist, title) = match file_name.split_once(" - ") {
                Some((a, t)) => (a.trim().to_string(), t.trim().to_string()),
                None => ("Local Artist".to_string(), file_name),
            };
            let p = path.to_string_lossy().to_string();
            tracks.push(LocalTrack { id: format!("local-{}", p), title, artist, path: p });
        }
        tracks
    })
    .await
    .map_err(|e| e.to_string())
}

enum Rpc {
    Track(String, String),
    Playing(bool),
}

fn clamp(s: &str) -> String {
    let mut s: String = s.chars().take(128).collect();
    while s.chars().count() < 2 {
        s.push(' ');
    }
    s
}

fn now_unix() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn spawn_discord(client_id: &'static str) -> mpsc::Sender<Rpc> {
    let (tx, rx) = mpsc::channel::<Rpc>();
    std::thread::spawn(move || {
        let mut client: Option<DiscordIpcClient> = None;
        let mut last: Option<(String, String)> = None;
        let (mut playing, mut since, mut dirty) = (false, 0i64, false);
        loop {
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(Rpc::Track(t, a)) => {
                    last = Some((t, a));
                    playing = true;
                    since = now_unix();
                    dirty = true;
                }
                Ok(Rpc::Playing(p)) => {
                    if p && !playing {
                        since = now_unix();
                    }
                    playing = p;
                    dirty = true;
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if !dirty {
                continue;
            }
            if client.is_none() {
                let Ok(mut c) = DiscordIpcClient::new(client_id) else { continue };
                if c.connect().is_err() {
                    continue;
                }
                client = Some(c);
            }
            let Some(c) = client.as_mut() else { continue };
            let res = match &last {
                None => c.clear_activity(),
                Some((t, a)) => {
                    let details = clamp(t);
                    let state = clamp(&if playing { format!("by {a}") } else { format!("Paused - {a}") });
                    let mut act = activity::Activity::new()
                        .activity_type(activity::ActivityType::Listening)
                        .details(&details)
                        .state(&state)
                        .assets(activity::Assets::new().large_image("icon").large_text("Nuctify"));
                    if playing {
                        act = act.timestamps(activity::Timestamps::new().start(since));
                    }
                    c.set_activity(act)
                }
            };
            if res.is_err() {
                let _ = c.close();
                client = None;
            } else {
                dirty = false;
            }
        }
    });
    tx
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_local_music])
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit Nuctify", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Nuctify", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Nuctify")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => show_main(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            if let Some(id) = option_env!("DISCORD_CLIENT_ID") {
                let tx = spawn_discord(id);
                let tx2 = tx.clone();
                app.listen("track_changed", move |event| {
                    if let Ok(p) = serde_json::from_str::<TrackPayload>(event.payload()) {
                        let _ = tx.send(Rpc::Track(p.title, p.artist));
                    }
                });
                app.listen("playback_status", move |event| {
                    let playing = event.payload().trim().parse().unwrap_or(true);
                    let _ = tx2.send(Rpc::Playing(playing));
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
