import axios from 'axios'
import { readStoredSession } from '@/stores/auth'

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
    if (response.data.code !== 200) {
      throw new ApiError(response.data.message || '请求失败', response.data.code)
    }
    return response.data.data
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
    if (axios.isAxiosError(error)) {
      const responseBody = error.response?.data as Partial<BaseResponse<unknown>> | undefined
      throw new ApiError(
        typeof responseBody?.message === 'string' ? responseBody.message : '连接服务器失败，请稍后重试',
        typeof responseBody?.code === 'number' ? responseBody.code : null,
      )
    }
    throw error
  }
}
