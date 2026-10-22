import { app, BrowserWindow, nativeImage, screen } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
const preload = join(__dirname, '../preload/index.js')
export const appIcon = join(app.getAppPath(), 'resources/icon.png')

/** Native frosted glass: macOS vibrancy everywhere, Windows Mica/Acrylic from Windows 11 22H2 (build 22621). */
export const nativeGlass = mac || (process.platform === 'win32' && Number(release().split('.')[2] ?? 0) >= 22621)

function load(win: BrowserWindow, page: 'hub' | 'overlay'): void {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) void win.loadURL(`${dev}/${page}.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

export function createHub(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'Spark',
    icon: appIcon,
    backgroundColor: nativeGlass ? '#00000000' : '#f5f5f5',
    ...(mac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 20, y: 20 }, vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : nativeGlass
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#00000000', symbolColor: '#1d1d1f', height: 44 }, backgroundMaterial: 'mica' as const }
        : {}),
    webPreferences: { preload, sandbox: true, contextIsolation: true },
  })
  win.setMenuBarVisibility(false)
  load(win, 'hub')
  return win
}

/** See-through, click-through window; the bubble inside grows with its content, so one size fits all states. */
const OVERLAY = { width: 420, height: 84 }

export function createOverlay(): BrowserWindow {
  const win = new BrowserWindow({
    ...OVERLAY,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false, // the capsule draws its own
    alwaysOnTop: true,
    ...(mac ? { type: 'panel' as const } : {}),
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true)
  load(win, 'overlay')
  return win
}

/** Bottom-centre of whichever screen the mouse is on, just above the dock/taskbar. */
export function placeOverlay(win: BrowserWindow): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  win.setBounds({
    ...OVERLAY,
    x: Math.round(workArea.x + (workArea.width - OVERLAY.width) / 2),
    y: Math.round(workArea.y + workArea.height - OVERLAY.height - 10),
  })
}

/** Menu bar icon: the logo's five voice bars as dots (9×9 grid, lit dots only), drawn at 32 px for Retina. */
const TRAY_BARS = [3, 0, 5, 0, 7, 0, 5, 0, 3]
export function trayIcon(recording: boolean): Electron.NativeImage {
  const size = 32
  const grid = 9
  const pitch = 30 / grid
  const half = (pitch * 0.78) / 2
  const buf = Buffer.alloc(size * size * 4)
  const [r, g, b] = recording ? [229, 72, 77] : mac ? [0, 0, 0] : [15, 42, 107]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - 1) / pitch)
      const gy = Math.floor((y - 1) / pitch)
      if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) continue
      if (Math.abs(gy - (grid - 1) / 2) > (TRAY_BARS[gx] - 1) / 2) continue
      // Distance to a rounded square dot, for anti-aliased edges.
      const cx = 1 + (gx + 0.5) * pitch
      const cy = 1 + (gy + 0.5) * pitch
      const qx = Math.abs(x + 0.5 - cx) - half + 0.6
      const qy = Math.abs(y + 0.5 - cy) - half + 0.6
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.6
      const a = Math.max(0, Math.min(1, 0.5 - d))
      const i = (y * size + x) * 4
      buf[i] = b
      buf[i + 1] = g
      buf[i + 2] = r
      buf[i + 3] = Math.round(a * 255)
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
  if (mac && !recording) img.setTemplateImage(true)
  return img
}
