package com.local.snowflake.app;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.Shader;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Lightweight 60fps Android Canvas renderer for both the Live Wallpaper (cabin + snow)
 * and the transparent system-wide Overlay (falling snow + bottom snowdrift + tractor).
 */
public class SnowFlakeEngine {
    private static class Flake {
        float x, y, vx, vy, r, alpha, phase, wobbleSpeed;
    }

    private static class Star {
        float x, y, r, phase;
    }

    private static class Smoke {
        float x, y, r, alpha;
    }

    private final boolean drawCabinBackground;
    private final Random rng = new Random();
    private final List<Flake> flakes = new ArrayList<>();
    private final List<Star> stars = new ArrayList<>();
    private final List<Smoke> smoke = new ArrayList<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private int width = 1080;
    private int height = 1920;
    private float time = 0f;
    private float[] driftHeights = new float[0];
    private final float binWidth = 8f;

    // Tractor snowplow state
    private boolean plowActive = false;
    private float plowX = -150f;
    private float plowDir = 1f;
    private float plowCooldown = 8f;

    public SnowFlakeEngine(boolean drawCabinBackground) {
        this.drawCabinBackground = drawCabinBackground;
        for (int i = 0; i < 70; i++) {
            Star s = new Star();
            s.x = rng.nextFloat();
            s.y = 0.04f + rng.nextFloat() * 0.54f;
            s.r = 1.5f + rng.nextFloat() * 2.5f;
            s.phase = rng.nextFloat() * 6.28f;
            stars.add(s);
        }
    }

    public void resize(int w, int h) {
        if (w <= 0 || h <= 0) return;
        this.width = w;
        this.height = h;
        int bins = Math.max(4, (int) Math.ceil(w / binWidth));
        if (driftHeights.length != bins) {
            driftHeights = new float[bins];
        }
        if (flakes.isEmpty()) {
            int count = drawCabinBackground ? 180 : 140;
            for (int i = 0; i < count; i++) {
                flakes.add(spawnFlake(true));
            }
        }
    }

    private Flake spawnFlake(boolean randomY) {
        Flake f = new Flake();
        float depth = rng.nextFloat();
        f.x = rng.nextFloat() * (width + 40) - 20;
        f.y = randomY ? rng.nextFloat() * height : -rng.nextFloat() * 60f - 10f;
        f.r = 2.2f + depth * depth * 6.2f;
        f.vx = (rng.nextFloat() - 0.5f) * 24f;
        f.vy = 55f + f.r * 22f;
        f.alpha = 0.45f + depth * 0.52f;
        f.phase = rng.nextFloat() * 6.28f;
        f.wobbleSpeed = 1.2f + rng.nextFloat() * 1.8f;
        return f;
    }

