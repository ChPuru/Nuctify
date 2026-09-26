package co.nuctify.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.AudioAttributesCompat;
import androidx.media.AudioFocusRequestCompat;
import androidx.media.AudioManagerCompat;
import androidx.media.MediaBrowserServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class AudioService extends MediaBrowserServiceCompat {
    private static final String TAG = "AudioService";
    private static final String CHANNEL_ID = "nuctify_audio";
    private static final int NOTIFICATION_ID = 1;
    private static final long WAKE_LOCK_TIMEOUT_MS = 60 * 60 * 1000L;

    public static final String ACTION_PLAY = "co.nuctify.app.PLAY";
    public static final String ACTION_PAUSE = "co.nuctify.app.PAUSE";
    public static final String ACTION_NEXT = "co.nuctify.app.NEXT";
    public static final String ACTION_PREV = "co.nuctify.app.PREV";
    public static final String EXTRA_TOKEN = "t";
    public static final String TOKEN = UUID.randomUUID().toString();

    public interface CommandListener { void onCommand(String action); }

    static volatile CommandListener listener;
    static volatile AudioService instance;
    static volatile String pendingTitle = "Nuctify";
    static volatile String pendingArtist = "Music Player";

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private AudioManager audioManager;
    private AudioFocusRequestCompat focusRequest;
    private MediaSessionCompat mediaSession;
    private String currentTitle = "Nuctify";
    private String currentArtist = "Music Player";
    private boolean isPlaying = false;
    private boolean noisyRegistered = false;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) sendCommand("pause");
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (isPlaying) sendCommand("pause");
        }
    };

    private final MediaSessionCompat.Callback sessionCallback = new MediaSessionCompat.Callback() {
        @Override public void onPlay() { sendCommand("play"); }
        @Override public void onPause() { sendCommand("pause"); }
        @Override public void onStop() { sendCommand("pause"); }
        @Override public void onSkipToNext() { sendCommand("next"); }
        @Override public void onSkipToPrevious() { sendCommand("prev"); }
    };

    private static void sendCommand(String action) {
        CommandListener l = listener;
        if (l != null) l.onCommand(action);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, "NuctifyMedia");
        mediaSession.setCallback(sessionCallback);
        mediaSession.setActive(true);
        setSessionToken(mediaSession.getSessionToken());
        currentTitle = pendingTitle;
        currentArtist = pendingArtist;
        updateMetadata();
        updatePlaybackState();

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Nuctify::AudioWakeLock");
        wakeLock.setReferenceCounted(false);
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Nuctify::AudioWifiLock");
            wifiLock.setReferenceCounted(false);
        }
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        focusRequest = new AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributesCompat.Builder()
                .setUsage(AudioAttributesCompat.USAGE_MEDIA)
                .setContentType(AudioAttributesCompat.CONTENT_TYPE_MUSIC)
                .build())
            .setOnAudioFocusChangeListener(focusListener)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        showNotification();
        if (intent != null && TOKEN.equals(intent.getStringExtra(EXTRA_TOKEN))) {
            String action = intent.getAction();
            if (ACTION_PLAY.equals(action)) {
                if (intent.getBooleanExtra("from_js", false)) setPlaying(true);
                else sendCommand("play");
            } else if (ACTION_PAUSE.equals(action)) sendCommand("pause");
            else if (ACTION_NEXT.equals(action)) sendCommand("next");
            else if (ACTION_PREV.equals(action)) sendCommand("prev");
        } else if (!isPlaying) {
            stopForeground(false);
        }
        return START_NOT_STICKY;
    }

    void setMeta(String title, String artist) {
        currentTitle = title != null ? title : "Nuctify";
        currentArtist = artist != null ? artist : "";
        updateMetadata();
        if (isPlaying) acquireLocks();
        showNotification();
    }

    void setPlaying(boolean playing) {
        if (isPlaying == playing) return;
        isPlaying = playing;
        updatePlaybackState();
        if (playing) {
            acquireLocks();
            if (!noisyRegistered) {
                ContextCompat.registerReceiver(this, noisyReceiver,
                    new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
                noisyRegistered = true;
            }
        } else {
            releaseLocks();
            unregisterNoisy();
        }
        showNotification();
    }

    private void acquireLocks() {
        if (wakeLock != null) wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    private void unregisterNoisy() {
        if (noisyRegistered) {
            try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
            noisyRegistered = false;
        }
    }

    private void updatePlaybackState() {
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY |
                        PlaybackStateCompat.ACTION_PAUSE |
                        PlaybackStateCompat.ACTION_PLAY_PAUSE |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_STOP)
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, isPlaying ? 1.0f : 0f)
            .build());
    }

    private void updateMetadata() {
        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .build());
    }

    private void showNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .setOngoing(isPlaying)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Previous", getServicePendingIntent(ACTION_PREV)));
        if (isPlaying) {
            builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", getServicePendingIntent(ACTION_PAUSE)));
        } else {
            builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_play, "Play", getServicePendingIntent(ACTION_PLAY)));
        }
        builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Next", getServicePendingIntent(ACTION_NEXT)));

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, builder.build());
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground failed", e);
        }
    }

    private PendingIntent getServicePendingIntent(String action) {
        Intent intent = new Intent(this, AudioService.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_TOKEN, TOKEN);
        return PendingIntent.getService(this, action.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onDestroy() {
        instance = null;
        unregisterNoisy();
        if (audioManager != null && focusRequest != null) AudioManagerCompat.abandonAudioFocusRequest(audioManager, focusRequest);
        releaseLocks();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
        return new BrowserRoot("root", null);
    }

    @Override
    public void onLoadChildren(String parentId, Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(new ArrayList<>());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Nuctify Audio", NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
