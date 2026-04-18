package co.nuctify.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class AudioService extends Service {
    private static final String TAG = "AudioService";
    private static final String CHANNEL_ID = "nuctify_audio";
    private static final int NOTIFICATION_ID = 1;

public static final String ACTION_PLAY = "co.nuctify.app.PLAY";
    public static final String ACTION_PAUSE = "co.nuctify.app.PAUSE";
    public static final String ACTION_NEXT = "co.nuctify.app.NEXT";
    public static final String ACTION_PREV = "co.nuctify.app.PREV";
    public static final String ACTION_UPDATE_META = "co.nuctify.app.UPDATE_META";

private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat mediaSession;
    private String currentTitle = "Nuctify";
    private String currentArtist = "Music Player";
    private boolean isPlaying = true;

private void handleAction(String action, Intent intent) {
        if (action == null) return;
        Log.d(TAG, "handleAction: Received action = " + action);

boolean fromJs = intent != null && intent.getBooleanExtra("from_js", false);

if (!fromJs) {

String jsAction = action.contains(".") ? action.substring(action.lastIndexOf('.') + 1).toLowerCase() : action.toLowerCase();

Intent jsEvent = new Intent("co.nuctify.app.JS_EVENT");
            jsEvent.putExtra("action", jsAction);
            jsEvent.putExtra("fullAction", action);
            jsEvent.setPackage(getPackageName());
            sendBroadcast(jsEvent);
            Log.d(TAG, "handleAction: Broadcast sent to MainActivity with action: " + jsAction);
        } else {
            Log.d(TAG, "handleAction: Action from JS, skipping JS_EVENT broadcast");
        }

if (action.equals(ACTION_PLAY)) {
            isPlaying = true;
            updatePlaybackState();
            showNotification();
        } else if (action.equals(ACTION_PAUSE)) {
            isPlaying = false;
            updatePlaybackState();
            showNotification();
        } else if (action.equals(ACTION_UPDATE_META) && intent != null) {
            currentTitle = intent.getStringExtra("title");
            currentArtist = intent.getStringExtra("artist");
            updateMetadata();
            showNotification();
        }
    }

private final MediaSessionCompat.Callback sessionCallback = new MediaSessionCompat.Callback() {
        @Override public void onPlay() { 
            Log.d(TAG, "MediaSession: onPlay()");
            handleAction(ACTION_PLAY, null); 
        }
        @Override public void onPause() { 
            Log.d(TAG, "MediaSession: onPause()");
            handleAction(ACTION_PAUSE, null); 
        }
        @Override public void onSkipToNext() { 
            Log.d(TAG, "MediaSession: onSkipToNext()");
            handleAction(ACTION_NEXT, null); 
        }
        @Override public void onSkipToPrevious() { 
            Log.d(TAG, "MediaSession: onSkipToPrevious()");
            handleAction(ACTION_PREV, null); 
        }
    };

@Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate: Service starting");
        createNotificationChannel();

mediaSession = new MediaSessionCompat(this, "NuctifyMedia");
        mediaSession.setCallback(sessionCallback);
        mediaSession.setActive(true);
        updatePlaybackState();

PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Nuctify::AudioWakeLock");
        wakeLock.acquire();
    }

private void updatePlaybackState() {
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | 
                        PlaybackStateCompat.ACTION_PAUSE |
                        PlaybackStateCompat.ACTION_PLAY_PAUSE |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT | 
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_STOP)
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
        mediaSession.setPlaybackState(stateBuilder.build());
    }

private void updateMetadata() {
        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .build()
        );
    }

@Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            Log.d(TAG, "onStartCommand: Intent action = " + intent.getAction());
            handleAction(intent.getAction(), intent);
        }
        showNotification();
        return START_STICKY;
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
                .setShowActionsInCompactView(0, 1, 2)
            );

builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Previous", getServicePendingIntent(ACTION_PREV)));
        if (isPlaying) {
            builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", getServicePendingIntent(ACTION_PAUSE)));
        } else {
            builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_play, "Play", getServicePendingIntent(ACTION_PLAY)));
        }
        builder.addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Next", getServicePendingIntent(ACTION_NEXT)));

startForeground(NOTIFICATION_ID, builder.build());
    }

private PendingIntent getServicePendingIntent(String action) {
        Intent intent = new Intent(this, AudioService.class);
        intent.setAction(action);

return PendingIntent.getService(this, action.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

@Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy: Service stopping");
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        super.onDestroy();
    }

@Override public IBinder onBind(Intent intent) { return null; }

private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Nuctify Audio", NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
