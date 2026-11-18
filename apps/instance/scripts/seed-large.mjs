// Adds a larger, deterministic synthetic dataset on top of `pnpm db:seed`, so
// lists and pickers can be exercised past their first page. Local state only:
// it writes through Wrangler's local platform proxy (the same `.wrangler/state`
// that `pnpm dev` reads) and never touches a remote database or bucket.
//
// Every name is invented and every address uses example.test. Re-running it is
// safe: rows are inserted with OR IGNORE and objects are overwritten in place.
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const CHURCH = 'church_demo'
const BASE = Date.UTC(2026, 0, 1)
const DAY = 86_400_000
const pad = (value) => String(value).padStart(3, '0')

const firstNames = [
  'Avery',
  'Briar',
  'Cove',
  'Dell',
  'Ember',
  'Fable',
  'Garnet',
  'Harbor',
  'Iris',
  'Juniper',
  'Kestrel',
  'Lark',
  'Marlow',
  'Nettle',
  'Oriel',
  'Pell',
  'Quill',
  'Rowan',
  'Sorrel',
  'Tamsin',
  'Umber',
  'Vesper',
  'Wren',
  'Yarrow',
  'Zephyr',
]
const lastNames = [
  'Ashgrove',
  'Brindlewood',
  'Cinderfell',
  'Dovecote',
  'Elmsworth',
  'Fernhollow',
  'Glimmerby',
  'Hollowmere',
  'Inkwell',
  'Juniperton',
]
const people = Array.from({ length: 250 }, (_, index) => {
  const number = index + 1
  const first = firstNames[index % firstNames.length]
  const last = `${lastNames[Math.floor(index / firstNames.length)]}`
  return {
    id: `person_large_${pad(number)}`,
    first,
    last,
    email: `${first}.${last}.${pad(number)}@example.test`.toLowerCase(),
    status: ['member', 'regular-attender', 'guest', 'volunteer'][index % 4],
  }
})

const statements = []
const add = (sql, ...bindings) => statements.push({ sql, bindings })

for (const [index, person] of people.entries()) {
  add(
    `INSERT OR IGNORE INTO people (id, church_id, first_name, last_name, sort_name,
       email, phone, membership_status, volunteer_ready, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)`,
    person.id,
    CHURCH,
    person.first,
    person.last,
    `${person.last}, ${person.first}`,
    person.email,
    person.status,
    index % 3 === 0 ? 1 : 0,
    BASE + index,
    BASE + index,
  )
}

