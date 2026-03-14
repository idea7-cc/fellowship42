import type { CollectionConfig } from 'payload'

import { churchReadAccess, canManageChurchContent } from '@/access/helpers'
import { slugField } from '@/fields/slug'

export const Churches: CollectionConfig = {
  slug: 'churches',
  admin: {
    defaultColumns: ['name', 'slug', 'city', 'state', 'status'],
    useAsTitle: 'name',
  },
  access: {
    create: canManageChurchContent,
    delete: canManageChurchContent,
    read: churchReadAccess,
    update: canManageChurchContent,
  },
  fields: [
    {
      name: 'name',
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
      name: 'tagline',
      type: 'text',
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'serviceTimes',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'day',
          type: 'text',
          required: true,
        },
        {
          name: 'time',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'address',
      type: 'group',
      fields: [
        { name: 'street', type: 'text', required: true },
        { name: 'city', type: 'text', required: true },
        { name: 'state', type: 'text', required: true },
        { name: 'postalCode', type: 'text', required: true },
      ],
    },
    {
      name: 'contact',
      type: 'group',
      fields: [
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'website', type: 'text' },
      ],
    },
    {
      name: 'givingUrl',
      type: 'text',
    },
    {
      name: 'livestreamUrl',
      type: 'text',
    },
    {
      name: 'theme',
      type: 'group',
      fields: [
        {
          name: 'preset',
          type: 'select',
          defaultValue: 'warm',
          options: [
            { label: 'Warm', value: 'warm' },
            { label: 'Calm', value: 'calm' },
            { label: 'Bold', value: 'bold' },
          ],
        },
        { name: 'accent', type: 'text', defaultValue: '#b85c38' },
        { name: 'surface', type: 'text', defaultValue: '#f4ede3' },
        { name: 'ink', type: 'text', defaultValue: '#1d120c' },
        {
          name: 'heroTone',
          type: 'select',
          defaultValue: 'warm',
          options: [
            { label: 'Warm', value: 'warm' },
            { label: 'Calm', value: 'calm' },
            { label: 'Bold', value: 'bold' },
          ],
        },
        {
          name: 'radius',
          type: 'select',
          defaultValue: 'rounded',
          options: [
            { label: 'Soft', value: 'soft' },
            { label: 'Rounded', value: 'rounded' },
            { label: 'Sharp', value: 'sharp' },
          ],
        },
        {
          name: 'headingFont',
          type: 'select',
          defaultValue: 'serif-display',
          options: [
            { label: 'Serif Display', value: 'serif-display' },
            { label: 'Modern Sans', value: 'modern-sans' },
            { label: 'Humanist Sans', value: 'humanist-sans' },
          ],
        },
        {
          name: 'bodyFont',
          type: 'select',
          defaultValue: 'classic-serif',
          options: [
            { label: 'Classic Serif', value: 'classic-serif' },
            { label: 'Neutral Sans', value: 'neutral-sans' },
            { label: 'Humanist Sans', value: 'humanist-sans' },
          ],
        },
      ],
    },
  ],
}
