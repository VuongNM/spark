// Reports the Fn/Globe key to Spark over stdout, one event per line:
//   ready | down | up | chord <keycode> | error <reason>
// Listen-only: it never blocks or changes keystrokes. Exits when Spark closes stdin.
import Cocoa

setvbuf(stdout, nil, _IOLBF, 0)

let kVKFunction: Int64 = 63
var fnDown = false
var tap: CFMachPort?

func emit(_ line: String) {
    print(line)
}

let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
        return Unmanaged.passUnretained(event)
    }
    let keycode = event.getIntegerValueField(.keyboardEventKeycode)
    if type == .flagsChanged {
        if keycode == kVKFunction {
            let pressed = event.flags.contains(.maskSecondaryFn)
            if pressed && !fnDown {
                fnDown = true
                emit("down")
            } else if !pressed && fnDown {
                fnDown = false
                emit("up")
            }
        } else if fnDown {
            emit("chord \(keycode)")
        }
    } else if type == .keyDown && fnDown {
        emit("chord \(keycode)")
    }
    return Unmanaged.passUnretained(event)
}

let mask = CGEventMask((1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue))
guard let created = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: callback, userInfo: nil) else {
    emit("error permission")
    exit(1)
}
tap = created
CFRunLoopAddSource(CFRunLoopGetCurrent(), CFMachPortCreateRunLoopSource(kCFAllocatorDefault, created, 0), .commonModes)
CGEvent.tapEnable(tap: created, enable: true)

DispatchQueue.global(qos: .utility).async {
    while readLine() != nil {}
    exit(0)
}

emit("ready")
CFRunLoopRun()
