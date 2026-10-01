import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../worker'

const path = '/media/media_range_probe'
const bytes = '0123456789'

async function get(headers: Record<string, string> = {}, method = 'GET') {
  const ctx = createExecutionContext()
  const response = await worker.fetch(
    new Request(`https://app.example.test${path}`, {
      method,
      headers,
    }) as Request<unknown, IncomingRequestCfProperties>,
    env as unknown as Env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  const body = new TextDecoder().decode(await response.arrayBuffer())
  return { status: response.status, headers: response.headers, body }
}

let etag: string = ''
let uploaded: Date = new Date()

beforeAll(async () => {
  const object = await env.MEDIA.put('test/range-probe', bytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
  })
  etag = object.httpEtag
  uploaded = object.uploaded
  await env.DB.prepare(
    `INSERT OR REPLACE INTO media (id, church_id, r2_key, media_type, content_type, byte_size, alt_text, visibility, created_at, updated_at)
     VALUES ('media_range_probe', 'church_demo', 'test/range-probe', 'document', 'application/pdf', 10, '', 'public', 1, 1)`,
  ).run()
})

const past = (): string =>
  new Date(uploaded.getTime() - 86_400_000).toUTCString()
const future = (): string =>
  new Date(uploaded.getTime() + 86_400_000).toUTCString()

describe('public media conditional requests (RFC 9110 §13)', () => {
  it('serves the whole object to a plain GET', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.body).toBe(bytes)
    expect(response.headers.get('ETag')).toBe(etag)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Range')).toBeNull()
  })

  it('answers HEAD with headers only', async () => {
    const full = await get({}, 'HEAD')
    expect(full.status).toBe(200)
    expect(full.body).toBe('')
    expect(full.headers.get('ETag')).toBe(etag)
    expect(full.headers.get('Content-Type')).toBe('application/pdf')
    const partial = await get({ Range: 'bytes=0-3' }, 'HEAD')
    expect(partial.status).toBe(206)
    expect(partial.body).toBe('')
    expect(partial.headers.get('Content-Range')).toBe('bytes 0-3/10')
  })

  const cases: [string, Record<string, () => string>, number][] = [
    ['a matching If-None-Match', { 'If-None-Match': () => etag }, 304],
    [
      'a weakly matching If-None-Match',
      { 'If-None-Match': () => `"other", W/${etag}` },
      304,
    ],
    ['If-None-Match: *', { 'If-None-Match': () => '*' }, 304],
    ['a different If-None-Match', { 'If-None-Match': () => '"other"' }, 200],
    ['a failed If-Match', { 'If-Match': () => '"other"' }, 412],
    ['a weak If-Match', { 'If-Match': () => `W/${etag}` }, 412],
    ['If-Match: *', { 'If-Match': () => '*' }, 200],
    ['a matching If-Match', { 'If-Match': () => etag }, 200],
    [
      'a matching If-Match and a matching If-None-Match',
      { 'If-Match': () => etag, 'If-None-Match': () => etag },
      304,
    ],
    [
      'a failed If-Match and a matching If-None-Match',
      { 'If-Match': () => '"other"', 'If-None-Match': () => etag },
      412,
    ],
    [
      'If-Unmodified-Since before the upload',
      { 'If-Unmodified-Since': past },
      412,
    ],
    [
      'If-Unmodified-Since before the upload with a matching If-Match',
      { 'If-Match': () => etag, 'If-Unmodified-Since': past },
      200,
    ],
    [
      'If-Modified-Since after the upload',
      { 'If-Modified-Since': future },
      304,
    ],
    ['If-Modified-Since before the upload', { 'If-Modified-Since': past }, 200],
    [
      'If-Modified-Since after the upload with a different If-None-Match',
      { 'If-None-Match': () => '"other"', 'If-Modified-Since': future },
      200,
    ],
    [
      'an invalid If-Modified-Since',
      { 'If-Modified-Since': () => 'soon' },
      200,
    ],
    [
      'a matching If-None-Match with a Range',
      { 'If-None-Match': () => etag, Range: () => 'bytes=0-3' },
      304,
    ],
  ]
  it.each(cases)(
    'answers %s as RFC 9110 requires',
    async (_, headers, status) => {
      const response = await get(
        Object.fromEntries(
          Object.entries(headers).map(([name, value]) => [name, value()]),
        ),
      )
      expect(response.status).toBe(status)
      if (status === 304) {
        expect(response.body).toBe('')
        expect(response.headers.get('ETag')).toBe(etag)
      }
      if (status === 412) expect(response.body).toBe('')
      if (status === 200) expect(response.body).toBe(bytes)
    },
  )
})

describe('public media ranges (RFC 9110 §14)', () => {
  it.each([
    ['bytes=0-3', '0123', 'bytes 0-3/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=8-100', '89', 'bytes 8-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=-30', bytes, 'bytes 0-9/10'],
    ['Bytes=2-2', '2', 'bytes 2-2/10'],
  ])('serves %s as a partial response', async (range, body, contentRange) => {
    const response = await get({ Range: range })
    expect(response.status).toBe(206)
    expect(response.body).toBe(body)
    expect(response.headers.get('Content-Range')).toBe(contentRange)
  })

  it.each([
    'items=0-1',
    'bytes=abc',
    'bytes=-',
    'bytes=5-2',
    'bytes=0-1,4-5',
    'bytes 0-1',
  ])(
    'ignores the unusable range %s and sends the whole object',
    async (range) => {
      const response = await get({ Range: range })
      expect(response.status).toBe(200)
      expect(response.body).toBe(bytes)
      expect(response.headers.get('Content-Range')).toBeNull()
    },
  )

  it.each(['bytes=100-200', 'bytes=10-', 'bytes=-0'])(
    'refuses the unsatisfiable range %s with 416',
    async (range) => {
      const response = await get({ Range: range })
      expect(response.status).toBe(416)
      expect(response.body).toBe('')
      expect(response.headers.get('Content-Range')).toBe('bytes */10')
    },
  )

  it('honours a range only while If-Range names the current object', async () => {
    const current = await get({ Range: 'bytes=0-3', 'If-Range': etag })
    expect(current.status).toBe(206)
    expect(current.body).toBe('0123')
    for (const ifRange of ['"stale"', `W/${etag}`, future()]) {
      const response = await get({ Range: 'bytes=0-3', 'If-Range': ifRange })
      expect(response.status).toBe(200)
      expect(response.body).toBe(bytes)
      expect(response.headers.get('Content-Range')).toBeNull()
    }
  })
})
