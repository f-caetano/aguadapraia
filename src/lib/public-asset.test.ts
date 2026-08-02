import { describe, expect, it } from 'vitest'
import { publicAssetUrl } from './public-asset'

describe('publicAssetUrl', () => {
  it('resolves root and nested-base assets', () => {
    expect(publicAssetUrl('/data/latest.json', '/')).toBe('/data/latest.json')
    expect(publicAssetUrl('/geo/districts.geojson', '/AguaDaPraia/')).toBe(
      '/AguaDaPraia/geo/districts.geojson',
    )
  })
})
