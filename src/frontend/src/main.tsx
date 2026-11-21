import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SignPage } from './SignPage.tsx'

// Link do podpisu działa bez logowania, więc omija całą aplikację.
const signToken = location.pathname.match(/^\/podpis\/([^/]+)$/)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signToken ? <SignPage token={decodeURIComponent(signToken)} /> : <App />}
  </StrictMode>,
)
