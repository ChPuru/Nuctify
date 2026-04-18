package co.nuctify.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

private final BroadcastReceiver mediaReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            Log.d(TAG, "onReceive: Received broadcast action = " + action);

if ("co.nuctify.app.JS_EVENT".equals(action)) {
                final String cmd = intent.getStringExtra("action");
                final String fullAction = intent.getStringExtra("fullAction");
                Log.d(TAG, "onReceive: Forwarding to JS - cmd: " + cmd);

runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        String js = String.format(
                            "window.dispatchEvent(new CustomEvent('native_media_control', { detail: { action: '%s', fullAction: '%s' } }));",
                            cmd, fullAction
                        );
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                });
            }
        }
    };

@Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

WebSettings webSettings = this.bridge.getWebView().getSettings();
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

IntentFilter filter = new IntentFilter("co.nuctify.app.JS_EVENT");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(mediaReceiver, filter);
        }

Intent serviceIntent = new Intent(this, AudioService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

this.bridge.getWebView().addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void updateMetadata(String title, String artist) {
                Log.d(TAG, "JS: updateMetadata(" + title + ", " + artist + ")");
                Intent intent = new Intent(MainActivity.this, AudioService.class);
                intent.setAction(AudioService.ACTION_UPDATE_META);
                intent.putExtra("title", title);
                intent.putExtra("artist", artist);
                intent.putExtra("from_js", true);
                startService(intent);
            }

@android.webkit.JavascriptInterface
            public void updatePlaybackState(boolean playing) {
                Log.d(TAG, "JS: updatePlaybackState(" + playing + ")");
                Intent intent = new Intent(MainActivity.this, AudioService.class);
                intent.setAction(playing ? AudioService.ACTION_PLAY : AudioService.ACTION_PAUSE);
                intent.putExtra("from_js", true);
                startService(intent);
            }
        }, "NativeBridge");
    }

@Override
    public void onDestroy() {
        try {
            unregisterReceiver(mediaReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Error unregistering receiver", e);
        }
        super.onDestroy();
    }
}
