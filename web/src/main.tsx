import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/index.css'
import { pretLangue } from '@/i18n'
import { queryClient } from '@/lib/queryClient'
import { routeur } from '@/routes'

async function demarrer() {
  // Mode mock : uniquement en développement, jamais inclus dans le bundle de production.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true') {
    const { installerMock } = await import('./api/mock')
    installerMock()
  }

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
  }

  await pretLangue()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={routeur} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void demarrer()
