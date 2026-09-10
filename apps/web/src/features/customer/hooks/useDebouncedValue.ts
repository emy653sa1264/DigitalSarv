import { useEffect, useState } from 'react'

/** Debounces a JSON-serialisable value by content (not identity). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const key = JSON.stringify(value)
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(JSON.parse(key) as T), delay)
    return () => clearTimeout(timer)
  }, [key, delay])
  return debounced
}
