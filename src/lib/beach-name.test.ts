import { describe, expect, it } from 'vitest'
import {
  canonicalBeachName,
  shortBeachName,
  uniqueShortBeachName,
} from './beach-name'

describe('canonicalBeachName', () => {
  it.each([
    ['Maçãs, Sintra', 'Sintra', 'Praia das Maçãs'],
    ['Grande, Sintra', 'Sintra', 'Praia Grande'],
    ['Carcavelos, Cascais', 'Cascais', 'Carcavelos'],
  ] as const)('normalizes %s', (fullName, municipality, expected) => {
    expect(canonicalBeachName(fullName, municipality)).toBe(expected)
  })
})

describe('shortBeachName', () => {
  it.each([
    ['Praia da Comporta', 'Comporta'],
    ['Praia de São Torpes', 'São Torpes'],
    ['Praia do Guincho', 'Guincho'],
    ['Praia das Maçãs', 'Praia das Maçãs'],
    ['Praia Grande', 'Praia Grande'],
    ['Maçãs', 'Praia das Maçãs'],
    ['Grande', 'Praia Grande'],
    ['Praia dos Pescadores', 'Pescadores'],
    ['Praia', 'Praia'],
    ['Comporta', 'Comporta'],
    ['', ''],
    ['  Praia da Adraga  ', 'Adraga'],
    ['PRAIA DE São Pedro', 'São Pedro'],
  ] as const)('shortens %s', (fullName, expected) => {
    expect(shortBeachName(fullName)).toBe(expected)
  })

  describe('uniqueShortBeachName', () => {
    it('keeps an already unique short name', () => {
      const beach = { id: '1', name: 'Praia da Adraga', municipality: 'Sintra' }
      expect(uniqueShortBeachName(beach, [beach])).toBe('Adraga')
    })

    it('adds municipality only when short names collide', () => {
      const beaches = [
        { id: '1', name: 'Praia do Carvalhal', municipality: 'Grândola' },
        { id: '2', name: 'Praia do Carvalhal', municipality: 'Odemira' },
      ]
      expect(uniqueShortBeachName(beaches[0], beaches)).toBe(
        'Carvalhal · Grândola',
      )
      expect(uniqueShortBeachName(beaches[1], beaches)).toBe(
        'Carvalhal · Odemira',
      )
    })
  })
})
