import type { CollectionConfig } from 'payload'

import { churchScopedAccess, publicPublishedContentAccess } from '@/access/helpers'
import { slugField } from '@/fields/slug'

export const Ministries: CollectionConfig = {
  slug: 'ministries',
  admin: {
    defaultColumns: ['title', 'church', 'audience', 'status', 'featured'],
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
    {
      name: 'title',
      type: 'text',
      required: true,
    },
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
      name: 'audience',
      type: 'text',
      required: true,
    },
    {
      name: 'schedule',
      type: 'text',
      required: true,
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
    },
    {
      name: 'landingPageActions',
      type: 'ui',
      admin: {
        components: {
          Field: './components/admin/LandingPageOwnerActions#LandingPageOwnerActions',
        },
        custom: {
          ownerCollection: 'ministries',
        },
        disableListColumn: true,
        position: 'sidebar',
      },
      label: '',
    },
  ],
}
