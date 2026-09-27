import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

function relativeLuminance(hexColor: string): number {
  const color = hexColor.replace('#', '')
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05)
}

describe('keyboard focus indicator contrast', () => {
  it('uses a solid accent outline with at least 3:1 contrast on the web surfaces', () => {
    const accent = stylesheet.match(/--wt-accent:\s*(#[\da-f]{6})/i)?.[1]
    expect(accent).toBeDefined()
    expect(stylesheet).toMatch(/select:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--wt-accent\)/s)
    expect(stylesheet).not.toContain('outline: 2px solid color-mix(in srgb, var(--wt-accent) 22%, transparent)')
    expect(contrastRatio(accent!, '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(accent!, '#f7f7f5')).toBeGreaterThanOrEqual(3)
  })
})
