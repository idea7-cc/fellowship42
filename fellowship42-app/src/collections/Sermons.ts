import type { CollectionConfig } from 'payload'

import { churchScopedAccess, publicPublishedContentAccess } from '@/access/helpers'
import { slugField } from '@/fields/slug'

export const Sermons: CollectionConfig = {
  slug: 'sermons',
  admin: {
    defaultColumns: ['title', 'speaker', 'church', 'preachedAt', 'status'],
    useAsTitle: 'title',
  },
  access: {
    create: churchScopedAccess(['super-admin', 'church-admin', 'content-editor']),
    delete: churchScopedAccess(['super-admin', 'church-admin', 'content-editor']),
    read: publicPublishedContentAccess,
    update: churchScopedAccess(['super-admin', 'church-admin', 'content-editor']),
  },
  fields: [
    {
      name: 'church',
      type: 'relationship',
      relationTo: 'churches',
      required: true,
    },
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      required: true,
    },
    {
      name: 'speaker',
      type: 'text',
      required: true,
    },
    {
      name: 'series',
      type: 'text',
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
    },
    {
      name: 'videoUrl',
      type: 'text',
    },
    {
      name: 'preachedAt',
      type: 'date',
      required: true,
    },
  ],
}

