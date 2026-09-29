import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function CopyButton({ text, label }: { text: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy. Your browser blocked clipboard access.')
    }
  }
  return (
    <Button variant="outline" size="icon-sm" aria-label={`Copy ${label}`} onClick={copy}>
      <CopyIcon />
    </Button>
  )
}
