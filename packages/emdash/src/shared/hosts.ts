/**
 * Hosts a connection from plugin settings must not reach. An Administrator
 * types that address, and the website's server fetches it, so a local or
 * private target would turn the status page into a probe of the server's
 * own network. Only literal addresses and reserved names are recognized;
 * resolving DNS is the runtime's job (Cloudflare Workers cannot reach
 * private networks at all).
 */

const RESERVED_NAMES = ['localhost']
const RESERVED_SUFFIXES = ['.localhost', '.local', '.internal']

/** IPv4 ranges: unspecified, private, CGNAT, loopback, link-local. */
const PRIVATE_IPV4: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8, including the unspecified address
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10 (carrier-grade NAT)
  [0x7f000000, 8], // 127.0.0.0/8 (loopback)
  [0xa9fe0000, 16], // 169.254.0.0/16 (link-local, cloud metadata)
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0a80000, 16], // 192.168.0.0/16
]

function parseIpv4(host: string): number | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function privateIpv4(address: number) {
  return PRIVATE_IPV4.some(
    ([network, bits]) =>
      Math.floor(address / 2 ** (32 - bits)) ===
      Math.floor(network / 2 ** (32 - bits)),
  )
}

/**
 * Eight 16-bit groups, or null when `host` is not an IPv6 literal in the
 * form URL parsing produces (hex groups, at most one `::`).
 */
function parseIpv6(host: string): number[] | null {
  const halves = host.split('::')
  if (halves.length > 2) return null
  const groups = (part: string) => (part === '' ? [] : part.split(':'))
  const head = groups(halves[0]!)
  const rest = halves.length === 2 ? groups(halves[1]!) : []
  const pieces = [...head, ...rest]
  if (pieces.some((piece) => !/^[0-9a-f]{1,4}$/.test(piece))) return null
  if (halves.length === 1 ? pieces.length !== 8 : pieces.length > 7) return null
  return [
    ...head,
    ...new Array<string>(8 - pieces.length).fill('0'),
    ...rest,
  ].map((piece) => parseInt(piece, 16))
}

function privateIpv6(groups: number[]) {
  const [first = 0] = groups
  // fc00::/7 (unique local), fe80::/10 (link-local), fec0::/10 (site-local)
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return true
  const embedded = groups[6]! * 0x10000 + groups[7]!
  const prefix = groups.slice(0, 6)
  // ::/96 covers :: (unspecified) and ::1 (loopback); ::ffff:0:0/96 is
  // IPv4-mapped; 64:ff9b::/96 is NAT64. Each embeds an IPv4 address.
  const zeroPrefix = prefix.every((value) => value === 0)
  const mapped =
    prefix.slice(0, 5).every((value) => value === 0) && prefix[5] === 0xffff
  const nat64 =
    prefix[0] === 0x64 &&
    prefix[1] === 0xff9b &&
    prefix.slice(2).every((value) => value === 0)
  if (zeroPrefix || mapped || nat64) return privateIpv4(embedded)
  return false
}

/**
 * True for a loopback, private, link-local, carrier-grade NAT, or
 * unspecified IP literal, and for `localhost`, `*.localhost`, `*.local`,
 * and `*.internal`. `hostname` is a URL hostname (IPv6 in brackets).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, '')
  if (host.startsWith('[') && host.endsWith(']')) {
    const groups = parseIpv6(host.slice(1, -1))
    return groups === null || privateIpv6(groups)
  }
  const v4 = parseIpv4(host)
  if (v4 !== null) return privateIpv4(v4)
  return (
    RESERVED_NAMES.includes(host) ||
    RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  )
}
