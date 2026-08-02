export function publicAssetUrl(
  path: string,
  baseUrl = import.meta.env.BASE_URL,
) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${path.replace(/^\/+/, '')}`
}
