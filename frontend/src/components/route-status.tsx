import { RotateCwIcon } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'

/** Shown while the first route (and its lazy chunk) loads. */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="size-6" />
    </div>
  )
}

/** Router error boundary: failed chunk loads and unexpected render errors. */
export function RouteError() {
  const error = useRouteError()
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'Something went wrong'
  return (
    <Empty className="min-h-svh">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>The page could not be loaded. It may have been updated; reloading usually fixes this.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => window.location.reload()}>
          <RotateCwIcon /> Reload
        </Button>
      </EmptyContent>
    </Empty>
  )
}
