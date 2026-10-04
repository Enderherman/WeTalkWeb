import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('mobile chat viewport sizing', () => {
  it('bounds the grid row and allows the chat column to shrink around long history', () => {
    expect(stylesheet).toMatch(/\.chat-shell\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s)
    expect(stylesheet).toMatch(/\.chat-main\s*\{[^}]*min-height:\s*0;/s)
    expect(stylesheet).toMatch(/\.conversation-panel\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s)
    expect(stylesheet).toMatch(/\.web-release-notice\s*\{[^}]*max-height:[^;]+;[^}]*overflow-y:\s*auto;/s)
  })

  it('keeps the sidebar beside the chat area on desktop and collapses to one column on mobile', () => {
    expect(stylesheet).toMatch(/\.chat-shell\s*\{[^}]*grid-template-columns:\s*272px\s+minmax\(0,\s*1fr\)/s)
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.chat-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  })

  it('collapses the desktop sidebar while keeping the mobile drawer available', () => {
    expect(stylesheet).toMatch(/@media\s*\(min-width:\s*761px\)\s*\{[\s\S]*?\.chat-shell\.is-sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*76px\s+minmax\(0,\s*1fr\)/s)
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.chat-sidebar\s*\{[^}]*transform:\s*translateX\(-105%\)/s)
    expect(stylesheet).toMatch(/\.chat-shell\.is-sidebar-collapsed\s+\.chat-sidebar\s*\{[^}]*width:\s*76px/)
    expect(stylesheet).toMatch(/\.chat-shell\.is-sidebar-collapsed\s+\.sidebar-brand-name,[\s\S]*?\.chat-shell\.is-sidebar-collapsed\s+\.profile-copy,\s*\.chat-shell\.is-sidebar-collapsed\s+\.sidebar-label\s*\{\s*display:\s*none;/)
    expect(stylesheet).toMatch(/\.chat-shell\.is-sidebar-collapsed\s+\.session-avatar\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/s)
  })

  it('uses the visual viewport height and removes the desktop minimum height on narrow screens', () => {
    expect(stylesheet).toMatch(/\.chat-shell\s*\{[^}]*height:\s*var\(--wt-chat-visual-viewport-height,\s*100dvh\)/s)
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.chat-shell\s*\{[^}]*position:\s*fixed;[^}]*top:\s*var\(--wt-chat-visual-viewport-top,\s*0px\);[^}]*min-height:\s*0;/s)
  })

  it('locks tablet and mobile chat roots to the visual viewport so Safari cannot scroll the page background', () => {
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*1024px\)\s*\{\s*html\.wt-chat-viewport-lock,\s*html\.wt-chat-viewport-lock body,\s*html\.wt-chat-viewport-lock #app\s*\{[^}]*height:\s*var\(--wt-chat-viewport-bottom,\s*100dvh\);[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s)
  })
})
