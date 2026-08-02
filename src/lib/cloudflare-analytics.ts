const SCRIPT_ID = 'cloudflare-web-analytics'

export function installCloudflareAnalytics(
  token: string | undefined,
  documentRef: Document = document,
): HTMLScriptElement | null {
  const normalizedToken = token?.trim()
  if (!normalizedToken || documentRef.getElementById(SCRIPT_ID)) return null

  const script = documentRef.createElement('script')
  script.id = SCRIPT_ID
  script.type = 'module'
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.dataset.cfBeacon = JSON.stringify({ token: normalizedToken })
  documentRef.head.append(script)
  return script
}
