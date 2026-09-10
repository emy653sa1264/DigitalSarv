import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'

const root = import.meta.dirname

/** One HTML entry per installable app. Output mirrors this layout: dist/index.html, dist/app/index.html, … */
const ENTRIES = {
  landing: path.resolve(root, 'index.html'),
  customer: path.resolve(root, 'app/index.html'),
  courier: path.resolve(root, 'courier/index.html'),
  admin: path.resolve(root, 'admin/index.html'),
}

const APP_ROUTE = /^\/(app|courier|admin)(?:\/|$)/

/**
 * Dev + preview: serve each app's own index.html for its client-side routes
 * (`/app/*` → /app/index.html, …). Files with an extension, /api, /assets, /src etc. are untouched.
 * nginx does the same in production.
 */
function appFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const pathname = (req.url ?? '/').split(/[?#]/, 1)[0]
      const match = APP_ROUTE.exec(pathname)
      const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
      if (match && !lastSegment.includes('.')) req.url = `/${match[1]}/index.html`
    }
    next()
  }
  return {
    name: 'sarv-app-fallback',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

const PUBLIC_URL_TOKEN = /%VITE_PUBLIC_URL%/g
const TEMPLATED_PUBLIC_FILES = ['robots.txt', 'sitemap.xml']

/**
 * Replaces `%VITE_PUBLIC_URL%` in the HTML entries, robots.txt and sitemap.xml, and stamps the
 * service-worker cache version at build time.
 */
function publicUrl(url: string): Plugin {
  let outDir = ''
  return {
    name: 'sarv-public-url',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(PUBLIC_URL_TOKEN, url),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?', 1)[0].slice(1)
        if (!TEMPLATED_PUBLIC_FILES.includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8')
        res.end(fs.readFileSync(path.join(root, 'public', name), 'utf8').replace(PUBLIC_URL_TOKEN, url))
      })
    },
    writeBundle() {
      for (const name of TEMPLATED_PUBLIC_FILES) {
        const file = path.join(outDir, name)
        if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(PUBLIC_URL_TOKEN, url))
      }
      const sw = path.join(outDir, 'sw.js')
      if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__SW_VERSION__', Date.now().toString(36)))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root, '')
  // Absolute site origin for canonical / Open Graph / sitemap. Empty → root-relative URLs.
  const siteUrl = (env.VITE_PUBLIC_URL || env.WEB_PUBLIC_URL || '').replace(/\/+$/, '')
  if (command === 'build' && !siteUrl) {
    console.warn('[sarv] VITE_PUBLIC_URL is not set — canonical/OG/sitemap URLs will be root-relative.')
  }

  return {
    plugins: [react(), tailwindcss(), appFallback(), publicUrl(siteUrl)],
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
      },
    },
    build: {
      rolldownOptions: {
        input: ENTRIES,
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
              { name: 'ui', test: /node_modules[\\/](radix-ui|@radix-ui|lucide-react|sonner)[\\/]/ },
              { name: 'vendor', test: /node_modules[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  }
})
