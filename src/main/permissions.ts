import { shell, systemPreferences } from 'electron'
import type { PermissionState } from '../shared/types'

const mac = process.platform === 'darwin'

export function micStatus(): PermissionState {
  if (!mac && process.platform !== 'win32') return 'unsupported'
  const s = systemPreferences.getMediaAccessStatus('microphone')
  if (s === 'granted') return 'granted'
  if (s === 'not-determined') return 'not-determined'
  return 'denied'
}

export async function requestMic(): Promise<PermissionState> {
  if (mac && micStatus() === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone')
  } else if (micStatus() === 'denied') {
    openMicSettings()
  }
  return micStatus()
}

export function openMicSettings(): void {
  void shell.openExternal(mac ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone' : 'ms-settings:privacy-microphone')
}

export function accessibilityStatus(): PermissionState {
  if (!mac) return 'unsupported'
  return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'
}

export function requestAccessibility(): PermissionState {
  if (!mac) return 'unsupported'
  if (!systemPreferences.isTrustedAccessibilityClient(true)) {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
  return accessibilityStatus()
}
