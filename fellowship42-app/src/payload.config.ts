import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Churches } from './collections/Churches'
import { Contributions } from './collections/Contributions'
import { AttendanceRecords } from './collections/AttendanceRecords'
import { CourseEnrollments } from './collections/CourseEnrollments'
import { Courses } from './collections/Courses'
import { Events } from './collections/Events'
import { Facilities } from './collections/Facilities'
import { GroupMemberships } from './collections/GroupMemberships'
import { GroupSessions } from './collections/GroupSessions'
import { Groups } from './collections/Groups'
import { LandingPages } from './collections/LandingPages'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Ministries } from './collections/Ministries'
import { People } from './collections/People'
import { Sermons } from './collections/Sermons'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Churches,
    LandingPages,
    Ministries,
    Groups,
    GroupMemberships,
    GroupSessions,
    AttendanceRecords,
    Courses,
    CourseEnrollments,
    Events,
    Sermons,
    Facilities,
    People,
    Contributions,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
