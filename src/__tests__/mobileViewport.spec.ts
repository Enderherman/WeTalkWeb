import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('mobile chat viewport sizing', () => {
  it('uses the visual viewport height and removes the desktop minimum height on narrow screens', () => {
    expect(stylesheet).toMatch(/\.chat-shell\s*\{[^}]*height:\s*var\(--wt-chat-visual-viewport-height,\s*100dvh\)/s)
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{\s*\.chat-shell\s*\{[^}]*min-height:\s*0;/s)
  })
})
