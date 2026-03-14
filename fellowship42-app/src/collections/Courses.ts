import type { CollectionConfig } from 'payload'

import { churchScopedAccess, publicPublishedContentAccess } from '@/access/helpers'
import { slugField } from '@/fields/slug'

export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: {
    defaultColumns: ['title', 'courseType', 'deliveryMode', 'church', 'status'],
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
      name: 'courseType',
      type: 'select',
      defaultValue: 'discipleship',
      options: [
        { label: 'New Member Class', value: 'new-member' },
        { label: 'Volunteer Training', value: 'volunteer-training' },
        { label: 'Discipleship Track', value: 'discipleship' },
        { label: 'Leadership Development', value: 'leadership' },
        { label: 'Bible Study Course', value: 'bible-study' },
        { label: 'Curriculum Library', value: 'curriculum' },
      ],
      required: true,
    },
    {
      name: 'deliveryMode',
      type: 'select',
      defaultValue: 'group-led',
      options: [
        { label: 'Self-Paced', value: 'self-paced' },
        { label: 'Group-Led', value: 'group-led' },
        { label: 'Cohort', value: 'cohort' },
        { label: 'Hybrid', value: 'hybrid' },
      ],
      required: true,
    },
    {
      name: 'audience',
      type: 'text',
      required: true,
    },
    {
      name: 'duration',
      type: 'text',
      required: true,
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'certificateOffered',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
    },
    {
      name: 'lessons',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'summary',
          type: 'textarea',
          required: true,
        },
        {
          name: 'content',
          type: 'richText',
        },
        {
          name: 'resource',
          type: 'relationship',
          relationTo: 'media',
        },
        {
          name: 'estimatedMinutes',
          type: 'number',
          min: 1,
        },
        {
          name: 'required',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
    {
      name: 'landingPageActions',
      type: 'ui',
      admin: {
        components: {
          Field: './components/admin/LandingPageOwnerActions#LandingPageOwnerActions',
        },
        custom: {
          ownerCollection: 'courses',
        },
        disableListColumn: true,
        position: 'sidebar',
      },
      label: '',
    },
  ],
}
