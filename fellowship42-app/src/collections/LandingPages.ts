import type { Block, CollectionConfig } from 'payload'

import { churchScopedAccess, publicPublishedContentAccess } from '@/access/helpers'
import { slugField } from '@/fields/slug'
import { getAppBaseURL } from '@/lib/landing-page-urls'

const blockFields: Block[] = [
  {
    slug: 'hero',
    labels: {
      plural: 'Hero Blocks',
      singular: 'Hero Block',
    },
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
      },
      {
        name: 'headline',
        type: 'text',
        required: true,
      },
      {
        name: 'body',
        type: 'textarea',
      },
      {
        name: 'primaryLabel',
        type: 'text',
      },
      {
        name: 'primaryHref',
        type: 'text',
      },
      {
        name: 'secondaryLabel',
        type: 'text',
      },
      {
        name: 'secondaryHref',
        type: 'text',
      },
    ],
  },
  {
    slug: 'copy',
    labels: {
      plural: 'Copy Blocks',
      singular: 'Copy Block',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'body',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    slug: 'featureList',
    labels: {
      plural: 'Feature Lists',
      singular: 'Feature List',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'intro',
        type: 'textarea',
      },
      {
        name: 'items',
        type: 'array',
        minRows: 1,
        fields: [
          {
            name: 'title',
            type: 'text',
            required: true,
          },
          {
            name: 'body',
            type: 'textarea',
            required: true,
          },
        ],
      },
    ],
  },
  {
    slug: 'testimonials',
    labels: {
      plural: 'Testimonials',
      singular: 'Testimonial Section',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'intro',
        type: 'textarea',
      },
      {
        name: 'items',
        type: 'array',
        minRows: 1,
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
          },
          {
            name: 'role',
            type: 'text',
          },
          {
            name: 'quote',
            type: 'textarea',
            required: true,
          },
        ],
      },
    ],
  },
  {
    slug: 'leaderCards',
    labels: {
      plural: 'Leader Card Sections',
      singular: 'Leader Card Section',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'intro',
        type: 'textarea',
      },
      {
        name: 'leaders',
        type: 'relationship',
        relationTo: 'people',
        hasMany: true,
        required: true,
      },
    ],
  },
  {
    slug: 'signupForm',
    labels: {
      plural: 'Signup Blocks',
      singular: 'Signup Block',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'body',
        type: 'textarea',
      },
      {
        name: 'formType',
        type: 'select',
        defaultValue: 'contact-team',
        options: [
          { label: 'Join group', value: 'join-group' },
          { label: 'Start course', value: 'start-course' },
          { label: 'Plan visit', value: 'plan-visit' },
          { label: 'Volunteer interest', value: 'volunteer-interest' },
          { label: 'Contact team', value: 'contact-team' },
          { label: 'External link', value: 'external-link' },
        ],
        required: true,
      },
      {
        name: 'buttonLabel',
        type: 'text',
        required: true,
      },
      {
        name: 'buttonHref',
        type: 'text',
        required: true,
      },
      {
        name: 'emailDestination',
        type: 'email',
      },
      {
        name: 'helperText',
        type: 'textarea',
      },
    ],
  },
  {
    slug: 'cta',
    labels: {
      plural: 'CTA Blocks',
      singular: 'CTA Block',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'body',
        type: 'textarea',
      },
      {
        name: 'label',
        type: 'text',
        required: true,
      },
      {
        name: 'href',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    slug: 'faq',
    labels: {
      plural: 'FAQ Blocks',
      singular: 'FAQ Block',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'questions',
        type: 'array',
        minRows: 1,
        fields: [
          {
            name: 'question',
            type: 'text',
            required: true,
          },
          {
            name: 'answer',
            type: 'textarea',
            required: true,
          },
        ],
      },
    ],
  },
  {
    slug: 'relatedFeed',
    labels: {
      plural: 'Related Feed Blocks',
      singular: 'Related Feed Block',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
      },
      {
        name: 'intro',
        type: 'textarea',
      },
      {
        name: 'feedType',
        type: 'select',
        options: [
          { label: 'Groups', value: 'groups' },
          { label: 'Courses', value: 'courses' },
          { label: 'Events', value: 'events' },
          { label: 'Sermons', value: 'sermons' },
        ],
        required: true,
      },
      {
        name: 'scope',
        type: 'select',
        defaultValue: 'church',
        options: [
          { label: 'Church wide', value: 'church' },
          { label: 'Same ministry', value: 'ministry' },
        ],
        required: true,
      },
      {
        name: 'limit',
        type: 'number',
        defaultValue: 3,
        max: 6,
        min: 1,
      },
    ],
  },
]

export const LandingPages: CollectionConfig = {
  slug: 'landing-pages',
  admin: {
    defaultColumns: ['title', 'pageType', 'church', 'status', 'slug'],
    preview: (doc) => (doc?.id ? `${getAppBaseURL()}/preview/landing-page?pageID=${String(doc.id)}` : null),
    useAsTitle: 'title',
  },
  access: {
    create: churchScopedAccess(['super-admin', 'church-admin', 'content-editor', 'ministry-leader']),
    delete: churchScopedAccess(['super-admin', 'church-admin', 'content-editor']),
    read: publicPublishedContentAccess,
    update: churchScopedAccess(['super-admin', 'church-admin', 'content-editor', 'ministry-leader']),
  },
  fields: [
    {
      name: 'church',
      type: 'relationship',
      relationTo: 'churches',
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField(),
    {
      name: 'pageLinks',
      type: 'ui',
      admin: {
        components: {
          Field: './components/admin/LandingPageDocumentLinks#LandingPageDocumentLinks',
        },
        disableListColumn: true,
        position: 'sidebar',
      },
      label: '',
    },
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
      name: 'pageType',
      type: 'select',
      defaultValue: 'ministry',
      options: [
        { label: 'Ministry Landing Page', value: 'ministry' },
        { label: 'Group Landing Page', value: 'group' },
        { label: 'Course Landing Page', value: 'course' },
      ],
      required: true,
    },
    {
      name: 'ministry',
      type: 'relationship',
      relationTo: 'ministries',
      admin: {
        condition: (_, siblingData) => siblingData.pageType === 'ministry',
      },
    },
    {
      name: 'group',
      type: 'relationship',
      relationTo: 'groups',
      admin: {
        condition: (_, siblingData) => siblingData.pageType === 'group',
      },
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      admin: {
        condition: (_, siblingData) => siblingData.pageType === 'course',
      },
    },
    {
      name: 'themeMode',
      type: 'select',
      defaultValue: 'inherit',
      options: [
        { label: 'Inherit Church Theme', value: 'inherit' },
        { label: 'Custom Theme Overrides', value: 'custom' },
      ],
      required: true,
    },
    {
      name: 'themeOverrides',
      type: 'group',
      admin: {
        condition: (_, siblingData) => siblingData.themeMode === 'custom',
      },
      fields: [
        {
          name: 'accent',
          type: 'text',
        },
        {
          name: 'surface',
          type: 'text',
        },
        {
          name: 'ink',
          type: 'text',
        },
        {
          name: 'heroTone',
          type: 'select',
          options: [
            { label: 'Warm', value: 'warm' },
            { label: 'Calm', value: 'calm' },
            { label: 'Bold', value: 'bold' },
          ],
        },
      ],
    },
    {
      name: 'seoDescription',
      type: 'textarea',
    },
    {
      name: 'blocks',
      type: 'blocks',
      blocks: blockFields,
    },
  ],
}
