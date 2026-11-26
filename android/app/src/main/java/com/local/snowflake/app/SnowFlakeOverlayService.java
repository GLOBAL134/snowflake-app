package com.local.snowflake.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;

public class SnowFlakeOverlayService extends Service {
    public static boolean isRunning = false;
    private static final String CHANNEL_ID = "snowflake_overlay";

    private WindowManager windowManager;
    private OverlayView overlayView;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        startForegroundNotification();

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        overlayView = new OverlayView(this);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                flags,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;

        windowManager.addView(overlayView, params);
        overlayView.start();
    }

    private void startForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "SnowFlake Overlay",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        Notification notif = builder
                .setContentTitle("SnowFlake")
                .setContentText("Снег поверх всех приложений включён")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(101, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(101, notif);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (overlayView != null) {
            overlayView.stop();
            if (windowManager != null) {
                try {
                    windowManager.removeView(overlayView);
                } catch (Exception ignored) {
                }
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static class OverlayView extends View {
        private final SnowFlakeEngine snow = new SnowFlakeEngine(false);
        private final Handler handler = new Handler(Looper.getMainLooper());
        private boolean active = false;
        private long lastMs = System.currentTimeMillis();

        private final Runnable ticker = new Runnable() {
            @Override
            public void run() {
                if (!active) return;
                invalidate();
                handler.postDelayed(this, 16);
            }
        };

        OverlayView(Context context) {
            super(context);
        }

        void start() {
            active = true;
            lastMs = System.currentTimeMillis();
            handler.post(ticker);
        }

        void stop() {
            active = false;
            handler.removeCallbacks(ticker);
        }

        @Override
        protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            super.onSizeChanged(w, h, oldw, oldh);
            snow.resize(w, h);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            long now = System.currentTimeMillis();
            float dt = Math.min(0.05f, Math.max(0.001f, (now - lastMs) / 1000f));
            lastMs = now;
            snow.step(dt);
            snow.draw(canvas);
        }
    }
}
