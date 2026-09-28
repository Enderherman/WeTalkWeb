import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('mobile chat viewport sizing', () => {
  it('keeps the sidebar beside the chat area on desktop and collapses to one column on mobile', () => {
    expect(stylesheet).toMatch(/\.chat-shell\s*\{[^}]*grid-template-columns:\s*272px\s+minmax\(0,\s*1fr\)/s)
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.chat-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  })

  it('uses the visual viewport height and removes the desktop minimum height on narrow screens', () => {
    expect(stylesheet).toMatch(/\.chat-shell\s*\{[^}]*height:\s*var\(--wt-chat-visual-viewport-height,\s*100dvh\)/s)
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{\s*\.chat-shell\s*\{[^}]*position:\s*fixed;[^}]*top:\s*var\(--wt-chat-visual-viewport-top,\s*0px\);[^}]*min-height:\s*0;/s)
  })
})
