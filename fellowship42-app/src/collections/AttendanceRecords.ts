import type { CollectionConfig } from 'payload'

import { ownOrChurchScopedAccess } from '@/access/helpers'

export const AttendanceRecords: CollectionConfig = {
  slug: 'attendance-records',
  admin: {
    defaultColumns: ['session', 'person', 'status', 'checkedInAt'],
    useAsTitle: 'status',
  },
  access: {
    create: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader'],
    }),
    delete: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader'],
    }),
    read: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader'],
    }),
    update: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader'],
    }),
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
      name: 'session',
      type: 'relationship',
      relationTo: 'group-sessions',
      required: true,
    },
    {
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'present',
      options: [
        { label: 'Present', value: 'present' },
        { label: 'Absent', value: 'absent' },
        { label: 'Excused', value: 'excused' },
        { label: 'Serving Elsewhere', value: 'serving' },
      ],
      required: true,
    },
    {
      name: 'checkedInAt',
      type: 'date',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}

