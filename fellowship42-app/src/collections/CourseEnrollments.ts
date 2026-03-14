import type { CollectionConfig } from 'payload'

import { ownOrChurchScopedAccess } from '@/access/helpers'

export const CourseEnrollments: CollectionConfig = {
  slug: 'course-enrollments',
  admin: {
    defaultColumns: ['course', 'person', 'group', 'status', 'progressPercent'],
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
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      required: true,
    },
    {
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
    },
    {
      name: 'group',
      type: 'relationship',
      relationTo: 'groups',
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Invited', value: 'invited' },
        { label: 'Active', value: 'active' },
        { label: 'Completed', value: 'completed' },
        { label: 'Archived', value: 'archived' },
      ],
      required: true,
    },
    {
      name: 'progressPercent',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 100,
      required: true,
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
    {
      name: 'completedLessons',
      type: 'array',
      fields: [
        {
          name: 'lessonID',
          type: 'text',
          required: true,
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'completedAt',
          type: 'date',
          required: true,
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
