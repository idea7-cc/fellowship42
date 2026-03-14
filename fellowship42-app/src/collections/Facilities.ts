import type { CollectionConfig } from 'payload'

import { churchScopedAccess } from '@/access/helpers'

export const Facilities: CollectionConfig = {
  slug: 'facilities',
  admin: {
    defaultColumns: ['name', 'church', 'roomType', 'capacity', 'availability'],
    useAsTitle: 'name',
  },
  access: {
    create: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader']),
    delete: churchScopedAccess(['super-admin', 'church-admin']),
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
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'roomType',
      type: 'select',
      options: [
        { label: 'Sanctuary', value: 'sanctuary' },
        { label: 'Classroom', value: 'classroom' },
        { label: 'Lobby', value: 'lobby' },
        { label: 'Office', value: 'office' },
        { label: 'Multipurpose', value: 'multipurpose' },
      ],
      required: true,
    },
    {
      name: 'capacity',
      type: 'number',
      required: true,
      min: 1,
    },
    {
      name: 'availability',
      type: 'select',
      defaultValue: 'available',
      options: [
        { label: 'Available', value: 'available' },
        { label: 'Reserved', value: 'reserved' },
        { label: 'Maintenance', value: 'maintenance' },
      ],
      required: true,
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}

