import { useAuth } from '@/stores/auth'
import type { UploadPurpose } from '@/lib/types'

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

type Query = Record<string, string | number | boolean | null | undefined>
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const NETWORK_ERROR = 'ارتباط با سرور برقرار نشد'

function buildUrl(path: string, query?: Query): URL {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

function authHeaders(): { token: string | null; headers: Record<string, string> } {
  const token = useAuth.getState().token
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return { token, headers }
}

function parseBody(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return text
  }
}

/** Shared error semantics: 401 with a token logs out; Nest `message` (string | string[]) becomes the error text. */
function toApiError(status: number, data: unknown, hadToken: boolean): ApiError {
  if (status === 401 && hadToken) useAuth.getState().logout()
  const raw = (data as { message?: string | string[] } | undefined)?.message
  let message = Array.isArray(raw) ? raw.join('، ') : raw || 'خطا در ارتباط با سرور'
  if (status === 413) message = `حجم فایل بیشتر از ${UPLOAD_MAX_MB_FA} مگابایت است`
  return new ApiError(status, message, data)
}

async function request<T>(method: Method, path: string, body?: unknown, query?: Query): Promise<T> {
  const url = buildUrl(path, query)
  const { token, headers } = authHeaders()
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, NETWORK_ERROR)
  }

  const data = parseBody(await res.text())
  if (!res.ok) throw toApiError(res.status, data, !!token)
  return data as T
}

/**
 * Multipart upload (field `file`) with progress. XMLHttpRequest because fetch has no upload progress.
 * `onProgress` receives 0…1. Aborting via `signal` rejects with an `AbortError` DOMException.
 */
function upload<T>(path: string, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const { token, headers } = authHeaders()
    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildUrl(path).toString())
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total))
      }
    }
    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)

    xhr.onload = () => {
      cleanup()
      const data = parseBody(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve(data as T)
      } else reject(toApiError(xhr.status, data, !!token))
    }
    xhr.onerror = () => {
      cleanup()
      reject(new ApiError(0, NETWORK_ERROR))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const form = new FormData()
    form.append('file', file, file.name)
    xhr.send(form)
  })
}

function filenameFrom(disposition: string | null): string | undefined {
  if (!disposition) return undefined
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)
  return plain?.[1]
}

/** Authenticated binary GET (e.g. `/uploads/:id`) — needed because `<a href>` can't send the bearer header. */
async function blob(path: string): Promise<{ blob: Blob; filename?: string }> {
  const { token, headers } = authHeaders()
  headers.Accept = '*/*'
  let res: Response
  try {
    res = await fetch(buildUrl(path), { headers })
  } catch {
    throw new ApiError(0, NETWORK_ERROR)
  }
  if (!res.ok) throw toApiError(res.status, parseBody(await res.text()), !!token)
  return { blob: await res.blob(), filename: filenameFrom(res.headers.get('Content-Disposition')) }
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload,
  blob,
}

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

// ── Upload rules (docs/api-contract.md › v2 › Uploads) ─────────────────────
export const UPLOAD_MAX_MB = 50
const UPLOAD_MAX_MB_FA = '۵۰'

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic']
const DOC_EXT = ['pdf', 'doc', 'docx', ...IMAGE_EXT]

/** Photo purposes accept images only (`logo` accepts document types too, like `docs`/`flyer`). */
const PHOTO_PURPOSES: UploadPurpose[] = ['cartridge', 'device', 'pickup']

const extensionsFor = (purpose: UploadPurpose) => (PHOTO_PURPOSES.includes(purpose) ? IMAGE_EXT : DOC_EXT)

/** `accept` attribute for a purpose's file input. */
export function uploadAccept(purpose: UploadPurpose): string {
  const images = 'image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic'
  if (PHOTO_PURPOSES.includes(purpose)) return images
  return `.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,${images}`
}

/** Client-side check before uploading; returns a Persian error or `null`. */
export function uploadProblem(file: File, purpose: UploadPurpose): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!extensionsFor(purpose).includes(ext)) {
    return PHOTO_PURPOSES.includes(purpose)
      ? 'فقط تصویر (JPG، PNG، WEBP یا HEIC) قابل بارگذاری است'
      : 'فقط فایل PDF، Word یا تصویر (JPG، PNG، WEBP، HEIC) قابل بارگذاری است'
  }
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) return `حجم فایل بیشتر از ${UPLOAD_MAX_MB_FA} مگابایت است`
  if (file.size === 0) return 'فایل انتخاب‌شده خالی است'
  return null
}

const sizeFmt = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 })

/** "۲٫۴ مگابایت" / "۳۸۰ کیلوبایت" */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1_048_576) return `${sizeFmt.format(bytes / 1_048_576)} مگابایت`
  return `${sizeFmt.format(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`
}

/**
 * Opens an uploaded file (`/uploads/:id`) in a new tab. The tab is opened synchronously (keeps the user
 * gesture so popup blockers allow it) and pointed at a blob URL once the authenticated fetch finishes;
 * if the popup is blocked the file is downloaded instead.
 */
export async function openUpload(id: string): Promise<void> {
  const win = window.open('', '_blank')
  try {
    const { blob: data, filename } = await blob(`/uploads/${id}`)
    const url = URL.createObjectURL(data)
    if (win) win.location.href = url
    else {
      const a = document.createElement('a')
      a.href = url
      a.download = filename || id
      document.body.append(a)
      a.click()
      a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    win?.close()
    throw error
  }
}
