/**
 * Writes vercel.json rewrites so /api on Vercel proxies to Render.
 * Set on Vercel before build: RENDER_API_URL=https://your-service.onrender.com
 * Or: VITE_API_URL=https://your-service.onrender.com/api
 */
import { writeFileSync } from 'fs'

const raw = (process.env.VITE_API_URL || process.env.RENDER_API_URL || '').trim()
const backend = raw.replace(/\/api\/?$/, '').replace(/\/$/, '')

const rewrites = []
if (backend) {
  rewrites.push({
    source: '/api/:path*',
    destination: `${backend}/api/:path*`,
  })
  console.log(`[prebuild] API proxy → ${backend}/api/*`)
} else {
  console.warn(
    '[prebuild] RENDER_API_URL or VITE_API_URL not set — /api proxy disabled. Login will fail on Vercel.',
  )
}

rewrites.push({ source: '/(.*)', destination: '/index.html' })

writeFileSync('vercel.json', `${JSON.stringify({ rewrites }, null, 2)}\n`)
