fn main() {
    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-env-changed=VITE_DISCORD_CLIENT_ID");
    let id = std::env::var("VITE_DISCORD_CLIENT_ID").ok().or_else(|| {
        std::fs::read_to_string("../.env").ok().and_then(|s| {
            s.lines().find_map(|l| {
                l.trim()
                    .strip_prefix("VITE_DISCORD_CLIENT_ID=")
                    .map(|v| v.trim().trim_matches('"').to_string())
            })
        })
    });
    if let Some(id) = id.filter(|v| !v.is_empty()) {
        println!("cargo:rustc-env=DISCORD_CLIENT_ID={id}");
    }
    tauri_build::build()
}
