import type { CollectionConfig } from 'payload'

import { ownOrChurchScopedAccess } from '@/access/helpers'

export const GroupMemberships: CollectionConfig = {
  slug: 'group-memberships',
  admin: {
    defaultColumns: ['group', 'person', 'role', 'status', 'joinedAt'],
    useAsTitle: 'status',
  },
  access: {
    create: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader', 'content-editor'],
    }),
    delete: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader'],
    }),
    read: ownOrChurchScopedAccess({
      allowedRoles: ['church-admin', 'ministry-leader', 'content-editor'],
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
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'member',
      options: [
        { label: 'Member', value: 'member' },
        { label: 'Leader', value: 'leader' },
        { label: 'Apprentice Leader', value: 'apprentice' },
        { label: 'Host', value: 'host' },
      ],
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Interested', value: 'interested' },
        { label: 'Pending', value: 'pending' },
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
        { label: 'Completed', value: 'completed' },
      ],
      required: true,
    },
    {
      name: 'joinedAt',
      type: 'date',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}

