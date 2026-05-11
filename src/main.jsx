import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Outils de test DevTools — disponibles via window.testAnonymize(file)
if (import.meta.env.DEV) {
  import('./lib/_testAnonymizer.js')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
