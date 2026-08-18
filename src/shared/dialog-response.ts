/**
 * macOS NSAlert returns 1000 for the first button (NSAlertFirstButtonReturn).
 * Electron documents 0-based `buttons` indexes. When the native code does not
 * remap the tag, Install (index 0) arrives as 1000 and is treated as Cancel.
 */
export const NS_ALERT_FIRST_BUTTON_RETURN = 1000

export function dialogButtonIndex(response: number): number {
  if (!Number.isFinite(response)) return -1
  const n = Math.trunc(response)
  if (n >= NS_ALERT_FIRST_BUTTON_RETURN) return n - NS_ALERT_FIRST_BUTTON_RETURN
  return n
}

export function isAcceptedDialogButton(response: number, acceptId = 0): boolean {
  return dialogButtonIndex(response) === acceptId
}
