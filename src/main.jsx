import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SALON_MODE } from './salon/env.js'
import { initErrorReporter } from './errorReporter.js'

initErrorReporter()

// Режим салону (src/salon, VITE_APP_MODE=salon або ?app=salon) — окремий чанк; без нього нічого не змінюється
const SalonApp = SALON_MODE ? lazy(() => import('./salon/index.jsx')) : null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {SalonApp ? <Suspense fallback={null}><SalonApp /></Suspense> : <App />}
  </StrictMode>,
)
