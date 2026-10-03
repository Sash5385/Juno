import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SalonApp from './salon/index.jsx'
import { initErrorReporter } from './errorReporter.js'

initErrorReporter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SalonApp />
  </StrictMode>,
)
