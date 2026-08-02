function validTimestamp(value: string) {
  const timestamp = new Date(value)
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`Invalid forecast timestamp: ${value}`)
  }
  return timestamp
}

export function formatFreshnessTimestamp(
  generatedAt: string,
  _language: 'pt' | 'en',
): string {
  const timestamp = validTimestamp(generatedAt)
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Lisbon',
  }).formatToParts(timestamp)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  const year = value('year')
  const month = value('month')
  const day = value('day')
  const hour = value('hour')
  if (!year || !month || !day || !hour) {
    throw new Error(`Unable to format forecast timestamp: ${generatedAt}`)
  }
  return `${year}-${month}-${day} ${hour}H`
}
