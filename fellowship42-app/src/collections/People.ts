import type { CollectionConfig } from 'payload'

import { churchScopedAccess } from '@/access/helpers'

export const People: CollectionConfig = {
  slug: 'people',
  admin: {
    defaultColumns: ['firstName', 'lastName', 'email', 'membershipStatus', 'church'],
    useAsTitle: 'email',
  },
  access: {
    create: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader']),
    delete: churchScopedAccess(['super-admin', 'church-admin']),
    read: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader', 'finance']),
    update: churchScopedAccess(['super-admin', 'church-admin', 'ministry-leader']),
  },
  fields: [
    {
      name: 'church',
      type: 'relationship',
      relationTo: 'churches',
      required: true,
    },
    { name: 'firstName', type: 'text', required: true },
    { name: 'lastName', type: 'text', required: true },
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'text' },
    {
      name: 'householdName',
      type: 'text',
    },
    {
      name: 'membershipStatus',
      type: 'select',
      defaultValue: 'guest',
      options: [
        { label: 'Guest', value: 'guest' },
        { label: 'Regular Attender', value: 'regular-attender' },
        { label: 'Member', value: 'member' },
        { label: 'Volunteer', value: 'volunteer' },
      ],
    },
    {
      name: 'volunteerReady',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
