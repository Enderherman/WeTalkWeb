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

describe('accessibility color contrast', () => {
  it('uses a solid accent outline with at least 3:1 contrast on the web surfaces', () => {
    const accent = stylesheet.match(/--wt-accent:\s*(#[\da-f]{6})/i)?.[1]
    expect(accent).toBeDefined()
    expect(stylesheet).toMatch(/select:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--wt-accent\)/s)
    expect(stylesheet).not.toContain('outline: 2px solid color-mix(in srgb, var(--wt-accent) 22%, transparent)')
    expect(contrastRatio(accent!, '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(accent!, '#f7f7f5')).toBeGreaterThanOrEqual(3)
  })

  it('keeps muted and metadata text tokens above 4.5:1 on white and soft surfaces', () => {
    const muted = stylesheet.match(/--wt-muted:\s*(#[\da-f]{6})/i)?.[1]
    const neutral400 = stylesheet.match(/--wt-neutral-400:\s*(#[\da-f]{6})/i)?.[1]
    expect(muted).toBeDefined()
    expect(neutral400).toBeDefined()

    for (const textColor of [muted!, neutral400!]) {
      expect(contrastRatio(textColor, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(textColor, '#f7f7f5')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('does not reintroduce the previously low-contrast supporting text colors', () => {
    const lowContrastTextColors = [
      '#aaa9a4', '#a1a19c', '#a1a19b', '#a0a09b', '#9a9a95', '#999993',
      '#8b8b85', '#85857f', '#638170', '#777872', '#777772', '#73736e',
    ]
    for (const color of lowContrastTextColors) {
      expect(stylesheet).not.toContain(`color: ${color}`)
    }
  })
})
