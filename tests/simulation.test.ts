import { describe, expect, it } from 'vitest';
import { SnowSimulation } from '../src/core/SnowSimulation';
import { getDefaultSettings } from '../src/core/state';

describe('SnowSimulation', () => {
  it('accumulates snow on bottom and window surfaces and respects occlusion', () => {
    const sim = new SnowSimulation(1200, 800);
    const settings = getDefaultSettings('web');

    sim.syncWindows(
      {
        windows: [
          { id: 'front', rect: { x: 200, y: 200, width: 320, height: 220 } },
          { id: 'back', rect: { x: 180, y: 200, width: 380, height: 220 } }
        ],
        dockRect: { x: 300, y: 0, width: 600, height: 60 }
      },
      true,
      10
    );

    const backSurf = sim.surfaces.get('window:back')!;
    const frontSurf = sim.surfaces.get('window:front')!;
    expect(backSurf).toBeDefined();
    expect(frontSurf).toBeDefined();

    // Center bin of back window is occluded by front window at same topY
    const midBin = backSurf.binIndex(350)!;
    expect(backSurf.occluded[midBin]).toBe(true);
    expect(backSurf.addSnow(350, 5)).toBe(false);

    // Front window center is not occluded and accumulates snow
    expect(frontSurf.addSnow(350, 8)).toBe(true);
    expect(frontSurf.snowStats().peak).toBeGreaterThan(0);

    // Bottom surface behind dock is occluded
    const bottom = sim.surfaces.get('screenBottom')!;
    const dockMidBin = bottom.binIndex(600)!;
    expect(bottom.occluded[dockMidBin]).toBe(true);

    // Step simulation several frames without errors
    for (let i = 0; i < 30; i++) {
      sim.step(1 / 60, settings);
    }
    expect(sim.flakes.length).toBeGreaterThan(0);
  });

  it('brushes snow with mitten and releases loose snow particles', () => {
    const sim = new SnowSimulation(800, 600);
    const bottom = sim.surfaces.get('screenBottom')!;
    for (let x = 200; x <= 300; x += 4) {
      bottom.addSnow(x, 12);
    }
    const before = bottom.snowStats();
    expect(before.peak).toBeGreaterThan(10);

    sim.brushSnowAt(250, 4, 20, 5, 20);
    expect(bottom.snowStats().avg).toBeLessThan(before.avg);
    expect(sim.looseSnow.length).toBeGreaterThan(0);
  });

  it('rolls and stacks a 3-level snowman with face on top', () => {
    const sim = new SnowSimulation(800, 600);
    const settings = getDefaultSettings('web');
    settings.activeTool = 'snowman';

    // Roll and drop 3 snowballs at x=400
    for (let tier = 0; tier < 3; tier++) {
      sim.beginRollingBall({ x: 400, y: 120 });
      sim.continueRollingBall({ x: 460, y: 120 });
      sim.continueRollingBall({ x: 400, y: 120 });
      sim.releaseRollingBall();
      for (let f = 0; f < 90; f++) {
        sim.step(1 / 60, settings);
      }
    }

    expect(sim.snowballs.length).toBe(3);
    const sorted = [...sim.snowballs].sort((a, b) => a.stackLevel - b.stackLevel);
    expect(sorted.map((s) => s.stackLevel)).toEqual([0, 1, 2]);
    expect(sorted[0].hasFace).toBe(false);
    expect(sorted[1].hasFace).toBe(false);
    expect(sorted[2].hasFace).toBe(true);

    sim.clearSnowmen();
    expect(sim.snowballs.length).toBe(0);
  });

  it('sheds snow and sways garland when a window drops rapidly', () => {
    const sim = new SnowSimulation(1000, 800);
    const settings = getDefaultSettings('web');

    sim.syncWindows(
      { windows: [{ id: 'w1', rect: { x: 200, y: 300, width: 320, height: 200 } }] },
      true,
      1.0
    );
    const surf = sim.surfaces.get('window:w1')!;
    for (let x = 230; x <= 490; x += 4) {
      surf.addSnow(x, 12);
    }

    // Move window sharply downward
    for (let i = 1; i <= 5; i++) {
      sim.syncWindows(
        { windows: [{ id: 'w1', rect: { x: 200 + i * 25, y: 300 - i * 18, width: 320, height: 200 } }] },
        true,
        1.0 + i * (1 / 60)
      );
      sim.step(1 / 60, settings);
    }

    expect(sim.looseSnow.length).toBeGreaterThan(0);
    expect(Math.abs(surf.garlandSwayX) + Math.abs(surf.garlandSwayY)).toBeGreaterThan(0);
  });

  it('launches snowplow manually and clears snowdrifts along its path', () => {
    const sim = new SnowSimulation(800, 600);
    const settings = getDefaultSettings('web');
    const bottom = sim.surfaces.get('screenBottom')!;
    for (let x = 100; x <= 700; x += 4) {
      bottom.addSnow(x, 14);
    }
    const initialPeak = bottom.snowStats().peak;
    expect(initialPeak).toBeGreaterThan(10);

    sim.triggerPlowManually(true);
    expect(sim.plow.active).toBe(true);

    // Step until plow traverses screenBottom
    for (let i = 0; i < 420; i++) {
      sim.step(1 / 60, settings);
      if (!sim.plow.active) break;
    }

    expect(bottom.snowStats().avg).toBeLessThan(2);
    sim.clearAllSnow();
    expect(bottom.snowStats().peak).toBe(0);
  });
});
