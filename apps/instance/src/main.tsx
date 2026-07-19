import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth-provider'
import { BootstrapGate } from './components/bootstrap-gate'
import { App } from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BootstrapGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BootstrapGate>
    </AuthProvider>
  </StrictMode>,
)
