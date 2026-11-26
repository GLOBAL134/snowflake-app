package com.local.snowflake.app;

import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new AndroidSnowBridge(), "SnowFlakeAndroid");
        }
    }

    private class AndroidSnowBridge {
        @JavascriptInterface
        public boolean isOverlayRunning() {
            return SnowFlakeOverlayService.isRunning;
        }

        @JavascriptInterface
        public boolean toggleOverlay() {
            if (SnowFlakeOverlayService.isRunning) {
                stopService(new Intent(MainActivity.this, SnowFlakeOverlayService.class));
                return false;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(MainActivity.this)) {
                runOnUiThread(() -> {
                    Toast.makeText(
                            MainActivity.this,
                            "Разрешите «Поверх других приложений» для SnowFlake",
                            Toast.LENGTH_LONG
                    ).show();
                    Intent intent = new Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName())
                    );
                    startActivity(intent);
                });
                return false;
            }
            Intent svc = new Intent(MainActivity.this, SnowFlakeOverlayService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
            return true;
        }

        @JavascriptInterface
        public void openLiveWallpaperPicker() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                    intent.putExtra(
                            WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                            new ComponentName(MainActivity.this, SnowFlakeWallpaperService.class)
                    );
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }
}
