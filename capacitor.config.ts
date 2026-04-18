import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.nuctify.app',
  appName: 'Nuctify',
  webDir: 'dist',
  server: {
    // Use HTTPS scheme for security
    androidScheme: 'https',
    // Allow navigation to external domains for OAuth flows
    allowNavigation: ['*.supabase.co', 'accounts.google.com'],
  },
  android: {
    // Allow mixed content (HTTP audio streams from some CDNs)
    allowMixedContent: true,
  },
  plugins: {
    // Route ALL fetch() calls through native HTTP engine (Java/Kotlin)
    // This completely bypasses WebView CORS restrictions.
    // YouTube, LRCLIB lyrics, and all other API calls will work natively.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
