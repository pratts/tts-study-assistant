/** The backend's marker for text that could not be summarized. */
export const SUMMARY_UNAVAILABLE = 'unavailable'

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}
