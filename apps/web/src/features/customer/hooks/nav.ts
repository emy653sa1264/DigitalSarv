import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'

/**
 * A mirror of the browser history stack for the customer app, so "back" and
 * "return to X" behave like the prototype's navigation stack (pop instead of pushing duplicates).
 * react-router stores the entry index in `history.state.idx`.
 */
const STORAGE_KEY = 'sarv-app-stack'

function loadStack(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

const stack: string[] = loadStack()

function historyIdx(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : null
}

const pathOf = (entry: string | undefined) => entry?.split('?')[0]

/** Mount once in the app layout. */
export function useTrackNavStack() {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    const idx = historyIdx()
    if (idx === null) return
    if (type === 'PUSH') stack.length = Math.min(stack.length, idx)
    stack[idx] = location.pathname + location.search
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack))
    } catch {
      // storage unavailable — in-memory stack still works
    }
  }, [location.key, location.pathname, location.search, type])
}

/** Header back button: pop when the previous entry is an app screen, else go to `fallback`. */
export function useBack(fallback = '/app') {
  const navigate = useNavigate()
  return () => {
    const idx = historyIdx()
    const prev = idx !== null && idx > 0 ? pathOf(stack[idx - 1]) : undefined
    if (prev?.startsWith('/app') && prev !== '/app/login') navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

/** Return to an earlier screen: pops back to its latest history entry if present, otherwise replaces. */
export function useReturnTo() {
  const navigate = useNavigate()
  return (path: string) => {
    const idx = historyIdx()
    if (idx !== null) {
      for (let k = idx - 1; k >= 0; k--) {
        if (pathOf(stack[k]) === path) {
          navigate(k - idx)
          return
        }
      }
    }
    navigate(path, { replace: true })
  }
}
