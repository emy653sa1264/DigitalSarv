import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, ImageOff } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { api, openUpload } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Uploaded file as a blob (`GET /uploads/:id` needs the bearer header, so `<img src>` can't point at it).
 * The blob is cached by React Query.
 */
function useUploadBlob(id: string) {
  const query = useQuery({
    queryKey: ['admin', 'upload-blob', id],
    queryFn: () => api.blob(`/uploads/${id}`),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  })
  return { blob: query.data?.blob, isError: query.isError }
}

/** `<img>` whose `src` is an object URL for `blob`, created and revoked with the element's lifetime. */
function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current
    if (!img) return
    const url = URL.createObjectURL(blob)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return <img ref={ref} alt={alt} className="size-full object-cover" />
}

const open = (id: string) => {
  openUpload(id).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'دریافت فایل انجام نشد'))
}

/** Square photo thumbnail; click opens the full file in a new tab. */
export function UploadThumb({ id, label, className }: { id: string; label: string; className?: string }) {
  const { blob, isError } = useUploadBlob(id)
  const isImage = !!blob?.type.startsWith('image/')
  return (
    <button
      type="button"
      title={label}
      aria-label={`مشاهده ${label}`}
      onClick={() => open(id)}
      className={cn('relative size-[84px] shrink-0 cursor-pointer overflow-hidden rounded-[16px] border border-line bg-line-soft hover:brightness-95', className)}
    >
      {blob && isImage ? (
        <BlobImage blob={blob} alt={label} />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-3">
          {isError ? <ImageOff className="size-5" strokeWidth={2.2} /> : blob ? <FileText className="size-5" strokeWidth={2.2} /> : null}
        </span>
      )}
    </button>
  )
}

/** Document rows first, then a wrap of photo thumbnails (e.g. the output of `orderFiles`). */
export function OrderFilesList({ files }: { files: { id: string; label: string; photo: boolean }[] }) {
  const docs = files.filter((f) => !f.photo)
  const photos = files.filter((f) => f.photo)
  return (
    <>
      {docs.map((f) => (
        <UploadLink key={f.id} id={f.id} label={f.label} />
      ))}
      {photos.length > 0 && (
        <div className={cn('flex flex-wrap gap-2', docs.length > 0 && 'mt-2 border-t border-line-soft pt-3')}>
          {photos.map((f) => (
            <UploadThumb key={f.id} id={f.id} label={f.label} />
          ))}
        </div>
      )}
    </>
  )
}

/** "label · دریافت" row for a non-image attachment. */
export function UploadLink({ id, label }: { id: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => open(id)}
      className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line-soft py-2.5 text-start first:border-t-0"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink">
        <FileText className="size-[18px]" strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" dir="auto">
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-extrabold text-accent-soft-ink">
        <Download className="size-3.5" strokeWidth={2.6} />
        دریافت
      </span>
    </button>
  )
}
