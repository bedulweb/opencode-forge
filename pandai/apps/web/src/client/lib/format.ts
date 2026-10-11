const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export function usd(n: number): string {
  return fmt.format(n)
}

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' })

export function ago(iso: string, now = Date.now()): string {
  const min = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')
  const h = Math.round(min / 60)
  if (Math.abs(h) < 48) return rtf.format(h, 'hour')
  return rtf.format(Math.round(h / 24), 'day')
}
