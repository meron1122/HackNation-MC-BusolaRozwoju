import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Lokalnie API z `dotnet run` (profil http). Na produkcji front i API są pod jednym adresem.
  server: { proxy: { '/api': 'http://localhost:5283' } },
})
