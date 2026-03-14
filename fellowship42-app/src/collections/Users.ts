import type { CollectionConfig } from 'payload'

import { hasRole, isSuperAdmin } from '@/access/helpers'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    defaultColumns: ['email', 'firstName', 'lastName', 'roles'],
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    create: ({ req }) => Boolean(req.user) && hasRole(req.user ?? null, ['super-admin', 'church-admin']),
    delete: ({ req }) => Boolean(req.user) && hasRole(req.user ?? null, ['super-admin', 'church-admin']),
    read: ({ req }) => {
      if (!req.user) {
        return false
      }

      if (isSuperAdmin({ req })) {
        return true
      }

      return {
        id: {
          equals: req.user.id,
        },
      }
    },
    update: ({ req }) => {
      if (!req.user) {
        return false
      }

      if (isSuperAdmin({ req })) {
        return true
      }

      return {
        id: {
          equals: req.user.id,
        },
      }
    },
  },
  fields: [
    { name: 'firstName', type: 'text', required: true },
    { name: 'lastName', type: 'text', required: true },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      saveToJWT: true,
      defaultValue: ['church-admin'],
      options: [
        { label: 'Super Admin', value: 'super-admin' },
        { label: 'Church Admin', value: 'church-admin' },
        { label: 'Finance', value: 'finance' },
        { label: 'Content Editor', value: 'content-editor' },
        { label: 'Ministry Leader', value: 'ministry-leader' },
        { label: 'Member', value: 'member' },
      ],
    },
    {
      name: 'churches',
      type: 'relationship',
      relationTo: 'churches',
      hasMany: true,
      saveToJWT: true,
    },
    {
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      saveToJWT: true,
    },
  ],
}
