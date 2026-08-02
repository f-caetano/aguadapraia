export type AppViewMode = 'map' | 'table' | 'evolution'

const viewPaths: Record<AppViewMode, string> = {
  map: '/',
  table: '/tabela',
  evolution: '/evolucao',
}

const productionOrigin =
  'https://victorious-flower-0d1b0de03.7.azurestaticapps.net'

export function pathForView(view: AppViewMode): string {
  return viewPaths[view]
}

export function canonicalUrlForView(view: AppViewMode): string {
  return new URL(viewPaths[view], productionOrigin).href
}

export function viewFromPath(pathname: string): AppViewMode {
  if (pathname === viewPaths.table) return 'table'
  if (pathname === viewPaths.evolution) return 'evolution'
  return 'map'
}
