import { describe, expect, it } from 'vitest'
import { isPrivateHost } from './hosts'

/** The hostname a URL parser produces, as the connection checks it. */
const host = (url: string) => new URL(url).hostname

describe('private hosts', () => {
  it.each([
    // IPv4: loopback, private, link-local, CGNAT, unspecified
    'http://127.0.0.1:8787',
    'http://127.1',
    'http://2130706433',
    'http://0x7f.0.0.1',
    'http://10.1.2.3',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.1.10',
    'http://169.254.169.254',
    'http://100.64.0.1',
    'http://100.127.255.255',
    'http://0.0.0.0',
    'http://0',
    // IPv6: loopback, unspecified, link-local, unique local, mapped IPv4
    'http://[::1]',
    'http://[::]',
    'http://[fe80::1]',
    'http://[fc00::1]',
    'http://[fd12:3456::1]',
    'http://[::ffff:127.0.0.1]',
    'http://[::ffff:10.0.0.1]',
    'http://[::ffff:169.254.169.254]',
    'http://[64:ff9b::a9fe:a9fe]',
    // Reserved names
    'http://localhost:5173',
    'http://LOCALHOST.',
    'http://www.localhost:4322',
    'http://church.local',
    'http://metadata.google.internal',
    'http://app.internal.',
  ])('refuses %s', (url) => {
    expect(isPrivateHost(host(url))).toBe(true)
  })

  it.each([
    'https://app.example.org',
    'https://8.8.8.8',
    'https://100.63.255.255',
    'https://100.128.0.1',
    'https://172.15.255.255',
    'https://172.32.0.1',
    'https://192.169.0.1',
    'https://169.255.0.1',
    'https://[2606:4700:4700::1111]',
    'https://[::ffff:8.8.8.8]',
    'https://localhost.example.org',
    'https://internal.example.org',
    'https://local.example',
  ])('allows %s', (url) => {
    expect(isPrivateHost(host(url))).toBe(false)
  })
})
