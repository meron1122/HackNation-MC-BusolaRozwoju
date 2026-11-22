import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Krój marki hostowany razem z aplikacją (bez Google Fonts): osie grubości i rozmiaru optycznego.
import '@fontsource-variable/inter/opsz.css'
import './index.css'
import './busola-hifi.css'
// Ruch i globalny polish (tokeny --m-*, klasy .m-*): po busola-hifi.css, żeby nadpisać przejścia przycisków.
import './v2/motion/motion.css'
import App from './App.tsx'
import { SignPage } from './SignPage.tsx'

// Link do podpisu działa bez logowania, więc omija całą aplikację.
const signMatch = location.pathname.match(/^\/podpis(-test)?\/([^/]+)$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch ? <SignPage token={decodeURIComponent(signMatch[2])} test={!!signMatch[1]} /> : <App />}
  </StrictMode>,
)
