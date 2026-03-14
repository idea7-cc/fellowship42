export const formatEventDate = (value: string | null | undefined): string => {
  if (!value) {
    return 'Date pending'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

