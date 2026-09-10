import { Outlet, useMatch } from 'react-router'
import { AppShell } from '@/components/brand'

/** Customer app root: blue role theme inside the full-screen app shell. The login screen has no tab bar, so it pads the bottom safe area itself. */
export function CustomerShell() {
  const onLogin = useMatch('/app/login') !== null
  return (
    <AppShell role="customer" safeBottom={onLogin}>
      <Outlet />
    </AppShell>
  )
}
