/**
 * Reads what the church blocks rendered. The integration's components mark
 * each block with `data-f42-block="<kind>"`, one card per record with the
 * record title in its `<h3>`, and a `role="status"` notice for deliberate
 * empty or unavailable states.
 */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#')
      return String.fromCodePoint(
        code[1].toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10),
      )
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

export function textContent(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function all(pattern, html) {
  return [...html.matchAll(pattern)]
}

/** Every church block on the page, in document order. */
export function churchBlocks(html) {
  return all(
    /<section\b([^>]*\bdata-f42-block="([a-z]+)"[^>]*)>([\s\S]*?)<\/section>/g,
    html,
  ).map(([, attributes, kind, inner]) => {
    const heading = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/.exec(inner)
    const notice =
      /<p\b[^>]*class="[^"]*\bf42-notice\b[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(
        inner,
      )
    const noticeClass = /<p\b[^>]*class="([^"]*\bf42-notice\b[^"]*)"/.exec(
      inner,
    )
    const next = /<a\b[^>]*href="([^"]*)"[^>]*rel="next"/.exec(inner)
    const first = /<a\b[^>]*href="([^"]*)"[^>]*>\s*First page\s*<\/a>/.exec(
      inner,
    )
    return {
      kind,
      heading: heading ? textContent(heading[2]) : null,
      headingId: heading
        ? (/\bid="([^"]*)"/.exec(heading[1])?.[1] ?? null)
        : null,
      labelledBy: /\baria-labelledby="([^"]*)"/.exec(attributes)?.[1] ?? null,
      titles: all(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g, inner).map(([, title]) =>
        textContent(title),
      ),
      links: all(/<h3\b[^>]*>\s*<a\b[^>]*href="([^"]*)"/g, inner).map(
        ([, href]) => decodeEntities(href),
      ),
      times: all(/<time\b[^>]*datetime="([^"]*)"/g, inner).map(
        ([, value]) => value,
      ),
      notice: notice ? textContent(notice[1]) : null,
      noticeTone: noticeClass
        ? noticeClass[1].includes('f42-notice--unavailable')
          ? 'unavailable'
          : 'empty'
        : null,
      nextHref: next ? decodeEntities(next[1]) : null,
      firstHref: first ? decodeEntities(first[1]) : null,
      text: textContent(inner),
    }
  })
}

export function blockOf(html, kind) {
  return churchBlocks(html).find((block) => block.kind === kind) ?? null
}

/** JSON-LD documents in the page head. */
export function jsonLd(html) {
  return all(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    html,
  ).flatMap(([, body]) => {
    try {
      return [JSON.parse(body)]
    } catch {
      return []
    }
  })
}
