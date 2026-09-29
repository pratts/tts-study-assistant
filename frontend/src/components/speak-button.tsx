import { PauseIcon, PlayIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSpeech } from '@/hooks/use-speech'

/** Play / pause / resume one text; optional stop. Hidden without speech support. */
export function SpeakButton({ speechKey, text, label, withStop = false }: { speechKey: string; text: string; label: string; withStop?: boolean }) {
  const { supported, statusOf, toggle, stop } = useSpeech()
  if (!supported) return null
  const status = statusOf(speechKey)
  const action = status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'

  return (
    <>
      <Button variant="outline" size="icon-sm" aria-label={`${action} ${label}`} onClick={() => toggle(speechKey, text)}>
        {status === 'playing' ? <PauseIcon /> : <PlayIcon />}
      </Button>
      {withStop && status !== 'idle' && (
        <Button variant="outline" size="icon-sm" aria-label={`Stop ${label}`} onClick={stop}>
          <SquareIcon />
        </Button>
      )}
    </>
  )
}
