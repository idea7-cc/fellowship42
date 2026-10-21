/**
 * A small HTTP client with its own cookie jar, standing in for one browser
 * profile (an anonymous visitor, the Administrator, or the Editor).
 */
export class Client {
  constructor(base, { headers = {}, label = 'client' } = {}) {
    this.base = base
    this.label = label
    this.headers = headers
    this.cookies = new Map()
  }

  get cookieHeader() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  #store(response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const index = pair.indexOf('=')
      if (index < 1) continue
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      const expired = attributes.some((attribute) => {
        const [key, raw = ''] = attribute.split('=')
        const k = key.trim().toLowerCase()
        if (k === 'max-age') return Number(raw) <= 0
        if (k === 'expires') return Date.parse(raw) <= Date.now()
        return false
      })
      if (expired || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async request(method, path, { json, headers = {}, timeoutMs = 30_000 } = {}) {
    const url = new URL(path, this.base)
    const merged = { ...this.headers, ...headers }
    if (this.cookies.size > 0) merged.cookie = this.cookieHeader
    let body
    if (json !== undefined) {
      merged['content-type'] = 'application/json'
      body = JSON.stringify(json)
    }
    const response = await fetch(url, {
      method,
      headers: merged,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    this.#store(response)
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      // Not JSON (HTML pages).
    }
    return {
      status: response.status,
      headers: response.headers,
      location: response.headers.get('location'),
      text,
      data,
    }
  }

  get(path, options) {
    return this.request('GET', path, options)
  }

  post(path, json, options = {}) {
    return this.request('POST', path, { ...options, json })
  }

  put(path, json, options = {}) {
    return this.request('PUT', path, { ...options, json })
  }

  patch(path, json, options = {}) {
    return this.request('PATCH', path, { ...options, json })
  }

  delete(path, json, options = {}) {
    return this.request('DELETE', path, { ...options, json })
  }
}

/** Throws with the response body when a request did not return `expected`. */
export function expectStatus(response, expected, what) {
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (!allowed.includes(response.status))
    throw new Error(
      `${what}: expected HTTP ${allowed.join(' or ')}, got ${response.status}: ${response.text.slice(0, 600)}`,
    )
  return response
}
