import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadWorld } from './world'
import { startPerf } from './perf'
import './ext/garden'

startPerf()
// Chrome throttles hidden tabs but not reliably for every animation: pause the CSS ones outright (the Lantern pauses its own).
const syncHidden = () => document.documentElement.classList.toggle('tab-hidden', document.hidden)
document.addEventListener('visibilitychange', syncHidden)
syncHidden()
void loadWorld() // fetch the release, config and world JSON while React boots
// Production only: in dev a service worker would serve stale modules and break HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
