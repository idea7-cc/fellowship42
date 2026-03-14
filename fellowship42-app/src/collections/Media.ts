import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'alt',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'church',
      type: 'relationship',
      relationTo: 'churches',
    },
    {
      name: 'resourceType',
      type: 'select',
      defaultValue: 'image',
      options: [
        { label: 'Image', value: 'image' },
        { label: 'Worksheet', value: 'worksheet' },
        { label: 'Lesson Guide', value: 'lesson-guide' },
        { label: 'Video', value: 'video' },
        { label: 'Handbook', value: 'handbook' },
      ],
    },
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
