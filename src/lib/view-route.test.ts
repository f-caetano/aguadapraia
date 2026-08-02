import { describe, expect, it } from 'vitest'
import {
  canonicalUrlForView,
  pathForView,
  viewFromPath,
} from './view-route'

describe('view routes', () => {
  it.each([
    ['map', '/'],
    ['table', '/tabela'],
    ['evolution', '/evolucao'],
  ] as const)('maps %s to %s', (view, path) => {
    expect(pathForView(view)).toBe(path)
    expect(viewFromPath(path)).toBe(view)
  })

  it('falls back to the map for unknown paths', () => {
    expect(viewFromPath('/unknown')).toBe('map')
  })

  it('builds route-specific production canonical URLs', () => {
    expect(canonicalUrlForView('table')).toBe(
      'https://victorious-flower-0d1b0de03.7.azurestaticapps.net/tabela',
    )
    expect(canonicalUrlForView('evolution')).toBe(
      'https://victorious-flower-0d1b0de03.7.azurestaticapps.net/evolucao',
    )
  })
})
