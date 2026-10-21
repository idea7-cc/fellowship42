const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatTimestamp(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp))
}

const dayFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

/** The calendar day of an instant, in the viewer's timezone. */
export function formatDay(timestamp: number): string {
  return dayFormatter.format(new Date(timestamp))
}
