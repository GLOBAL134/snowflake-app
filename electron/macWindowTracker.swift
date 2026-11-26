import Cocoa
import CoreGraphics

let ownPID: pid_t = {
    if CommandLine.arguments.count > 1, let p = Int32(CommandLine.arguments[1]) {
        return p
    }
    return -1
}()

let ignoredOwners: Set<String> = [
    "Dock", "Window Server", "WindowManager", "NotificationCenter",
    "ControlCenter", "SystemUIServer", "Spotlight", "Screenshot",
    "screencaptureui", "Wallpaper", "AutoFill", "TextInputMenuAgent",
    "CursorUIViewService", "UniversalControl", "loginwindow",
    "CoreServicesUIAgent", "Electron"
]

func emitSnapshot() {
    let screens = NSScreen.screens
    guard let primary = screens.first else {
        print("{\"windows\":[],\"docks\":{},\"fullscreen\":[]}")
        fflush(stdout)
        return
    }
    let primaryHeight = primary.frame.height
    let options: CGWindowListOption = [.optionOnScreenOnly]
    let rawList = (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]]) ?? []

    var windowsJson: [[String: Any]] = []
    var dockPillRects: [Int: NSRect] = [:]
    var dockFullWidthRects: [Int: NSRect] = [:]
    var fullscreenScreens = Set<Int>()

    for info in rawList {
        if let onScreen = info[kCGWindowIsOnscreen as String] as? Bool, !onScreen { continue }
        let ownerPID = info[kCGWindowOwnerPID as String] as? pid_t ?? 0
        if ownerPID == ownPID { continue }
        let alpha = info[kCGWindowAlpha as String] as? Double ?? 1.0
        if alpha < 0.15 { continue }
        let layer = info[kCGWindowLayer as String] as? Int ?? 0
        let ownerName = info[kCGWindowOwnerName as String] as? String ?? ""

        guard let boundsDict = info[kCGWindowBounds as String] as? NSDictionary,
              let cgRect = CGRect(dictionaryRepresentation: boundsDict) else {
            continue
        }

        let nsRect = NSRect(
            x: cgRect.origin.x,
            y: primaryHeight - cgRect.origin.y - cgRect.height,
            width: cgRect.width,
            height: cgRect.height
        )

        if ownerName == "Dock" && layer == 20 {
            if nsRect.width >= 100 && nsRect.height >= 32 && nsRect.height <= 175 {
                for (idx, screen) in screens.enumerated() {
                    let sf = screen.frame
                    let sitsAtBottom = nsRect.midX >= sf.minX && nsRect.midX <= sf.maxX &&
                                       nsRect.minY >= sf.minY - 8 && nsRect.minY <= sf.minY + 26 &&
                                       nsRect.maxY > sf.minY + 28
                    if !sitsAtBottom { continue }
                    if nsRect.width < sf.width - 4 {
                        if let existing = dockPillRects[idx] {
                            if nsRect.width > existing.width { dockPillRects[idx] = nsRect }
                        } else {
                            dockPillRects[idx] = nsRect
                        }
                    } else {
                        dockFullWidthRects[idx] = NSRect(
                            x: sf.minX + 16,
                            y: nsRect.minY,
                            width: max(120, sf.width - 32),
                            height: nsRect.height
                        )
                    }
                }
            }
            continue
        }

        if layer != 0 { continue }
        if ignoredOwners.contains(ownerName) { continue }
        if nsRect.width < 140 || nsRect.height < 70 { continue }
        guard let wid = info[kCGWindowNumber as String] as? CGWindowID else { continue }

        for (idx, screen) in screens.enumerated() {
            let sf = screen.frame
            if abs(nsRect.minX - sf.minX) <= 4 &&
               abs(nsRect.minY - sf.minY) <= 4 &&
               nsRect.width >= sf.width - 8 &&
               nsRect.height >= sf.height - 8 {
                fullscreenScreens.insert(idx)
            }
        }

        windowsJson.append([
            "id": String(wid),
            "x": nsRect.origin.x,
            "y": nsRect.origin.y,
            "w": nsRect.width,
            "h": nsRect.height
        ])
    }

    var docksJson: [String: [String: Double]] = [:]
    for (idx, screen) in screens.enumerated() {
        let rect: NSRect?
        if let pill = dockPillRects[idx] {
            rect = pill
        } else if let full = dockFullWidthRects[idx] {
            rect = full
        } else {
            let reserve = screen.visibleFrame.minY - screen.frame.minY
            rect = reserve > 16
                ? NSRect(x: screen.frame.minX + 18, y: screen.frame.minY, width: max(120, screen.frame.width - 36), height: reserve - 2)
                : nil
        }
        if let r = rect {
            docksJson[String(idx)] = ["x": r.origin.x, "y": r.origin.y, "w": r.width, "h": r.height]
        }
    }

    let payload: [String: Any] = [
        "windows": windowsJson,
        "docks": docksJson,
        "fullscreen": Array(fullscreenScreens)
    ]

    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
}

while true {
    autoreleasepool {
        emitSnapshot()
    }
    Thread.sleep(forTimeInterval: 0.05)
}
