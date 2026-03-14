import type { CollectionConfig } from 'payload'

import { canManageFinance } from '@/access/helpers'

export const Contributions: CollectionConfig = {
  slug: 'contributions',
  admin: {
    defaultColumns: ['donorName', 'amount', 'fund', 'status', 'donatedAt'],
    useAsTitle: 'donorName',
  },
  access: {
    create: canManageFinance,
    delete: canManageFinance,
    read: canManageFinance,
    update: canManageFinance,
  },
  fields: [
    {
      name: 'church',
      type: 'relationship',
      relationTo: 'churches',
      required: true,
    },
    {
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
    },
    {
      name: 'donorName',
      type: 'text',
      required: true,
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      name: 'fund',
      type: 'select',
      defaultValue: 'general',
      options: [
        { label: 'General', value: 'general' },
        { label: 'Missions', value: 'missions' },
        { label: 'Benevolence', value: 'benevolence' },
        { label: 'Building', value: 'building' },
      ],
      required: true,
    },
    {
      name: 'paymentMethod',
      type: 'select',
      defaultValue: 'card',
      options: [
        { label: 'Card', value: 'card' },
        { label: 'ACH', value: 'ach' },
        { label: 'Cash', value: 'cash' },
        { label: 'Check', value: 'check' },
      ],
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'succeeded',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Refunded', value: 'refunded' },
      ],
      required: true,
    },
    {
      name: 'recurring',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'donatedAt',
      type: 'date',
      required: true,
    },
  ],
}

