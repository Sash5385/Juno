import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initErrorReporter } from './errorReporter.js'
import { initI18n } from './i18n/index.js'

initErrorReporter()
initI18n()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
