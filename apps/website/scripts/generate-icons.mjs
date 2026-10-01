// Writes the website's default icons to public/: favicon.svg, favicon.ico
// (16, 32, and 48 px), and apple-touch-icon.png (180 px). Static assets are
// served without running the Worker, so browsers' automatic icon requests
// never render a page. A church replaces them by setting a favicon in
// EmDash's site settings.
//
//   node apps/website/scripts/generate-icons.mjs
//
// The mark is an arched window on the classic preset's deep blue. Raster
// sizes are drawn from the same geometry with 4x4 supersampling, using only
// Node's zlib, so the output is reproducible without image tooling.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BACKGROUND = [0x1d, 0x34, 0x59]
const FOREGROUND = [0xff, 0xff, 0xff]
// Geometry in a 32-unit square.
const CORNER = 7
const STROKE = 3
const ARCH = { left: 10, right: 22, top: 14.5, bottom: 23.5 }
const ARCH_CENTER = (ARCH.left + ARCH.right) / 2
const ARCH_RADIUS = (ARCH.right - ARCH.left) / 2

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${CORNER}" fill="#1d3459"/>
  <path d="M${ARCH.left} ${ARCH.bottom}V${ARCH.top}a${ARCH_RADIUS} ${ARCH_RADIUS} 0 0 1 ${ARCH.right - ARCH.left} 0V${ARCH.bottom}Z" fill="none" stroke="#fff" stroke-width="${STROKE}" stroke-linejoin="round"/>
</svg>
`

function insideRoundedSquare(x, y) {
  const cx = Math.min(Math.max(x, CORNER), 32 - CORNER)
  const cy = Math.min(Math.max(y, CORNER), 32 - CORNER)
  return (x - cx) ** 2 + (y - cy) ** 2 <= CORNER ** 2
}

function distanceToSegment(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(
    0,
    Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)),
  )
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function onArchStroke(x, y) {
  const { left, right, top, bottom } = ARCH
  const distances = [
    distanceToSegment(x, y, [left, bottom], [left, top]),
    distanceToSegment(x, y, [right, bottom], [right, top]),
    distanceToSegment(x, y, [left, bottom], [right, bottom]),
  ]
  if (y <= top)
    distances.push(Math.abs(Math.hypot(x - ARCH_CENTER, y - top) - ARCH_RADIUS))
  return Math.min(...distances) <= STROKE / 2
}

function render(size, rounded) {
  const samples = 4
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0
      let light = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((px + (sx + 0.5) / samples) * 32) / size
          const y = ((py + (sy + 0.5) / samples) * 32) / size
          if (rounded && !insideRoundedSquare(x, y)) continue
          covered++
          if (onArchStroke(x, y)) light++
        }
      }
      const offset = (py * size + px) * 4
      const mix = covered ? light / covered : 0
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = Math.round(
          BACKGROUND[channel] +
            (FOREGROUND[channel] - BACKGROUND[channel]) * mix,
        )
      pixels[offset + 3] = Math.round((covered / samples ** 2) * 255)
    }
  }
  return pixels
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, rounded = true) {
  const pixels = render(size, rounded)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++)
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** An ICO whose entries are PNG images, as every current browser accepts. */
function ico(sizes) {
  const images = sizes.map((size) => png(size))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map((image, index) => {
    const entry = Buffer.alloc(16)
    entry[0] = sizes[index]
    entry[1] = sizes[index]
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(image.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += image.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images])
}

const publicDir = new URL('../public/', import.meta.url)
writeFileSync(new URL('favicon.svg', publicDir), svg)
writeFileSync(new URL('favicon.ico', publicDir), ico([16, 32, 48]))
// iOS rounds the corners itself and shows transparency as black.
writeFileSync(new URL('apple-touch-icon.png', publicDir), png(180, false))
