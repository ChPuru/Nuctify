# Nuctify

Nuctify is a high-performance, cross-platform music aggregator designed to unify your streaming experience across YouTube, JioSaavn, and SoundCloud. Built with a focus on native performance and modern aesthetics, Nuctify provides a seamless experience for discovery, library management, and real-time scrobbling.

## Key Features

- **Multi-Provider Search**: Aggregate results from YouTube (Invidious/Piped), JioSaavn, and SoundCloud.
- **Native Experience**: Fully functional desktop (Tauri) and mobile (Android/Capacitor) applications.
- **Global Control**: Native media key support and system-level notifications for background playback.
- **Discord Integration**: Real-time Rich Presence to share your current listening session.
- **Legacy Scrobbling**: Full support for Last.fm and ListenBrainz session tracking.
- **Spotify Integration**: Import your existing Spotify playlists directly into the Nuctify ecosystem.
- **Optimized UI**: Responsive design featuring fluid animations, glassmorphism, and low-latency interactions.

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Desktop Production**: Tauri v2 (Rust backend)
- **Mobile Production**: Capacitor (Native Android)
- **Database / Auth**: Supabase (PostgreSQL)
- **Audio Engine**: Custom Native Bridge for bypass-CORS playback

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Rust (for Desktop builds)
- Android Studio (for Mobile builds)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/nuctify.git
   cd nuctify
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your environment:
   ```bash
   cp .env.example .env
   # Edit .env with your own API keys and Supabase URL
   ```

### Running Locally

- **Web Development**: `npm run dev`
- **Desktop Development**: `npm run tauri dev`
- **Mobile Development**: `npx cap sync android` and run via Android Studio

## Deployment

### Web
The project is optimized for deployment on Vercel or Netlify. Ensure you add your environment variables to the deployment dashboard.

### Desktop
Build production installers using:
```bash
npm run tauri build
```
Outputs can be found in `src-tauri/target/release/bundle/`.

### Mobile
Compile the production APK via Android Studio:
1. Run `npm run build`
2. Run `npx cap sync android`
3. Open in Android Studio and select **Build > Build APK(s)**.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
