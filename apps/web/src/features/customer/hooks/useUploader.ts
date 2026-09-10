import { useEffect, useRef, useState } from 'react'
import { notify, toast } from '@/components/ui/sonner'
import { api, isAbortError, uploadProblem } from '@/lib/api'
import type { Upload, UploadPurpose } from '@/lib/types'
import { useDraft } from '@/stores/draft'

/** A file still uploading (or one that failed and can be dismissed). */
export interface PendingUpload {
  key: string
  name: string
  size: number
  /** 0…1 */
  progress: number
  error?: string
}

let seq = 0

/**
 * Upload state for one attachment slot (`POST /uploads?purpose=…`).
 * Finished uploads are cached in the draft store and handed to `onDone`; the screen stores the id in its spec.
 */
export function useUploader(purpose: UploadPurpose) {
  const [pending, setPending] = useState<PendingUpload[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const rememberUpload = useDraft((s) => s.rememberUpload)

  useEffect(() => {
    const map = controllers.current
    return () => {
      for (const c of map.values()) c.abort()
      map.clear()
    }
  }, [])

  const patchItem = (key: string, patch: Partial<PendingUpload>) =>
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const drop = (key: string) => {
    controllers.current.delete(key)
    setPending((list) => list.filter((p) => p.key !== key))
  }

  const start = (file: File, onDone: (upload: Upload) => void) => {
    const problem = uploadProblem(file, purpose)
    if (problem) {
      toast.error(problem)
      return
    }
    const key = `u${++seq}`
    const controller = new AbortController()
    controllers.current.set(key, controller)
    setPending((list) => [...list, { key, name: file.name, size: file.size, progress: 0 }])

    api
      .upload<Upload>(`/uploads?purpose=${purpose}`, file, (progress) => patchItem(key, { progress }), controller.signal)
      .then((upload) => {
        rememberUpload(upload)
        drop(key)
        onDone(upload)
        notify(`فایل ${upload.name} بارگذاری شد`)
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return drop(key)
        controllers.current.delete(key)
        const message = error instanceof Error ? error.message : 'بارگذاری انجام نشد'
        patchItem(key, { error: message })
        toast.error(message)
      })
  }

  /** Cancels an in-flight upload or dismisses a failed one. */
  const cancel = (key: string) => {
    const controller = controllers.current.get(key)
    if (controller) controller.abort()
    else drop(key)
  }

  return { pending, start, cancel, busy: pending.some((p) => !p.error) }
}

/** Upload metadata cached for this draft (undefined for ids from older drafts/reorders). */
export const useUploadMeta = (id: string | undefined) => useDraft((s) => (id ? s.uploads[id] : undefined))
