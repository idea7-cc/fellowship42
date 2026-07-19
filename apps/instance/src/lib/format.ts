const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatTimestamp(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp))
}
