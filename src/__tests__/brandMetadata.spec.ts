import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WeTalk browser branding', () => {
  it('uses the WeTalkApp icon and the shared WeTalk product name', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('<link rel="icon" type="image/png" href="/wetalk-app-icon.png">')
    expect(html).toContain('<title>WeTalk</title>')
    expect(html).not.toContain('<title>WeTalk Web</title>')
    expect(existsSync(resolve(process.cwd(), 'public/wetalk-app-icon.png'))).toBe(true)
  })
})
