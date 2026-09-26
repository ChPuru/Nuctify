package co.nuctify.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    private final AudioService.CommandListener commandListener = action -> runOnUiThread(() -> {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String js = "window.dispatchEvent(new CustomEvent('native_media_control', { detail: { action: "
            + JSONObject.quote(action) + " } }));";
        getBridge().getWebView().evaluateJavascript(js, null);
    });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebSettings webSettings = this.bridge.getWebView().getSettings();
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        AudioService.listener = commandListener;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }

        this.bridge.getWebView().addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void updateMetadata(String title, String artist) {
                AudioService.pendingTitle = title != null ? title : "Nuctify";
                AudioService.pendingArtist = artist != null ? artist : "";
                runOnUiThread(() -> {
                    AudioService svc = AudioService.instance;
                    if (svc != null) svc.setMeta(title, artist);
                });
            }

            @android.webkit.JavascriptInterface
            public void updatePlaybackState(boolean playing) {
                runOnUiThread(() -> {
                    AudioService svc = AudioService.instance;
                    if (svc != null) {
                        svc.setPlaying(playing);
                    } else if (playing) {
                        Intent intent = new Intent(MainActivity.this, AudioService.class);
                        intent.setAction(AudioService.ACTION_PLAY);
                        intent.putExtra("from_js", true);
                        intent.putExtra(AudioService.EXTRA_TOKEN, AudioService.TOKEN);
                        try {
                            ContextCompat.startForegroundService(MainActivity.this, intent);
                        } catch (Exception e) {
                            Log.w(TAG, "Could not start AudioService", e);
                        }
                    }
                });
            }
        }, "NativeBridge");
    }

    @Override
    public void onDestroy() {
        if (AudioService.listener == commandListener) AudioService.listener = null;
        super.onDestroy();
    }
}
