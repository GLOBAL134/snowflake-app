package com.local.snowflake.app;

import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

public class SnowFlakeWallpaperService extends WallpaperService {
    @Override
    public Engine onCreateEngine() {
        return new SnowWallpaperEngine();
    }

    private class SnowWallpaperEngine extends Engine {
        private final SnowFlakeEngine snow = new SnowFlakeEngine(true);
        private final Handler handler = new Handler(Looper.getMainLooper());
        private boolean visible = false;
        private long lastMs = System.currentTimeMillis();

        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                drawFrame();
                if (visible) {
                    handler.postDelayed(this, 16);
                }
            }
        };

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            snow.resize(width, height);
            drawFrame();
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            handler.removeCallbacks(drawRunner);
            if (visible) {
                lastMs = System.currentTimeMillis();
                handler.post(drawRunner);
            }
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            super.onSurfaceDestroyed(holder);
            visible = false;
            handler.removeCallbacks(drawRunner);
        }

        private void drawFrame() {
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;
            try {
                canvas = holder.lockCanvas();
                if (canvas != null) {
                    long now = System.currentTimeMillis();
                    float dt = Math.min(0.05f, Math.max(0.001f, (now - lastMs) / 1000f));
                    lastMs = now;
                    snow.step(dt);
                    snow.draw(canvas);
                }
            } finally {
                if (canvas != null) {
                    try {
                        holder.unlockCanvasAndPost(canvas);
                    } catch (IllegalArgumentException ignored) {
                    }
                }
            }
        }
    }
}
