import { describe, expect, it } from 'vitest'
import { parseAmount } from '../../src/lib/money'

describe('parseAmount', () => {
  it.each([
    ['USD', '0.29', 29],
    ['USD', '19.99', 1999],
    ['USD', '25', 2500],
    ['USD', '25.5', 2550],
    ['USD', ' 7.00 ', 700],
    ['JPY', '500', 500],
    ['KWD', '1.234', 1234],
    ['USD', '90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('reads %s %s as %i minor units', (currency, text, amountMinor) => {
    expect(parseAmount(text, currency)).toEqual({ ok: true, amountMinor })
  })

  it.each([
    ['USD', '1.005', /at most 2 decimal places/],
    ['USD', '0.290000001', /at most 2 decimal places/],
    ['USD', '1e3', /digits and an optional decimal point/],
    ['USD', '1,000.50', /without commas/],
    ['USD', '-5', /digits and an optional decimal point/],
    ['USD', '', /digits and an optional decimal point/],
    ['USD', '.50', /digits and an optional decimal point/],
    ['USD', '0', /above zero/],
    ['USD', '0.00', /above zero/],
    ['JPY', '500.5', /no decimal places/],
    ['KWD', '1.2345', /at most 3 decimal places/],
    // One cent past the largest whole number of cents JavaScript holds.
    ['USD', '90071992547409.92', /too large/],
    ['XYZ1', '5', /three-letter currency code/],
  ])('refuses %s %j', (currency, text, message) => {
    const parsed = parseAmount(text, currency)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toMatch(message)
  })

  it('does not round a value that floating point would get wrong', () => {
    // 90071992547409.90 * 100 is 9007199254740991 in floating point.
    expect(parseAmount('90071992547409.90', 'USD')).toEqual({
      ok: true,
      amountMinor: 9007199254740990,
    })
  })
})
