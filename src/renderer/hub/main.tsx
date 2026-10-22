import { createRoot } from 'react-dom/client'
import '../styles.css'
import { App } from './App'

async function boot() {
  if (!window.spark && import.meta.env.DEV) {
    const { installMock } = await import('./mock')
    installMock()
  }
  createRoot(document.getElementById('root')!).render(<App />)
}

void boot()
