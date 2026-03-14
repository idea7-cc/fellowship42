import type { CollectionConfig } from 'payload'

import { churchScopedAccess } from '@/access/helpers'

export const GroupSessions: CollectionConfig = {
  slug: 'group-sessions',
  admin: {
    defaultColumns: ['title', 'group', 'sessionDate', 'attendanceStatus'],
    useAsTitle: 'title',
  },
  access: {
    create: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader']),
    delete: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader']),
    read: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader', 'content-editor']),
    update: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader']),
  },
  fields: [
    {
      name: 'church',
      type: 'relationship',
      relationTo: 'churches',
      required: true,
    },
    {
      name: 'group',
      type: 'relationship',
      relationTo: 'groups',
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'sessionDate',
      type: 'date',
      required: true,
    },
    {
      name: 'location',
      type: 'text',
    },
    {
      name: 'topic',
      type: 'textarea',
    },
    {
      name: 'attendanceStatus',
      type: 'select',
      defaultValue: 'planned',
      options: [
        { label: 'Planned', value: 'planned' },
        { label: 'Attendance Submitted', value: 'submitted' },
      ],
      required: true,
    },
  ],
}

