import { clipboard, ClipboardItem, systemPreferences } from 'electron'
import { startHook, tapPaste, waitForModifiersReleased } from './keys'

export const canAutoPaste = (): boolean => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false)

/** Copies everything on the clipboard (text, rich text, images…) into items that can be written back later. */
export async function snapshotClipboard(): Promise<ClipboardItem[]> {
  try {
    const items = await clipboard.read()
    return await Promise.all(
      items.map(async (item) => {
        const data: Record<string, Blob | Electron.ClipboardBookmark> = {}
        for (const type of item.types) data[type] = await item.getType(type)
        return new ClipboardItem(data)
      }),
    )
  } catch {
    return []
  }
}

/**
 * Puts text where the user's cursor is: copy, simulate the paste shortcut, then put
 * back whatever was on the clipboard before (`before`, snapshotted ahead of time so it
 * doesn't delay the paste; null to leave the text on the clipboard). Without paste
 * permission the text stays on the clipboard so nothing is lost.
 */
export async function insertText(text: string, before: Promise<ClipboardItem[]> | null): Promise<'paste' | 'clipboard'> {
  const restoreClipboard = before !== null
  const saved = before ? await before : []
  await clipboard.writeText(text)
  if (!canAutoPaste()) return 'clipboard'

  await startHook()
  await waitForModifiersReleased()
  if (!(await tapPaste())) return 'clipboard'

  if (restoreClipboard) {
    setTimeout(async () => {
      try {
        if ((await clipboard.readText()) !== text) return // user copied something new meanwhile
        if (saved.length) await clipboard.write(saved)
        else clipboard.clear()
      } catch (e) {
        console.error('[spark] could not restore the clipboard:', e)
      }
    }, 500)
  }
  return 'paste'
}
