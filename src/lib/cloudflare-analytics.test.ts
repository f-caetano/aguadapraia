import { describe, expect, it } from 'vitest'
import { installCloudflareAnalytics } from './cloudflare-analytics'

function fakeDocument() {
  const elements = new Map<string, HTMLScriptElement>()
  const documentRef = {
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: () => ({
      id: '',
      type: '',
      src: '',
      dataset: {},
    }),
    head: {
      append: (script: HTMLScriptElement) => {
        elements.set(script.id, script)
      },
    },
  }
  return documentRef as unknown as Document
}

describe('installCloudflareAnalytics', () => {
  it('does not install without a token', () => {
    expect(installCloudflareAnalytics('', fakeDocument())).toBeNull()
  })

  it('installs one module beacon with the configured public token', () => {
    const documentRef = fakeDocument()
    const script = installCloudflareAnalytics(' site-token ', documentRef)

    expect(script).toMatchObject({
      id: 'cloudflare-web-analytics',
      type: 'module',
      src: 'https://static.cloudflareinsights.com/beacon.min.js',
    })
    expect(script?.dataset.cfBeacon).toBe('{"token":"site-token"}')
    expect(installCloudflareAnalytics('site-token', documentRef)).toBeNull()
  })
})