    public void step(float dt) {
        time += dt;
        float maxDrift = drawCabinBackground ? 46f : 38f;
        float bottomY = height;

        for (int i = 0; i < flakes.size(); i++) {
            Flake f = flakes.get(i);
            f.phase += f.wobbleSpeed * dt;
            f.x += (f.vx + (float) Math.sin(f.phase) * 24f) * dt;
            f.y += f.vy * dt;

            if (f.x < -30) f.x = width + 25;
            if (f.x > width + 30) f.x = -25;

            int bin = (int) (f.x / binWidth);
            if (bin >= 0 && bin < driftHeights.length) {
                float landY = bottomY - driftHeights[bin];
                if (f.y >= landY) {
                    if (driftHeights[bin] < maxDrift) {
                        driftHeights[bin] = Math.min(maxDrift, driftHeights[bin] + f.r * 0.35f);
                    }
                    flakes.set(i, spawnFlake(false));
                    continue;
                }
            }
            if (f.y > height + 20) {
                flakes.set(i, spawnFlake(false));
            }
        }

        // Relax snowdrift slopes
        for (int i = 0; i < driftHeights.length - 1; i++) {
            float diff = driftHeights[i] - driftHeights[i + 1];
            if (diff > 2.2f) {
                float tr = (diff - 2.2f) * 0.25f;
                driftHeights[i] -= tr;
                driftHeights[i + 1] += tr;
            } else if (diff < -2.2f) {
                float tr = (-diff - 2.2f) * 0.25f;
                driftHeights[i + 1] -= tr;
                driftHeights[i] += tr;
            }
        }

        // Update tractor snowplow
        if (!plowActive) {
            plowCooldown -= dt;
            float avg = 0f;
            for (float h : driftHeights) avg += h;
            if (driftHeights.length > 0) avg /= driftHeights.length;
            if (plowCooldown <= 0f && avg > 10f) {
                plowActive = true;
                plowDir = rng.nextBoolean() ? 1f : -1f;
                plowX = plowDir > 0 ? -120f : width + 120f;
            }
        } else {
            plowX += plowDir * 240f * dt;
            float bladeX = plowX + plowDir * 48f;
            int startB = Math.max(0, (int) ((bladeX - 38f) / binWidth));
            int endB = Math.min(driftHeights.length - 1, (int) ((bladeX + 38f) / binWidth));
            for (int b = startB; b <= endB; b++) {
                driftHeights[b] = 0f;
            }
            if ((plowDir > 0 && plowX > width + 140f) || (plowDir < 0 && plowX < -140f)) {
                plowActive = false;
                plowCooldown = 14f;
            }
        }

        if (drawCabinBackground) {
            if (((int) (time * 30)) % 10 == 0 && smoke.size() < 20) {
                Smoke s = new Smoke();
                float cabinX = width * 0.70f;
                float groundY = height * 0.80f;
                s.x = cabinX + 68f;
                s.y = groundY - 196f;
                s.r = 10f;
                s.alpha = 0.45f;
                smoke.add(s);
            }
            for (int i = smoke.size() - 1; i >= 0; i--) {
                Smoke s = smoke.get(i);
                s.y -= 38f * dt;
                s.x += (16f + (float) Math.sin(time * 1.5f + s.y * 0.02f) * 12f) * dt;
                s.r += 11f * dt;
                s.alpha -= 0.08f * dt;
                if (s.alpha <= 0.02f) smoke.remove(i);
            }
        }
    }

    public void draw(Canvas canvas) {
        if (!drawCabinBackground) {
            canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
        } else {
            drawWinterCabinScene(canvas);
        }

        drawSnowdrift(canvas);
        drawFlakes(canvas);
        if (plowActive) {
            drawTractor(canvas);
        }
    }

    private void drawWinterCabinScene(Canvas c) {
        paint.setShader(new LinearGradient(
                0, 0, 0, height,
                new int[]{ Color.rgb(10, 20, 46), Color.rgb(26, 46, 87), Color.rgb(46, 74, 117) },
                new float[]{ 0f, 0.55f, 1f },
                Shader.TileMode.CLAMP
        ));
        c.drawRect(0, 0, width, height, paint);
        paint.setShader(null);

        for (Star s : stars) {
            float a = 0.35f + 0.65f * (0.5f + 0.5f * (float) Math.sin(time * 1.8f + s.phase));
            paint.setColor(Color.argb((int) (a * 255), 240, 247, 255));
            c.drawCircle(s.x * width, s.y * height, s.r, paint);
        }

        float mx = width * 0.22f;
        float my = height * 0.22f;
        paint.setColor(Color.argb(32, 242, 247, 255));
        c.drawCircle(mx, my, 92f, paint);
        paint.setColor(Color.argb(242, 250, 245, 219));
        c.drawCircle(mx, my, 46f, paint);

        // Distant snowy hill
        Path hill = new Path();
        hill.moveTo(0, height);
        hill.lineTo(0, height * 0.72f);
        hill.quadTo(width * 0.28f, height * 0.62f, width * 0.55f, height * 0.75f);
        hill.quadTo(width * 0.80f, height * 0.81f, width, height * 0.70f);
        hill.lineTo(width, height);
        hill.close();
        paint.setColor(Color.rgb(41, 64, 99));
        c.drawPath(hill, paint);

        // Pines
        float[] treeXs = { 0.08f, 0.16f, 0.26f, 0.38f, 0.50f, 0.88f };
        for (int i = 0; i < treeXs.length; i++) {
            float tx = width * treeXs[i];
            float baseY = height * (0.80f - (i % 3) * 0.02f);
            float th = 140f + (i % 3) * 40f;
            drawPine(c, tx, baseY, th);
        }

        // Foreground snow bank
        Path fg = new Path();
        fg.moveTo(0, height);
        fg.lineTo(0, height * 0.80f);
        fg.quadTo(width * 0.5f, height * 0.74f, width, height * 0.79f);
        fg.lineTo(width, height);
        fg.close();
        paint.setColor(Color.rgb(209, 227, 247));
        c.drawPath(fg, paint);

        // Chimney smoke
        for (Smoke s : smoke) {
            paint.setColor(Color.argb((int) (s.alpha * 255), 224, 235, 250));
            c.drawCircle(s.x, s.y, s.r, paint);
        }

        // Cozy cabin
        float ox = width * 0.70f;
        float oy = height * 0.80f;
        paint.setColor(Color.rgb(92, 61, 56));
        c.drawRect(ox + 54, oy - 196, ox + 84, oy - 124, paint);

        paint.setColor(Color.rgb(77, 48, 36));
        c.drawRect(ox - 102, oy - 114, ox + 102, oy, paint);

        float pulse = 0.88f + 0.12f * (float) Math.sin(time * 2.1f);
        paint.setColor(Color.argb((int) (245 * pulse), 255, 209, 102));
        c.drawRect(ox - 72, oy - 82, ox - 24, oy - 36, paint);
        c.drawRect(ox + 24, oy - 82, ox + 72, oy - 36, paint);

        Path roof = new Path();
        roof.moveTo(ox - 128, oy - 108);
        roof.lineTo(ox, oy - 198);
        roof.lineTo(ox + 128, oy - 108);
        roof.close();
        paint.setColor(Color.rgb(235, 245, 255));
        c.drawPath(roof, paint);

        int[] gCols = { Color.rgb(255, 82, 71), Color.rgb(255, 209, 64), Color.rgb(77, 224, 128), Color.rgb(89, 189, 255) };
        for (int i = 0; i < 11; i++) {
            float bx = ox - 110 + i * 22f;
            float by = oy - 106f;
            float br = 0.45f + 0.55f * (0.5f + 0.5f * (float) Math.sin(time * 3.5f - i * 0.6f));
            paint.setColor(gCols[i % gCols.length]);
            paint.setAlpha((int) (br * 255));
            c.drawCircle(bx, by, 5f, paint);
        }
        paint.setAlpha(255);
    }

