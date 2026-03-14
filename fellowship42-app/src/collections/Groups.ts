import type { CollectionConfig } from 'payload'

import { churchScopedAccess, publicPublishedContentAccess } from '@/access/helpers'
import { slugField } from '@/fields/slug'

export const Groups: CollectionConfig = {
  slug: 'groups',
  admin: {
    defaultColumns: ['title', 'groupType', 'church', 'ministry', 'status'],
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
      name: 'ministry',
      type: 'relationship',
      relationTo: 'ministries',
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
      name: 'groupType',
      type: 'select',
      defaultValue: 'small-group',
      options: [
        { label: 'Small Group', value: 'small-group' },
        { label: 'Sunday School Class', value: 'sunday-school' },
        { label: 'Bible Study', value: 'bible-study' },
        { label: 'Support Group', value: 'support-group' },
        { label: 'Serving Team', value: 'serving-team' },
        { label: 'Training Cohort', value: 'training-cohort' },
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
      name: 'location',
      type: 'text',
    },
    {
      name: 'openEnrollment',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'capacity',
      type: 'number',
      min: 1,
    },
    {
      name: 'leaders',
      type: 'relationship',
      relationTo: 'people',
      hasMany: true,
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
          ownerCollection: 'groups',
        },
        disableListColumn: true,
        position: 'sidebar',
      },
      label: '',
    },
  ],
}
