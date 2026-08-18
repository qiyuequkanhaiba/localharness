import { describe, expect, it } from 'vitest'
import { dialogButtonIndex, isAcceptedDialogButton } from './dialog-response'

describe('dialogButtonIndex', () => {
  it('keeps Electron 0-based indexes', () => {
    expect(dialogButtonIndex(0)).toBe(0)
    expect(dialogButtonIndex(1)).toBe(1)
  })

  it('maps macOS NSAlert first-button codes back onto the buttons array', () => {
    expect(dialogButtonIndex(1000)).toBe(0)
    expect(dialogButtonIndex(1001)).toBe(1)
    expect(dialogButtonIndex(1002)).toBe(2)
  })

  it('treats Install as accepted for both encodings', () => {
    expect(isAcceptedDialogButton(0)).toBe(true)
    expect(isAcceptedDialogButton(1000)).toBe(true)
    expect(isAcceptedDialogButton(1)).toBe(false)
    expect(isAcceptedDialogButton(1001)).toBe(false)
  })
})
