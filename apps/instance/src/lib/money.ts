/** Decimal places of a currency's amounts, or undefined for an unknown code. */
export function currencyDigits(currency: string) {
  try {
    return (
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return undefined
  }
}

export function formatMoney(amountMinor: number, currency: string) {
  const digits = currencyDigits(currency)
  if (digits === undefined) return `${amountMinor} ${currency}`
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountMinor / 10 ** digits)
}

export type ParsedAmount =
  { ok: true; amountMinor: number } | { ok: false; message: string }

/**
 * An amount as staff write it ("25", "19.99"), in the currency's smallest
 * unit (cents for USD). The text is read as digits, never through floating
 * point, so every accepted amount converts exactly. It accepts only digits
 * with an optional decimal point and no more decimal places than the
 * currency has. Thousands separators are refused rather than guessed at:
 * "1,000" could be a thousand or one, depending on the writer's locale. The
 * result must be a positive safe integer, which is what the API accepts.
 */
export function parseAmount(text: string, currency: string): ParsedAmount {
  const digits = currencyDigits(currency)
  if (digits === undefined)
    return {
      ok: false,
      message: 'Enter a three-letter currency code, such as USD.',
    }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim())
  if (!match)
    return {
      ok: false,
      message:
        'Enter the amount using digits and an optional decimal point, such as 1000.50, without commas or symbols.',
    }
  const [, whole, fraction = ''] = match
  if (fraction.length > digits)
    return {
      ok: false,
      message:
        digits === 0
          ? `${currency} amounts have no decimal places.`
          : `${currency} amounts have at most ${digits} decimal places.`,
    }
  const minor = BigInt(whole! + fraction.padEnd(digits, '0'))
  if (minor <= 0n) return { ok: false, message: 'Enter an amount above zero.' }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    return { ok: false, message: 'This amount is too large to record.' }
  return { ok: true, amountMinor: Number(minor) }
}
