import { Fragment } from 'react'
import { Outlet, useLocation } from 'react-router'
import { BottomTabs } from '@/components/brand'
import { useTrackNavStack } from '../hooks/nav'
import { TABS } from '../lib/constants'
import { PickerProvider } from './picker'

/** Signed-in chrome: the current screen (header + body), the dark tab bar and the service picker sheet. */
export function AppLayout() {
  useTrackNavStack()
  const location = useLocation()
  return (
    <PickerProvider>
      {/* Remount per URL so every screen starts scrolled to the top with fresh local form state. */}
      <Fragment key={location.pathname + location.search}>
        <Outlet />
      </Fragment>
      <BottomTabs items={TABS} activeClassName="text-[#7ea6ff]" />
    </PickerProvider>
  )
}
