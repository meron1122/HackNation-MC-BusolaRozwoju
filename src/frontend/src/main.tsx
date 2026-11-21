import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SignPage } from './SignPage.tsx'

// Link do podpisu działa bez logowania, więc omija całą aplikację.
const signMatch = location.pathname.match(/^\/podpis(-test)?\/([^/]+)$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch ? <SignPage token={decodeURIComponent(signMatch[2])} test={!!signMatch[1]} /> : <App />}
  </StrictMode>,
)