    private void drawPine(Canvas c, float bx, float by, float h) {
        for (int tier = 0; tier < 3; tier++) {
            float y0 = by - tier * h * 0.26f;
            float y1 = y0 - h * 0.45f;
            float hw = h * 0.28f * (1f - tier * 0.22f);
            Path p = new Path();
            p.moveTo(bx, y1);
            p.lineTo(bx - hw, y0);
            p.lineTo(bx + hw, y0);
            p.close();
            paint.setColor(Color.rgb(23, 46, 61));
            c.drawPath(p, paint);
        }
    }

    private void drawSnowdrift(Canvas c) {
        if (driftHeights.length < 2) return;
        Path p = new Path();
        p.moveTo(0, height);
        for (int b = 0; b < driftHeights.length; b++) {
            float x = (b + 0.5f) * binWidth;
            p.lineTo(x, height - driftHeights[b]);
        }
        p.lineTo(width, height);
        p.close();

        paint.setShader(new LinearGradient(
                0, height - 48f, 0, height,
                Color.WHITE, Color.rgb(198, 218, 245),
                Shader.TileMode.CLAMP
        ));
        c.drawPath(p, paint);
        paint.setShader(null);
    }

    private void drawFlakes(Canvas c) {
        for (Flake f : flakes) {
            paint.setColor(Color.argb((int) (f.alpha * 255), 248, 252, 255));
            c.drawCircle(f.x, f.y, f.r, paint);
        }
    }

    private void drawTractor(Canvas c) {
        c.save();
        c.translate(plowX, height);
        c.scale(plowDir * 1.4f, 1.4f);

        // Cabin & hood
        paint.setColor(Color.rgb(230, 56, 51));
        c.drawRect(-36, -52, -4, -20, paint);
        c.drawRect(-6, -38, 28, -16, paint);
        paint.setColor(Color.rgb(204, 237, 255));
        c.drawRect(-30, -46, -10, -30, paint);

        // Blade
        paint.setColor(Color.rgb(252, 199, 41));
        c.drawRect(28, -28, 48, -2, paint);

        // Wheels
        paint.setColor(Color.rgb(36, 38, 46));
        c.drawCircle(-22, -15, 15, paint);
        c.drawCircle(16, -10, 10, paint);
        paint.setColor(Color.rgb(245, 199, 61));
        c.drawCircle(-22, -15, 8, paint);
        c.drawCircle(16, -10, 5, paint);

        c.restore();
    }
}
