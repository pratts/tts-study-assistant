import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Text-to-speech with real pause/resume. One utterance plays at a time; the
 * `key` identifies what is playing (e.g. "note:<id>" or "summary:<id>").
 */
type Status = 'idle' | 'playing' | 'paused'
type State = { key: string | null; status: Status }

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
let state: State = { key: null, status: 'idle' }
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function stopSpeech() {
  if (!supported) return
  window.speechSynthesis.cancel()
  set({ key: null, status: 'idle' })
}

function toggle(key: string, text: string) {
  if (!supported) return
  const synth = window.speechSynthesis
  if (state.key === key && state.status === 'playing') {
    synth.pause()
    set({ key, status: 'paused' })
    return
  }
  if (state.key === key && state.status === 'paused') {
    synth.resume()
    set({ key, status: 'playing' })
    return
  }
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const finish = () => {
    if (state.key === key) set({ key: null, status: 'idle' })
  }
  utterance.onend = finish
  utterance.onerror = finish
  synth.speak(utterance)
  set({ key, status: 'playing' })
}

export function useSpeech() {
  const current = useSyncExternalStore(subscribe, () => state)
  const statusOf = useCallback((key: string): Status => (current.key === key ? current.status : 'idle'), [current])
  return { supported, statusOf, toggle, stop: stopSpeech }
}

/** Stops speech when the calling component unmounts (leaving the page). */
export function useStopSpeechOnUnmount() {
  useEffect(() => stopSpeech, [])
}
