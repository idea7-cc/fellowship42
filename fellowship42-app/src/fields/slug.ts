import type { FieldHook, TextField } from 'payload'

const formatSlugValue = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const formatSlug: FieldHook = ({ value, data, operation }) => {
  if (typeof value === 'string' && value.length > 0) {
    return formatSlugValue(value)
  }

  if (operation === 'create' || operation === 'update') {
    const fallback = data?.title || data?.name
    if (typeof fallback === 'string') {
      return formatSlugValue(fallback)
    }
  }

  return value
}

export const slugField = (label = 'Slug'): TextField => ({
  name: 'slug',
  type: 'text',
  label,
  unique: true,
  index: true,
  required: true,
  hooks: {
    beforeValidate: [formatSlug],
  },
})

