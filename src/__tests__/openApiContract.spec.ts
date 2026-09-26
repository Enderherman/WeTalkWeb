import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const contract = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/openapi.web.json'), 'utf8'))

describe('WeTalkWeb OpenAPI contract', () => {
  it('documents the currently integrated account and text-chat endpoints', () => {
    expect(contract.openapi).toBe('3.2.1')
    expect(contract.servers[0].url).toBe('/api')
    expect(Object.keys(contract.paths).sort()).toEqual([
      '/account/checkCode',
      '/account/getUserInfo',
      '/account/login',
      '/account/logout',
      '/account/register',
      '/account/updatePassword',
      '/chat/loadHistory',
      '/chat/sendMessage',
    ])

    const operationIds = Object.values(contract.paths).map((path: any) => path.post.operationId)
    expect(new Set(operationIds).size).toBe(operationIds.length)
  })

  it('marks protected operations with the backend token header', () => {
    const protectedPaths = [
      '/account/getUserInfo',
      '/account/updatePassword',
      '/account/logout',
      '/chat/sendMessage',
      '/chat/loadHistory',
    ]

    for (const path of protectedPaths) {
      expect(contract.paths[path].post.security).toEqual([{ tokenHeader: [] }])
    }
    expect(contract.components.securitySchemes.tokenHeader).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'token',
    })
  })

  it('preserves the current credential and text-history constraints', () => {
    expect(contract.components.schemas.LoginRequest.properties.password.pattern).toBe('^[a-f0-9]{32}$')
    expect(contract.components.schemas.RegisterRequest.properties.password.minLength).toBe(8)
    expect(contract.components.schemas.SendTextMessageRequest.properties.messageContent.maxLength).toBe(500)
    expect(contract.components.schemas.LoadHistoryRequest.properties.pageSize.maximum).toBe(50)
  })

  it('resolves every internal JSON reference', () => {
    const references: string[] = []
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref' && typeof child === 'string') references.push(child)
        else visit(child)
      }
    }
    visit(contract)

    for (const reference of references) {
      expect(reference.startsWith('#/')).toBe(true)
      const target = reference.slice(2).split('/').reduce<unknown>((current, segment) => {
        if (!current || typeof current !== 'object') return undefined
        return (current as Record<string, unknown>)[segment]
      }, contract)
      expect(target, reference).toBeDefined()
    }
  })

  it('models body-level business errors alongside HTTP 200 success responses', () => {
    for (const pathName of Object.keys(contract.paths)) {
      const schema = contract.paths[pathName].post.responses['200'].content['application/json'].schema
      expect(schema.oneOf).toHaveLength(2)
      expect(schema.oneOf[1].$ref).toBe('#/components/schemas/BusinessErrorResponse')
    }
    expect(contract.components.schemas.BusinessErrorResponse.allOf[1].properties.code.enum).toContain(600)
    expect(contract.components.schemas.BusinessErrorResponse.allOf[1].properties.code.enum).toContain(901)
  })
})
