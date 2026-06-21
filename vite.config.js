import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Runs Vercel API handlers inside the Vite dev server so /api/* routes work
// without needing `vercel dev`. Only active during development.
function apiDevServer() {
  return {
    name: 'api-dev-server',
    config(_, { mode }) {
      // Load all .env vars (not just VITE_*) so serverless handlers can read them
      Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const route = req.url.split('?')[0].slice('/api/'.length)
        try {
          const chunks = []
          await new Promise((resolve, reject) => {
            req.on('data', c => chunks.push(c))
            req.on('end', resolve)
            req.on('error', reject)
          })
          req.body = Buffer.concat(chunks).toString()
          // Shim Express-style methods onto the raw Node res object
          res.status = (code) => { res.statusCode = code; return res }
          res.json   = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res }
          const { default: handler } = await import(`./api/${route}.js`)
          handler(req, res)
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [
    apiDevServer(),
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: false, // We manage public/manifest.json manually
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // No sourcemaps in production — don't expose source
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          dexie: ['dexie']
        }
      }
    }
  }
})
