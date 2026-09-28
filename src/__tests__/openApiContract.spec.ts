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
      '/account/listSessions',
      '/account/login',
      '/account/logout',
      '/account/register',
      '/account/registerEmailCode',
      '/account/revokeOtherSessions',
      '/account/revokeSession',
      '/account/saveUserInfo',
      '/account/updatePassword',
      '/account/webLogin',
      '/account/webSocketTicket',
      '/admin/dissolutionGroup',
      '/admin/forcedOffOnline',
      '/admin/getSystemSetting',
      '/admin/loadGroup',
      '/admin/loadUser',
      '/admin/saveSystemSetting',
      '/admin/updateUserStatus',
      '/app/checkUpdate',
      '/app/deleteUpdate',
      '/app/downloadUpdate',
      '/app/loadUpdateList',
      '/app/postUpdate',
      '/app/saveUpdate',
      '/chat/cancelAiMessage',
      '/chat/downloadFile',
      '/chat/loadHistory',
      '/chat/markRead',
      '/chat/sendMessage',
      '/chat/streamMedia',
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
      '/contact/searchByKeyword',
      '/group/addOrRemoveGroupUser',
      '/group/dissolutionGroup',
      '/group/getGroupInfo',
      '/group/getGroupInfo4Chat',
      '/group/leaveGroup',
      '/group/loadMyGroup',
      '/group/saveGroup',
      '/userInfoBeauty/deleteBeautyAccount',
      '/userInfoBeauty/loadBeautyAccountList',
      '/userInfoBeauty/saveBeautyAccount',
    ])

    const operationIds = Object.values(contract.paths).flatMap((path: any) =>
      ['get', 'post'].filter((method) => path[method]).map((method) => path[method].operationId),
    )
    expect(new Set(operationIds).size).toBe(operationIds.length)
    expect(contract.components.responses.BusinessError.description).toContain('429')
    expect(contract.components.responses.BusinessError.headers['X-Request-Id'].schema.format).toBe('uuid')
  })

  it('marks protected operations with the backend token header', () => {
    const protectedPaths = [
      '/account/getUserInfo',
      '/account/getSysSetting',
      '/account/saveUserInfo',
      '/account/updatePassword',
      '/account/logout',
      '/account/webSocketTicket',
      '/account/listSessions',
      '/account/revokeSession',
      '/account/revokeOtherSessions',
      '/chat/sendMessage',
      '/chat/markRead',
      '/chat/loadHistory',
      '/contact/search',
      '/contact/searchByKeyword',
      '/contact/applyAdd',
      '/contact/loadApply',
      '/contact/dealWithApply',
      '/contact/loadContact',
      '/contact/getContactInfo',
      '/contact/getContactUserInfo',
      '/contact/delContact',
      '/contact/addContact2BlackList',
      '/admin/loadUser',
      '/admin/updateUserStatus',
      '/admin/forcedOffOnline',
      '/admin/loadGroup',
      '/admin/dissolutionGroup',
      '/admin/getSystemSetting',
      '/admin/saveSystemSetting',
      '/userInfoBeauty/loadBeautyAccountList',
      '/userInfoBeauty/saveBeautyAccount',
      '/userInfoBeauty/deleteBeautyAccount',
      '/app/loadUpdateList',
      '/app/saveUpdate',
      '/app/deleteUpdate',
      '/app/downloadUpdate',
      '/app/postUpdate',
      '/app/checkUpdate',
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
      expect(contract.paths[path].post.security).toEqual([{ tokenHeader: [] }, { cookieSession: [] }])
    }
    expect(contract.paths['/chat/streamMedia'].get.security).toEqual([{ tokenHeader: [] }, { cookieSession: [] }])
    expect(contract.components.securitySchemes.tokenHeader).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'token',
    })
    expect(contract.components.securitySchemes.cookieSession).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'wetalk_session',
    })
  })

  it('documents request-throttling as a business error response', () => {
    expect(contract.components.responses.BusinessError.description).toContain('429')
  })

  it('preserves the current credential and text-history constraints', () => {
    expect(contract.components.schemas.LoginRequest.properties.password.pattern).toBe('^[a-f0-9]{32}$')
    expect(contract.components.schemas.RegisterRequest.properties.password.minLength).toBe(8)
    expect(contract.components.schemas.RegisterRequest.required).toEqual(['email', 'password', 'nickName', 'emailCode'])
    expect(contract.components.schemas.RegistrationEmailCodeRequest.required).toEqual(['email', 'checkCodeKey', 'checkCode'])
    expect(contract.paths['/account/register'].post.description).toContain('valid six-digit email code')
    expect(contract.components.schemas.SendChatMessageRequest.properties.messageContent.maxLength).toBe(500)
    expect(contract.components.schemas.SendChatMessageRequest.properties.messageType.enum).toEqual([2, 5])
    expect(contract.components.schemas.SendChatMessageRequest.properties.clientMessageId).toMatchObject({
      type: 'string',
      format: 'uuid',
      maxLength: 36,
    })
    expect(contract.components.schemas.MarkReadRequest.required).toEqual(['contactId', 'messageId'])
    expect(contract.components.schemas.MarkReadRequest.properties.messageId.minimum).toBe(1)
    expect(contract.components.schemas.SendChatMessageRequest.properties.fileType.enum).toEqual([0, 1, 2])
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
      if (pathName === '/chat/downloadFile' || pathName === '/app/downloadUpdate') {
        expect(contract.paths[pathName].post.responses['200'].content['application/octet-stream'].schema.format).toBe(
          'binary',
        )
        continue
      }
      if (pathName === '/chat/streamMedia') {
        expect(contract.paths[pathName].get.responses['200'].content['video/*'].schema.format).toBe('binary')
        expect(contract.paths[pathName].get.responses['200'].content['audio/*'].schema.format).toBe('binary')
        expect(contract.paths[pathName].get.responses['206'].content['video/*'].schema.format).toBe('binary')
        expect(contract.paths[pathName].get.responses['206'].content['audio/*'].schema.format).toBe('binary')
        continue
      }
      let response = contract.paths[pathName].post.responses['200']
      if (response.$ref) {
        response = contract.components.responses[response.$ref.split('/').at(-1)!]
      }
      const schema = response.content['application/json'].schema
      expect(schema.oneOf).toHaveLength(pathName === '/app/checkUpdate' ? 3 : 2)
      expect(schema.oneOf.some((entry: { $ref?: string }) => entry.$ref === '#/components/schemas/BusinessErrorResponse')).toBe(true)
    }
    expect(contract.components.schemas.BusinessErrorResponse.allOf[1].properties.code.enum).toContain(600)
    expect(contract.components.schemas.BusinessErrorResponse.allOf[1].properties.code.enum).toContain(901)
  })

  it('documents contact relationship types and allowed application responses', () => {
    expect(contract.components.schemas.ContactApplication.properties.status.enum).toEqual([0, 1, 2, 3])
    expect(contract.components.schemas.ContactSearchResult.properties.contactType.enum).toEqual(['USER', 'GROUP'])
    expect(contract.components.schemas.ContactSearchResult.properties.status.type).toEqual(['integer', 'null'])
    expect(contract.components.schemas.ContactSearchResult.properties.status.enum).toContain(null)
    expect(contract.components.schemas.IntegerDataResponse.allOf[1].properties.data.type).toEqual(['integer', 'null'])
    expect(
      contract.paths['/contact/applyAdd'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.applyInfo.maxLength,
    ).toBe(100)
    expect(
      contract.paths['/contact/loadContact'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.contactType.enum,
    ).toEqual(['0', '1'])
    expect(
      contract.paths['/contact/dealWithApply'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.status.enum,
    ).toEqual([1, 2, 3])
  })

  it('documents group operations and multipart file exchanges', () => {
    expect(contract.components.schemas.GroupInfo.properties.joinType.enum).toEqual([0, 1])
    expect(contract.components.schemas.GroupInfo.properties.memberCount.type).toEqual(['integer', 'null'])
    expect(contract.components.schemas.SaveGroupRequest.properties.groupName.maxLength).toBe(32)
    expect(contract.components.schemas.SaveGroupRequest.properties.groupNotice.maxLength).toBe(500)
    expect(contract.components.schemas.SaveGroupRequest.properties.avatarFile.format).toBe('binary')
    expect(
      contract.paths['/group/saveGroup'].post.requestBody.content['multipart/form-data'].schema.$ref,
    ).toBe('#/components/schemas/SaveGroupRequest')
    expect(contract.components.schemas.SaveGroupRequest.required).toEqual(['groupName', 'joinType'])
    expect(
      contract.paths['/chat/uploadFile'].post.requestBody.content['multipart/form-data'].schema.$ref,
    ).toBe('#/components/schemas/UploadChatFileRequest')
    expect(contract.components.schemas.UploadChatFileRequest.required).toEqual(['messageId', 'file'])
    expect(contract.paths['/chat/uploadFile'].post.responses['200'].content['application/json'].schema.oneOf[0].$ref).toBe(
      '#/components/schemas/StringDataResponse',
    )
    expect(contract.components.schemas.UploadChatFileRequest.properties.cover).toMatchObject({
      format: 'binary',
      description: 'Optional cover or thumbnail image.',
    })
    expect(contract.paths['/chat/downloadFile'].post.responses['200'].content['application/octet-stream'].schema.format).toBe(
      'binary',
    )
  })

  it('documents AI cancellation and persisted terminal statuses', () => {
    expect(contract.paths['/chat/cancelAiMessage'].post.security).toEqual([
      { tokenHeader: [] }, { cookieSession: [] },
    ])
    expect(contract.paths['/chat/cancelAiMessage'].post.requestBody.content['application/x-www-form-urlencoded'].schema.$ref)
      .toBe('#/components/schemas/CancelAiMessageRequest')
    expect(contract.components.schemas.CancelAiMessageRequest.properties.messageId.minimum).toBe(1)
    expect(contract.components.schemas.ChatMessage.properties.status.enum).toEqual([0, 1, 2, 3])
    expect(contract.components.schemas.MessageSendDTO.properties.status.enum).toEqual([0, 1, 2, 3])
  })

  it('documents account settings and profile-save fields without secrets', () => {
    expect(contract.components.schemas.SystemSettings.properties).toHaveProperty('maxGroupCount')
    expect(contract.components.schemas.SystemSettings.properties).toHaveProperty('robotWelcome')
    expect(contract.components.schemas.SaveUserInfoRequest.properties.avatarFile.format).toBe('binary')
    expect(contract.components.schemas.SaveUserInfoRequest.properties.coverFile.format).toBe('binary')
    expect(contract.paths['/account/saveUserInfo'].post.description).toContain('coverFile is an optional thumbnail')
    expect(contract.components.schemas.SaveUserInfoRequest.properties).not.toHaveProperty('password')
    expect(contract.components.schemas.SaveUserInfoRequest.properties).not.toHaveProperty('email')
  })

  it('keeps administrative user payloads password-free and documents role limits', () => {
    expect(contract.components.schemas.AdminUserInfo.properties).not.toHaveProperty('password')
    expect(contract.components.schemas.AdminUserInfo.description).toContain('write-only')
    expect(contract.components.schemas.AdminUserQuery.properties).not.toHaveProperty('password')
    expect(contract.components.schemas.PostAppUpdateRequest.properties.status.enum).toEqual([0, 1, 2])
    expect(contract.paths['/app/checkUpdate'].post.description).toContain('not the admin role')
    expect(contract.paths['/app/checkUpdate'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.uid.deprecated).toBe(true)
    expect(
      contract.paths['/app/downloadUpdate'].post.requestBody.content['application/x-www-form-urlencoded'].schema.properties.id.minimum,
    ).toBe(1)
    expect(contract.components.schemas.WebAuthSession.properties).not.toHaveProperty('token')
    expect(contract.paths['/account/webLogin'].post.responses['200'].headers['Set-Cookie'].description).toContain('HttpOnly')
    expect(contract.paths['/account/webSocketTicket'].post.description).toContain('60 seconds')
  })

  it('documents exact email and fuzzy contact nickname search', () => {
    const operation = contract.paths['/contact/searchByKeyword'].post
    const requestSchema = operation.requestBody.content['application/x-www-form-urlencoded'].schema
    const responseSchema = operation.responses['200'].content['application/json'].schema.oneOf[0]

    expect(operation.description).toContain('email addresses exactly')
    expect(requestSchema.required).toEqual(['keyword'])
    expect(requestSchema.properties.keyword.maxLength).toBe(254)
    expect(responseSchema.$ref).toBe('#/components/schemas/ContactSearchListResponse')
    expect(contract.components.schemas.ContactSearchListResponse.allOf[1].properties.data.maxItems).toBe(20)
    expect(contract.paths['/contact/search'].post.description).toContain('email address')
  })

  it('documents multi-device sessions without exposing authentication credentials', () => {
    expect(contract.components.schemas.UserSession.properties).toMatchObject({
      sessionId: { type: 'string', format: 'uuid' },
      deviceName: { type: 'string' },
      deviceType: { type: 'string', enum: ['desktop', 'browser'], nullable: true },
      createdAt: { type: 'integer', format: 'int64' },
      lastActiveAt: { type: 'integer', format: 'int64' },
      current: { type: 'boolean' },
    })
    expect(contract.components.schemas.UserSession.properties).not.toHaveProperty('token')
    expect(contract.components.schemas.UserSession.properties).not.toHaveProperty('cookie')
    expect(contract.components.schemas.UserSession.properties).not.toHaveProperty('userAgent')
    expect(contract.paths['/account/login'].post.description).toContain('replaces the previous desktop-client session')
    expect(contract.paths['/account/webLogin'].post.description).toContain('replaces the previous browser session')
    expect(contract.paths['/chat/markRead'].post.description).toContain('WebSocket message type 17')
    expect(contract.paths['/account/revokeOtherSessions'].post.description).toContain('Keeps the calling session active')
    expect(
      contract.paths['/account/revokeSession'].post.requestBody.content['application/x-www-form-urlencoded'].schema.required,
    ).toEqual(['sessionId'])
  })
})
