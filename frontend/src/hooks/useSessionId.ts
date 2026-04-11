import { useRef } from 'react'

export function useSessionId(): string {
  const ref = useRef<string>('')
  if (!ref.current) {
    let sid = localStorage.getItem('bs_session_id')
    if (!sid) {
      sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem('bs_session_id', sid)
    }
    ref.current = sid
  }
  return ref.current
}