// 100 households of two or three people; the address is fictional.
for (let household = 0; household < 100; household += 1) {
  const id = `household_large_${pad(household + 1)}`
  const members = people.slice(
    Math.floor((household * 250) / 100),
    Math.floor(((household + 1) * 250) / 100),
  )
  add(
    `INSERT OR IGNORE INTO households (id, church_id, name, street, city, region,
       postal_code, country_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Exampleton', 'EX', '00000', 'US', ?, ?)`,
    id,
    CHURCH,
    `${members[0].last} Household ${pad(household + 1)}`,
    `${household + 1} Sample Lane`,
    BASE,
    BASE,
  )
  for (const [position, person] of members.entries()) {
    add(
      `INSERT OR IGNORE INTO household_people (church_id, household_id, person_id,
         relationship, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      CHURCH,
      id,
      person.id,
      position === 0 ? 'other' : position === 1 ? 'spouse' : 'child',
      position === 0 ? 1 : 0,
      BASE,
    )
  }
}

const funds = ['General', 'Missions', 'Building', 'Benevolence']
for (let index = 0; index < 150; index += 1) {
  const person = people[(index * 7) % people.length]
  add(
    `INSERT OR IGNORE INTO contributions (id, church_id, person_id, donor_name,
       amount_minor, currency, fund, payment_method, status, recurring, provider,
       provider_payment_id, donated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    `contribution_large_${pad(index + 1)}`,
    CHURCH,
    person.id,
    `${person.first} ${person.last}`,
    1000 + ((index * 1373) % 50000),
    funds[index % funds.length],
    index % 2 ? 'check' : 'cash',
    index % 17 === 0 ? 'refunded' : 'succeeded',
    index % 5 === 0 ? 1 : 0,
    BASE - index * DAY,
    BASE,
    BASE,
  )
}

// Rosters over 100: capacity limits only active members, so the capped group
// holds its overflow as interested.
const groups = [
  {
    slug: 'large-sample-choir',
    title: 'Large Sample Choir',
    capacity: null,
    members: 130,
    active: 130,
  },
  {
    slug: 'large-sample-supper-club',
    title: 'Large Sample Supper Club',
    capacity: 150,
    members: 115,
    active: 100,
  },
  {
    slug: 'large-sample-prayer-circle',
    title: 'Large Sample Prayer Circle',
    capacity: 30,
    members: 105,
    active: 30,
  },
]
for (const [groupIndex, group] of groups.entries()) {
  const id = `group_large_${groupIndex + 1}`
  add(
    `INSERT OR IGNORE INTO groups (id, church_id, ministry_id, slug, title, status,
       group_type, audience, schedule, location, enrollment_policy, capacity,
       featured, summary, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'published', 'small-group', 'Adults', 'Sundays at 5:00 PM',
       'Sample Hall', 'open', ?, 0, 'A synthetic group with a large roster.', ?, ?)`,
    id,
    CHURCH,
    group.slug,
    group.title,
    group.capacity,
    BASE,
    BASE,
  )
  for (let index = 0; index < group.members; index += 1) {
    const person = people[(index + groupIndex * 40) % people.length]
    const active = index < group.active
    add(
      `INSERT OR IGNORE INTO group_memberships (id, church_id, group_id, person_id,
         status, joined_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      `groupmember_large_${groupIndex + 1}_${pad(index + 1)}`,
      CHURCH,
      id,
      person.id,
      active ? 'active' : 'interested',
      active ? BASE : null,
      BASE,
      BASE,
    )
  }
}

// Media rows each get a small, real object, so Open, playback and pickers work.
function wav() {
  const samples = 800
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (offset, value) =>
    [...value].forEach((char, i) =>
      view.setUint8(offset + i, char.charCodeAt(0)),
    )
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  return bytes
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const pdf = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
)
const kinds = [
  {
    mediaType: 'audio',
    contentType: 'audio/wav',
    bytes: wav(),
    label: 'Sample sermon recording',
  },
  {
    mediaType: 'image',
    contentType: 'image/png',
    bytes: png,
    label: 'Sample photo',
  },
  {
    mediaType: 'document',
    contentType: 'application/pdf',
    bytes: pdf,
    label: 'Sample handout',
  },
]
const objects = []
for (let index = 0; index < 150; index += 1) {
  const kind = kinds[index % kinds.length]
  const id = `media_large_${pad(index + 1)}`
  const key = `churches/${CHURCH}/media/${id}`
  const checksum = createHash('sha256').update(kind.bytes).digest('hex')
  objects.push({ key, kind, checksum })
  add(
    `INSERT OR IGNORE INTO media (id, church_id, r2_key, media_type, content_type,
       byte_size, checksum, alt_text, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    CHURCH,
    key,
    kind.mediaType,
    kind.contentType,
    kind.bytes.byteLength,
    checksum,
    `${kind.label} ${pad(index + 1)}`,
    index % 4 === 3 ? 'private' : 'public',
    BASE + index * 60_000,
    BASE,
  )
}

// Durable Object and Queue bindings are irrelevant here; keep their warnings out.
process.env.WRANGLER_LOG ??= 'error'
const { getPlatformProxy } = await import('wrangler')
const proxy = await getPlatformProxy({
  configPath: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
})
try {
  const { DB, MEDIA } = proxy.env
  const church = await DB.prepare(
    'SELECT 1 AS present FROM churches WHERE id = ?',
  )
    .bind(CHURCH)
    .first()
  if (!church) {
    throw new Error(
      'Run `pnpm db:migrate && pnpm db:seed` before the large seed.',
    )
  }
  for (const { key, kind, checksum } of objects) {
    await MEDIA.put(key, kind.bytes, {
      httpMetadata: {
        contentType: kind.contentType,
        contentDisposition:
          kind.contentType === 'application/pdf' ? 'attachment' : 'inline',
        cacheControl: 'public, max-age=300, must-revalidate',
      },
      customMetadata: { checksumSha256: checksum },
    })
  }
  for (let start = 0; start < statements.length; start += 100) {
    await DB.batch(
      statements
        .slice(start, start + 100)
        .map(({ sql, bindings }) => DB.prepare(sql).bind(...bindings)),
    )
  }
  console.log(
    'Large seed added: 250 people in 100 households, 150 contributions, ' +
      '3 groups with rosters over 100, 150 media files.',
  )
} finally {
  await proxy.dispose()
}
