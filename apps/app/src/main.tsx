import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthenticatedConvexProvider } from './lib/auth-provider'
import { App } from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthenticatedConvexProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthenticatedConvexProvider>
  </StrictMode>,
)
