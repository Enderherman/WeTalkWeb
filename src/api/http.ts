import axios, { type AxiosProgressEvent, type AxiosRequestConfig } from 'axios'
import { captureAuthRequestContext, isCurrentAuthRequest, readStoredSession, type AuthRequestContext } from '@/stores/auth'
import { notifyApiUnavailable } from '@/utils/apiEvents'
import { notifySessionExpired } from '@/utils/authEvents'
import { isPageLeaving } from '@/utils/pageNavigationLifecycle'

export interface BaseResponse<T> {
  status: string
  code: number
  message?: string
  data: T
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class StaleSessionResponseError extends Error {
  readonly __CANCEL__ = true
  readonly code = 'ERR_CANCELED'
  constructor() {
    super('请求所属登录会话已变化')
    this.name = 'CanceledError'
  }
}

type ScopedRequestConfig = AxiosRequestConfig & { wetalkSession: AuthRequestContext }

function assertCurrentSession(context: AuthRequestContext) {
  if (!isCurrentAuthRequest(context)) throw new StaleSessionResponseError()
}

export interface ApiFailureOptions {
  availability?: 'global' | 'local'
}

function announceAvailability(options: ApiFailureOptions): boolean {
  return options.availability !== 'local' && (typeof navigator === 'undefined' || navigator.onLine !== false)
}

export function unwrapResponse<T>(response: BaseResponse<T>, options: ApiFailureOptions = {}): T {
  if (response.code !== 200) {
    if (!isPageLeaving()) {
      if (response.code === 901) notifySessionExpired()
      else if (response.code >= 500 && response.code < 600 && announceAvailability(options)) notifyApiUnavailable()
    }
    throw new ApiError(response.message || '请求失败', response.code)
  }
  return response.data
}

export function reportApiFailure(error: unknown, options: ApiFailureOptions = {}) {
  if (axios.isCancel(error)) return
  if (isPageLeaving()) return
  if (!axios.isAxiosError(error)) return

  const responseBody = error.response?.data as Partial<BaseResponse<unknown>> | undefined
  if (responseBody?.code === 901) {
    notifySessionExpired()
    return
  }
  if ((!error.response || error.response.status >= 500) && announceAvailability(options)) notifyApiUnavailable()
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10_000,
  withCredentials: true,
})

client.interceptors.request.use((config) => {
  const context = (config as typeof config & { wetalkSession?: AuthRequestContext }).wetalkSession
  if (context) assertCurrentSession(context)
  const token = context ? context.token : readStoredSession()?.token
  if (token) config.headers.set('token', token)
  return config
})

export async function postForm<T>(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
  options: ApiFailureOptions & { signal?: AbortSignal } = {},
): Promise<T> {
  const context = captureAuthRequestContext()
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) body.set(key, String(value))
  }

  try {
    const config: ScopedRequestConfig = {
      wetalkSession: context,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      ...(options.signal ? { signal: options.signal } : {}),
    }
    const response = await client.post<BaseResponse<T>>(path, body, config)
    assertCurrentSession(context)
    return unwrapResponse(response.data, options)
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
    assertCurrentSession(context)
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      const responseBody = error.response?.data as Partial<BaseResponse<unknown>> | undefined
      reportApiFailure(error, options)
      throw new ApiError(
        typeof responseBody?.message === 'string' ? responseBody.message : '连接服务器失败，请稍后重试',
        typeof responseBody?.code === 'number' ? responseBody.code : null,
      )
    }
    throw error
  }
}


export interface MultipartRequestOptions {
  timeoutMs?: number
  onUploadProgress?: (percent: number) => void
}

export async function postMultipart<T>(
  path: string,
  body: FormData,
  options?: MultipartRequestOptions,
): Promise<T> {
  const context = captureAuthRequestContext()
  try {
    const requestOptions: ScopedRequestConfig = { wetalkSession: context }
    if (options?.timeoutMs !== undefined) requestOptions.timeout = options.timeoutMs
    if (options?.onUploadProgress) {
      requestOptions.onUploadProgress = (event: AxiosProgressEvent) => {
        if (!event.total) return
        options.onUploadProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    const response = await client.post<BaseResponse<T>>(path, body, requestOptions)
    assertCurrentSession(context)
    return unwrapResponse(response.data)
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
    assertCurrentSession(context)
    if (error instanceof StaleSessionResponseError) throw error
    if (axios.isAxiosError(error)) {
      const responseBody = error.response?.data as Partial<BaseResponse<unknown>> | undefined
      reportApiFailure(error)
      throw new ApiError(
        typeof responseBody?.message === 'string' ? responseBody.message : '连接服务器失败，请稍后重试',
        typeof responseBody?.code === 'number' ? responseBody.code : null,
      )
    }
    throw error
  }
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read the response body.'))
    reader.readAsText(blob)
  })
}

async function unwrapBlobError(blob: Blob, context: AuthRequestContext): Promise<never> {
  let response: Partial<BaseResponse<unknown>>
  try {
    const text = await readBlobText(blob)
    assertCurrentSession(context)
    response = JSON.parse(text) as Partial<BaseResponse<unknown>>
  } catch {
    assertCurrentSession(context)
    throw new ApiError('文件下载失败，请稍后重试')
  }
  if (typeof response.code === 'number' && response.code !== 200) {
    return unwrapResponse(response as BaseResponse<unknown>) as never
  }
  throw new ApiError('服务器未返回文件', typeof response.code === 'number' ? response.code : null)
}

export async function postDownload(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
): Promise<Blob> {
  const context = captureAuthRequestContext()
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) body.set(key, String(value))
  }

  try {
    const config: ScopedRequestConfig = {
      wetalkSession: context,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      responseType: 'blob',
      timeout: 0,
    }
    const response = await client.post<Blob>(path, body, config)
    assertCurrentSession(context)
    if (String(response.headers['content-type'] || '').toLowerCase().includes('json')) {
      return await unwrapBlobError(response.data, context)
    }
    return response.data
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
    assertCurrentSession(context)
    if (error instanceof StaleSessionResponseError) throw error
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data
      if (responseData instanceof Blob) return await unwrapBlobError(responseData, context)
      const responseBody = responseData as Partial<BaseResponse<unknown>> | undefined
      reportApiFailure(error)
      throw new ApiError(
        typeof responseBody?.message === 'string' ? responseBody.message : '文件下载失败，请稍后重试',
        typeof responseBody?.code === 'number' ? responseBody.code : null,
      )
    }
    throw error
  }
}
