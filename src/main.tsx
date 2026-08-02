import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installCloudflareAnalytics } from './lib/cloudflare-analytics'

installCloudflareAnalytics(import.meta.env.VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
