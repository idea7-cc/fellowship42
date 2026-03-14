import type { CollectionConfig } from 'payload'

import { churchScopedAccess, publicPublishedContentAccess } from '@/access/helpers'
import { slugField } from '@/fields/slug'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    defaultColumns: ['title', 'church', 'startDate', 'location', 'status'],
    useAsTitle: 'title',
  },
  access: {
    create: churchScopedAccess(['super-admin', 'church-admin', 'content-editor', 'ministry-leader']),
    delete: churchScopedAccess(['super-admin', 'church-admin', 'content-editor']),
    read: publicPublishedContentAccess,
    update: churchScopedAccess(['super-admin', 'church-admin', 'content-editor', 'ministry-leader']),
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
      name: 'summary',
      type: 'textarea',
      required: true,
    },
    {
      name: 'startDate',
      type: 'date',
      required: true,
    },
    {
      name: 'endDate',
      type: 'date',
    },
    {
      name: 'location',
      type: 'text',
      required: true,
    },
    {
      name: 'registrationUrl',
      type: 'text',
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}

