import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { migrateStorageKeys } from './lib/storageMigration.js'

// Rebrand Kapio : migre coachFiscal.* → kapio.* avant tout render (donc avant
// l'effet d'hydratation d'AppContext). Idempotent, sans perte de données.
migrateStorageKeys()

// Outils de test DevTools — disponibles via window.testAnonymize(file)
if (import.meta.env.DEV) {
  import('./lib/_testAnonymizer.js')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
