import { ErrorState } from '@/components/brand'
import { LogoutButton } from './LogoutButton'

/** Error state of provider screens; always offers sign-out so an unlinked account (403) is never a dead end. */
export function ProviderError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <>
      <ErrorState error={error} onRetry={onRetry} />
      <LogoutButton className="mt-3" />
    </>
  )
}
