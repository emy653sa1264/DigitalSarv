import { useState } from 'react'
import { LogOut } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { useLogout } from '@/lib/query'

/** «خروج از حساب» with confirmation. */
export function LogoutButton({ className }: { className?: string }) {
  const logout = useLogout()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Button variant="outline" size="lg" block className={className} onClick={() => setConfirm(true)}>
        <LogOut className="size-4" /> خروج از حساب
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="rounded-[26px] border-line bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black">خروج از حساب؟</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">برای ورود دوباره کد تأیید لازم است.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await logout(); notify('از حساب خارج شدید') }}>خروج</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
