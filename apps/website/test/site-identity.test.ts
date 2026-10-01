import { describe, expect, it } from 'vitest'
import { composeTitle, siteIdentity } from '../src/lib/site-identity'

const church = {
  name: 'Grace Church',
  tagline: 'A place to belong and grow',
  logo: { url: 'https://app.example.org/media/logo.png', alt: '' },
}

const settings = {
  title: 'Typed in the EmDash wizard',
  tagline: 'A church for the whole city',
  logo: { url: '/_emdash/api/media/file/logo.svg', alt: 'EmDash logo' },
}

describe('site identity', () => {
  it('uses the connected church, never the EmDash copies', () => {
    expect(siteIdentity(church, settings)).toEqual({
      name: 'Grace Church',
      tagline: 'A place to belong and grow',
      logo: {
        url: 'https://app.example.org/media/logo.png',
        alt: 'Grace Church',
      },
    })
  })

  it('keeps a cleared church tagline or logo cleared', () => {
    expect(
      siteIdentity({ ...church, tagline: '', logo: null }, settings),
    ).toEqual({ name: 'Grace Church', tagline: '', logo: null })
  })

  it('falls back to EmDash site settings while church information is unavailable', () => {
    expect(siteIdentity(null, settings)).toEqual({
      name: 'Typed in the EmDash wizard',
      tagline: 'A church for the whole city',
      logo: { url: '/_emdash/api/media/file/logo.svg', alt: 'EmDash logo' },
    })
    expect(siteIdentity(null, { title: '  ', logo: { url: '' } })).toEqual({
      name: 'Our church',
      tagline: '',
      logo: null,
    })
    expect(siteIdentity(null, null).name).toBe('Our church')
  })
})

describe('document titles', () => {
  it('names the page once, then the site once', () => {
    expect(composeTitle('About', 'Grace Church')).toBe('About — Grace Church')
    expect(composeTitle('  Events ', 'Grace Church')).toBe(
      'Events — Grace Church',
    )
  })

  it('uses the site name alone on the home page', () => {
    expect(composeTitle(undefined, 'Grace Church')).toBe('Grace Church')
    expect(composeTitle(null, 'Grace Church')).toBe('Grace Church')
    expect(composeTitle('', 'Grace Church')).toBe('Grace Church')
  })

  it('does not repeat a site name the page title already contains', () => {
    expect(composeTitle('Grace Church', 'Grace Church')).toBe('Grace Church')
    expect(composeTitle('Visit grace church', 'Grace Church')).toBe(
      'Visit grace church',
    )
  })

  it('honours the separator chosen in EmDash SEO settings', () => {
    expect(composeTitle('About', 'Grace Church', ' | ')).toBe(
      'About | Grace Church',
    )
    expect(composeTitle('About', 'Grace Church', '')).toBe(
      'About — Grace Church',
    )
  })
})
