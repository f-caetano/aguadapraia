const BEACH_PREFIXES = [
  'Praia das',
  'Praia dos',
  'Praia da',
  'Praia de',
  'Praia do',
  'Praia',
] as const
const PRESERVE_FULL_NAMES = new Set(['praia das macas', 'praia grande'])
const PREFERRED_NAMES = new Map([
  ['macas', 'Praia das Maçãs'],
  ['praia das macas', 'Praia das Maçãs'],
  ['grande', 'Praia Grande'],
  ['praia grande', 'Praia Grande'],
])

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function normalizeName(value: string) {
  return stripDiacritics(value).toLocaleLowerCase('pt-PT').trim()
}

export function canonicalBeachName(
  fullName: string,
  municipality?: string,
): string {
  const trimmedName = fullName.trim()
  const parts = trimmedName.split(',').map((part) => part.trim())
  const suffix = parts.at(-1) ?? ''
  const withoutMunicipality =
    municipality &&
    parts.length > 1 &&
    normalizeName(suffix) === normalizeName(municipality)
      ? parts.slice(0, -1).join(', ')
      : trimmedName

  return PREFERRED_NAMES.get(normalizeName(withoutMunicipality)) ?? withoutMunicipality
}

export function shortBeachName(fullName: string): string {
  const trimmedStart = canonicalBeachName(fullName).trimStart()
  const normalizedName = normalizeName(trimmedStart)
  if (PRESERVE_FULL_NAMES.has(normalizedName)) return trimmedStart.trimEnd()

  for (const prefix of BEACH_PREFIXES) {
    const candidate = trimmedStart.slice(0, prefix.length)
    if (stripDiacritics(candidate).toLocaleLowerCase('pt-PT') !== stripDiacritics(prefix).toLocaleLowerCase('pt-PT')) {
      continue
    }

    const shortened = trimmedStart.slice(prefix.length).trim()
    return shortened || fullName
  }

  return fullName
}

interface BeachIdentity {
  id: string
  name: string
  municipality?: string
  district?: string
}

export function uniqueShortBeachName(
  beach: BeachIdentity,
  beaches: readonly BeachIdentity[],
): string {
  const base = shortBeachName(beach.name)
  const sameBase = beaches.filter(
    (candidate) =>
      shortBeachName(candidate.name).localeCompare(base, 'pt-PT', {
        sensitivity: 'base',
      }) === 0,
  )
  if (sameBase.length <= 1) return base

  const municipality = beach.municipality?.trim()
  if (
    municipality &&
    sameBase.filter(
      (candidate) =>
        candidate.municipality?.localeCompare(municipality, 'pt-PT', {
          sensitivity: 'base',
        }) === 0,
    ).length === 1
  ) {
    return `${base} · ${municipality}`
  }

  const district = beach.district?.trim()
  if (district) return `${base} · ${district}`
  return `${base} · ${beach.id}`
}
