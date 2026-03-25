import type { Id, TableNames } from '@convex/_generated/dataModel'

export function asId<TableName extends TableNames>(value: string): Id<TableName> {
  return value as Id<TableName>
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatTimestamp(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp))
}
