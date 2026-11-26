const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app, screen } = require('electron');

class DesktopWindowTracker {
  constructor(onSnapshots) {
    this.onSnapshots = onSnapshots;
    this.child = null;
    this.fallbackTimer = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;

    if (process.platform === 'darwin') {
      if (this.tryStartMacHelper()) return;
    } else if (process.platform === 'win32') {
      if (this.tryStartWinHelper()) return;
    }

    // Fallback: report Dock/Taskbar from Electron workArea
    this.fallbackTimer = setInterval(() => {
      this.emitFallback();
    }, 250);
    this.emitFallback();
  }

  stop() {
    this.running = false;
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  tryStartMacHelper() {
    try {
      const unpackedDir = __dirname.replace('app.asar', 'app.asar.unpacked');
      const prebuiltBin = path.join(unpackedDir, 'bin', 'snowflake-mac-tracker');
      const swiftSrc = path.join(unpackedDir, 'macWindowTracker.swift');

      let binPath = prebuiltBin;
      if (!fs.existsSync(prebuiltBin)) {
        if (!fs.existsSync(swiftSrc)) return false;
        const binDir = app.getPath('userData');
        binPath = path.join(binDir, 'snowflake-mac-tracker');
        const srcStat = fs.statSync(swiftSrc);
        let needsCompile = !fs.existsSync(binPath);
        if (!needsCompile) {
          const binStat = fs.statSync(binPath);
          if (srcStat.mtimeMs > binStat.mtimeMs) needsCompile = true;
        }
        if (needsCompile) {
          execFileSync('swiftc', [
            '-O',
            swiftSrc,
            '-framework',
            'Cocoa',
            '-framework',
            'CoreGraphics',
            '-o',
            binPath
          ]);
        }
      }

      const child = spawn(binPath, [String(process.pid)], { stdio: ['ignore', 'pipe', 'ignore'] });
      this.child = child;
      this.attachLineReader(child.stdout, (line) => {
        const parsed = JSON.parse(line);
        this.dispatchMacPayload(parsed);
      });
      child.on('exit', () => {
        if (this.running && !this.fallbackTimer) {
          this.fallbackTimer = setInterval(() => this.emitFallback(), 250);
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  tryStartWinHelper() {
    try {
      const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class WinTracker {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

  public static string Snapshot(uint ownPid) {
    var sb = new StringBuilder();
    sb.Append("[");
    bool first = true;
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd) || IsIconic(hWnd)) return true;
      int exStyle = GetWindowLong(hWnd, -20);
      if ((exStyle & 0x00000080) != 0) return true; // WS_EX_TOOLWINDOW
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pid == ownPid) return true;
      int cloaked = 0;
      DwmGetWindowAttribute(hWnd, 14, out cloaked, 4);
      if (cloaked != 0) return true;
      RECT r;
      if (DwmGetWindowAttribute(hWnd, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) {
        if (!GetWindowRect(hWnd, out r)) return true;
      }
      int w = r.Right - r.Left;
      int h = r.Bottom - r.Top;
      if (w < 140 || h < 70) return true;
      if (!first) sb.Append(",");
      first = false;
      sb.Append("{\\"id\\":\\"").Append(hWnd.ToInt64()).Append("\\",\\"x\\":").Append(r.Left)
        .Append(",\\"y\\":").Append(r.Top).Append(",\\"w\\":").Append(w).Append(",\\"h\\":").Append(h).Append("}");
      return true;
    }, IntPtr.Zero);
    sb.Append("]");
    return sb.ToString();
  }
}
"@
while ($true) {
  Write-Output ([WinTracker]::Snapshot(${process.pid}))
  Start-Sleep -Milliseconds 65
}
`;
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      );
      this.child = child;
      this.attachLineReader(child.stdout, (line) => {
        const rawWins = JSON.parse(line);
        this.dispatchWinPayload(rawWins);
      });
      child.on('exit', () => {
        if (this.running && !this.fallbackTimer) {
          this.fallbackTimer = setInterval(() => this.emitFallback(), 250);
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  attachLineReader(stream, onLine) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          onLine(line);
        } catch {
          // ignore malformed partial line
        }
      }
    });
  }

  dispatchMacPayload(parsed) {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const primaryH = primary.bounds.height;
    const perScreen = new Map();

    displays.forEach((disp, idx) => {
      // Convert Electron top-left display bounds to Cocoa bottom-left space
      const dispBottomY = primaryH - disp.bounds.y - disp.bounds.height;
      const dispX = disp.bounds.x;
      const windows = [];

      for (const w of parsed.windows || []) {
        const local = {
          x: w.x - dispX,
          y: w.y - dispBottomY,
          width: w.w,
          height: w.h
        };
        if (
          local.x + local.width <= 0 ||
          local.x >= disp.bounds.width ||
          local.y + local.height <= 0 ||
          local.y >= disp.bounds.height
        ) {
          continue;
        }
        windows.push({ id: String(w.id), rect: local });
      }

      let dockRect;
      const rawDock = parsed.docks && parsed.docks[String(idx)];
      if (rawDock) {
        dockRect = {
          x: rawDock.x - dispX,
          y: rawDock.y - dispBottomY,
          width: rawDock.w,
          height: rawDock.h
        };
      }

      const isFullscreen = Array.isArray(parsed.fullscreen) && parsed.fullscreen.includes(idx);
      perScreen.set(idx, { windows, dockRect, isFullscreen });
    });

    this.onSnapshots(perScreen);
  }

  dispatchWinPayload(rawWins) {
    const displays = screen.getAllDisplays();
    const perScreen = new Map();

    displays.forEach((disp, idx) => {
      const b = disp.bounds;
      const wa = disp.workArea;
      const windows = [];
      let isFullscreen = false;

      for (const w of rawWins) {
        // Convert top-left screen coords to bottom-left local display coords
        const localX = w.x - b.x;
        const topFromDispTop = w.y - b.y;
        const localBottomY = b.height - (topFromDispTop + w.h);

        if (
          localX + w.w <= 0 ||
          localX >= b.width ||
          localBottomY + w.h <= 0 ||
          localBottomY >= b.height
        ) {
          continue;
        }

        if (
          Math.abs(localX) <= 4 &&
          Math.abs(localBottomY) <= 4 &&
          w.w >= b.width - 8 &&
          w.h >= b.height - 8
        ) {
          isFullscreen = true;
        }

        windows.push({
          id: String(w.id),
          rect: { x: localX, y: localBottomY, width: w.w, height: w.h }
        });
      }

      const bottomReserve = (b.y + b.height) - (wa.y + wa.height);
      const dockRect =
        bottomReserve > 16
          ? {
              x: 16,
              y: 0,
              width: Math.max(120, b.width - 32),
              height: bottomReserve - 1
            }
          : undefined;

      perScreen.set(idx, { windows, dockRect, isFullscreen });
    });

    this.onSnapshots(perScreen);
  }

  emitFallback() {
    const displays = screen.getAllDisplays();
    const perScreen = new Map();
    displays.forEach((disp, idx) => {
      const b = disp.bounds;
      const wa = disp.workArea;
      const bottomReserve = (b.y + b.height) - (wa.y + wa.height);
      const dockRect =
        bottomReserve > 16
          ? {
              x: 18,
              y: 0,
              width: Math.max(120, b.width - 36),
              height: bottomReserve - 2
            }
          : undefined;
      perScreen.set(idx, { windows: [], dockRect, isFullscreen: false });
    });
    this.onSnapshots(perScreen);
  }
}

module.exports = { DesktopWindowTracker };
