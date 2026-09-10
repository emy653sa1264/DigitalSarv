import { Toaster as Sonner, toast, type ToasterProps } from 'sonner'

/** Design toast: black pill, bottom-center (see prototype `toastOn`). */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      dir="rtl"
      position="bottom-center"
      offset={26}
      duration={2400}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex items-center gap-2 rounded-full bg-night px-6 py-3.5 font-sans text-sm font-bold text-white shadow-[0_14px_34px_rgba(7,9,15,0.4)]',
          error: '!bg-pink-dark',
          success: '',
        },
      }}
      {...props}
    />
  )
}

/** Show a toast with the design's copy, e.g. notify('تغییرات ذخیره شد'). */
const notify = (message: string) => toast(message)

export { Toaster, toast, notify }
