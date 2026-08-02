import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

function normalizeBase(value: string) {
  return value === '/' ? value : `/${value.replace(/^\/+|\/+$/g, '')}/`
}

export function resolveBaseUrl(environment: NodeJS.ProcessEnv) {
  if (environment.VITE_BASE_URL) {
    return normalizeBase(environment.VITE_BASE_URL)
  }
  if (environment.GITHUB_ACTIONS === 'true') {
    const repositoryName = environment.GITHUB_REPOSITORY?.split('/').at(-1)
    if (repositoryName) return normalizeBase(repositoryName)
  }
  return '/'
}

export default defineConfig(({ mode }) => {
  const environment = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  return {
    base: resolveBaseUrl(environment),
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 1000,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
