import { NotebookTextIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState, ErrorState } from '@/components/query-state'
import { SpeakButton } from '@/components/speak-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLatestNote, useNotesStats } from '@/hooks/use-notes'
import { useStopSpeechOnUnmount } from '@/hooks/use-speech'
import { formatDate } from '@/lib/notes'
import { displayDomain } from '@/lib/utils'

export default function DashboardPage() {
  useStopSpeechOnUnmount()
  const stats = useNotesStats()
  const latest = useLatestNote()

  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} title="Could not load the dashboard" />

  const total = stats.data?.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Total notes</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{total ?? <Skeleton className="h-9 w-16" />}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Most recent note</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {latest.isPending && <Skeleton className="h-16 w-full" />}
            {latest.isError && <ErrorState error={latest.error} onRetry={() => void latest.refetch()} title="Could not load the latest note" />}
            {latest.data === null && <p className="text-sm text-muted-foreground">No notes yet.</p>}
            {latest.data && (
              <>
                <p className="line-clamp-4 text-sm whitespace-pre-wrap">{latest.data.content}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{displayDomain(latest.data.domain)}</Badge>
                  <span>{formatDate(latest.data.created_at)}</span>
                  <span className="ml-auto flex gap-2">
                    <SpeakButton speechKey={`latest:${latest.data.id}`} text={latest.data.content} label="most recent note" withStop />
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes by domain</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.isPending && (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading statistics">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
          {stats.data?.length === 0 && (
            <EmptyState
              icon={NotebookTextIcon}
              title="No notes yet"
              description="Save text from any page with the extension, or add a note here."
              action={
                <Button asChild>
                  <Link to="/notes">Go to notes</Link>
                </Button>
              }
            />
          )}
          {stats.data && stats.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-right">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.data.map((s) => (
                  <TableRow key={s.domain}>
                    <TableCell>{displayDomain(s.domain)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
