import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const contract = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/openapi.web.json'), 'utf8'))

describe('WeTalkWeb OpenAPI contract', () => {
  it('documents the currently integrated account, contact, and text-chat endpoints', () => {
    expect(contract.openapi).toBe('3.2.1')
    expect(contract.servers[0].url).toBe('/api')
    expect(Object.keys(contract.paths).sort()).toEqual([
      '/account/checkCode',
      '/account/getSysSetting',
      '/account/getUserInfo',
      '/account/login',
      '/account/logout',
      '/account/register',
      '/account/saveUserInfo',
      '/account/updatePassword',
      '/chat/downloadFile',
      '/chat/loadHistory',
      '/chat/sendMessage',
      '/chat/uploadFile',
      '/contact/addContact2BlackList',
      '/contact/applyAdd',
      '/contact/dealWithApply',
      '/contact/delContact',
      '/contact/getContactInfo',
      '/contact/getContactUserInfo',
      '/contact/loadApply',
      '/contact/loadContact',
      '/contact/search',
      '/group/addOrRemoveGroupUser',
      '/group/dissolutionGroup',
      '/group/getGroupInfo',
      '/group/getGroupInfo4Chat',
      '/group/leaveGroup',
      '/group/loadMyGroup',
      '/group/saveGroup',
    ])

    const operationIds = Object.values(contract.paths).map((path: any) => path.post.operationId)
    expect(new Set(operationIds).size).toBe(operationIds.length)
  })

  it('marks protected operations with the backend token header', () => {
    const protectedPaths = [
      '/account/getUserInfo',
      '/account/getSysSetting',
      '/account/saveUserInfo',
      '/account/updatePassword',
      '/account/logout',
      '/chat/sendMessage',
      '/chat/loadHistory',
      '/contact/search',
      '/contact/applyAdd',
      '/contact/loadApply',
      '/contact/dealWithApply',
      '/contact/loadContact',
      '/contact/getContactInfo',
      '/contact/getContactUserInfo',
      '/contact/delContact',
      '/contact/addContact2BlackList',
      '/group/saveGroup',
      '/group/loadMyGroup',
      '/group/getGroupInfo',
      '/group/getGroupInfo4Chat',
      '/group/leaveGroup',
      '/group/addOrRemoveGroupUser',
      '/group/dissolutionGroup',
      '/chat/uploadFile',
      '/chat/downloadFile',
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
      if (pathName === '/chat/downloadFile') {
        expect(contract.paths[pathName].post.responses['200'].content['application/x-msdownload'].schema.format).toBe(
          'binary',
        )
        continue
      }
      const schema = contract.paths[pathName].post.responses['200'].content['application/json'].schema
      expect(schema.oneOf).toHaveLength(2)
      expect(schema.oneOf[1].$ref).toBe('#/components/schemas/BusinessErrorResponse')
    }
    expect(contract.components.schemas.BusinessErrorResponse.allOf[1].properties.code.enum).toContain(600)
    expect(contract.components.schemas.BusinessErrorResponse.allOf[1].properties.code.enum).toContain(901)
  })

  it('documents contact relationship types and allowed application responses', () => {
    expect(contract.components.schemas.ContactApplication.properties.status.enum).toEqual([0, 1, 2, 3])
    expect(
      contract.paths['/contact/loadContact'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.contactType.enum,
    ).toEqual(['0', '1'])
    expect(
      contract.paths['/contact/dealWithApply'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.status.enum,
    ).toEqual([1, 2, 3])
  })

  it('documents group operations and multipart file exchanges', () => {
    expect(contract.components.schemas.GroupInfo.properties.joinType.enum).toEqual([0, 1])
    expect(contract.components.schemas.SaveGroupRequest.properties.avatarFile.format).toBe('binary')
    expect(
      contract.paths['/group/saveGroup'].post.requestBody.content['multipart/form-data'].schema.$ref,
    ).toBe('#/components/schemas/SaveGroupRequest')
    expect(contract.components.schemas.SaveGroupRequest.required).toEqual(['groupName', 'joinType'])
    expect(
      contract.paths['/chat/uploadFile'].post.requestBody.content['multipart/form-data'].schema.$ref,
    ).toBe('#/components/schemas/UploadChatFileRequest')
    expect(contract.components.schemas.UploadChatFileRequest.required).toEqual(['messageId', 'file', 'cover'])
    expect(contract.paths['/chat/downloadFile'].post.responses['200'].content['application/x-msdownload'].schema.format).toBe(
      'binary',
    )
  })

  it('documents account settings and profile-save fields without secrets', () => {
    expect(contract.components.schemas.SystemSettings.properties).toHaveProperty('maxGroupCount')
    expect(contract.components.schemas.SystemSettings.properties).toHaveProperty('robotWelcome')
    expect(contract.components.schemas.SaveUserInfoRequest.properties.avatarFile.format).toBe('binary')
    expect(contract.components.schemas.SaveUserInfoRequest.properties.coverFile.format).toBe('binary')
    expect(contract.components.schemas.SaveUserInfoRequest.properties).not.toHaveProperty('password')
    expect(contract.components.schemas.SaveUserInfoRequest.properties).not.toHaveProperty('email')
  })
})
