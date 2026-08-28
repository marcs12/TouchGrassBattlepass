import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this as a project page, so the built asset URLs have to
// be prefixed with the repo name. BASE_PATH overrides it for any other host
// (a custom domain, Netlify, Vercel) where the app sits at the root.
const REPO_BASE = '/TouchGrassBattlepass/'

export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? (mode === 'production' ? REPO_BASE : '/'),
  plugins: [react()],
}))
