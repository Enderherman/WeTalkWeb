import axios, { type AxiosProgressEvent, type AxiosRequestConfig } from 'axios'
import { readStoredSession } from '@/stores/auth'
import { notifyApiUnavailable } from '@/utils/apiEvents'
import { notifySessionExpired } from '@/utils/authEvents'

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

export function unwrapResponse<T>(response: BaseResponse<T>): T {
  if (response.code !== 200) {
    if (response.code === 901) notifySessionExpired()
    else if (response.code >= 500 && response.code < 600) notifyApiUnavailable()
    throw new ApiError(response.message || '请求失败', response.code)
  }
  return response.data
}

export function reportApiFailure(error: unknown) {
  if (!axios.isAxiosError(error)) return

  const responseBody = error.response?.data as Partial<BaseResponse<unknown>> | undefined
  if (responseBody?.code === 901) {
    notifySessionExpired()
    return
  }
  if (!error.response || error.response.status >= 500) notifyApiUnavailable()
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10_000,
})

client.interceptors.request.use((config) => {
  const token = readStoredSession()?.token
  if (token) config.headers.set('token', token)
  return config
})

export async function postForm<T>(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) body.set(key, String(value))
  }

  try {
    const response = await client.post<BaseResponse<T>>(path, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    })
    return unwrapResponse(response.data)
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
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


export interface MultipartRequestOptions {
  timeoutMs?: number
  onUploadProgress?: (percent: number) => void
}

export async function postMultipart<T>(
  path: string,
  body: FormData,
  options?: MultipartRequestOptions,
): Promise<T> {
  try {
    const requestOptions: AxiosRequestConfig = {}
    if (options?.timeoutMs !== undefined) requestOptions.timeout = options.timeoutMs
    if (options?.onUploadProgress) {
      requestOptions.onUploadProgress = (event: AxiosProgressEvent) => {
        if (!event.total) return
        options.onUploadProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    const response = options
      ? await client.post<BaseResponse<T>>(path, body, requestOptions)
      : await client.post<BaseResponse<T>>(path, body)
    return unwrapResponse(response.data)
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
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

async function unwrapBlobError(blob: Blob): Promise<never> {
  let response: Partial<BaseResponse<unknown>>
  try {
    response = JSON.parse(await readBlobText(blob)) as Partial<BaseResponse<unknown>>
  } catch {
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
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) body.set(key, String(value))
  }

  try {
    const response = await client.post<Blob>(path, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      responseType: 'blob',
      timeout: 0,
    })
    if (String(response.headers['content-type'] || '').toLowerCase().includes('json')) {
      return await unwrapBlobError(response.data)
    }
    return response.data
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data
      if (responseData instanceof Blob) return await unwrapBlobError(responseData)
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
