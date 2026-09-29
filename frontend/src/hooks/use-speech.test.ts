import { act, renderHook } from '@testing-library/react'

/** jsdom has no speech synthesis; stub it before loading the module. */
async function load() {
  const synth = { speak: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    },
  )
  vi.resetModules()
  const mod = await import('@/hooks/use-speech')
  return { synth, ...mod }
}

describe('useSpeech', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('plays, pauses and resumes instead of restarting', async () => {
    const { synth, useSpeech } = await load()
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(true)

    act(() => result.current.toggle('note:1', 'hello'))
    expect(synth.speak).toHaveBeenCalledOnce()
    expect(result.current.statusOf('note:1')).toBe('playing')

    act(() => result.current.toggle('note:1', 'hello'))
    expect(synth.pause).toHaveBeenCalledOnce()
    expect(result.current.statusOf('note:1')).toBe('paused')

    act(() => result.current.toggle('note:1', 'hello'))
    expect(synth.resume).toHaveBeenCalledOnce()
    expect(synth.speak).toHaveBeenCalledOnce() // resumed, not restarted
  })

  it('switching to another text cancels the current one', async () => {
    const { synth, useSpeech } = await load()
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.toggle('note:1', 'one'))
    act(() => result.current.toggle('summary:1', 'two'))
    expect(synth.cancel).toHaveBeenCalledTimes(2)
    expect(result.current.statusOf('note:1')).toBe('idle')
    expect(result.current.statusOf('summary:1')).toBe('playing')

    act(() => result.current.stop())
    expect(result.current.statusOf('summary:1')).toBe('idle')
  })

  it('returns to idle when the utterance ends', async () => {
    const { synth, useSpeech } = await load()
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.toggle('note:1', 'hello'))
    const utterance = synth.speak.mock.calls[0]![0] as { onend: () => void }
    act(() => utterance.onend())
    expect(result.current.statusOf('note:1')).toBe('idle')
  })
})
