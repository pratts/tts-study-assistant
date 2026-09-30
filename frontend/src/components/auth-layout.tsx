import { BookOpenIcon, HeadphonesIcon, NotebookPenIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ThemeToggle } from '@/components/theme-toggle'

/** Two-column auth layout from the shadcn login-02 block. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpenIcon className="size-4" />
            </div>
            Study Assistant
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <a href="/privacy-policy" className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
        </p>
      </div>
      <div className="relative hidden flex-col items-center justify-center gap-8 bg-muted lg:flex" aria-hidden>
        <div className="flex gap-6 text-muted-foreground">
          <BookOpenIcon className="size-16" />
          <NotebookPenIcon className="size-16" />
          <HeadphonesIcon className="size-16" />
        </div>
        <p className="max-w-xs text-center text-lg text-muted-foreground">Save notes from any page and listen to them anywhere.</p>
      </div>
    </div>
  )
}
