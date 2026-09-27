import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8')

function locationBlock(marker: string): string {
  const start = config.indexOf(marker)
  if (start < 0) return ''
  const end = config.indexOf('\n    }', start)
  return end < 0 ? '' : config.slice(start, end)
}

const securityHeaders = [
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  'add_header X-Frame-Options "DENY" always;',
]

describe('NAS Nginx response headers', () => {
  it.each(['location = /index.html {', 'location /assets/ {'])(
    'keeps security headers when %s overrides Cache-Control',
    (marker) => {
      const block = locationBlock(marker)
      expect(block).not.toBe('')
      for (const header of securityHeaders) expect(block).toContain(header)
    },
  )

  it('keeps HTML uncached and fingerprints assets for immutable caching', () => {
    expect(locationBlock('location = /index.html {')).toContain('add_header Cache-Control "no-cache" always;')
    expect(locationBlock('location /assets/ {')).toContain(
      'add_header Cache-Control "public, max-age=31536000, immutable";',
    )
  })
})
