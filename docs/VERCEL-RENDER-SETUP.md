# Fix "Network error" — Vercel + Render

The login page calls your **Render** backend. If `VITE_API_URL` is missing when Vercel builds, the app uses `http://localhost:5000/api` and login fails.

## Step 1 — Get your Render API URL

1. Open [Render Dashboard](https://dashboard.render.com)
2. Click your **Web Service** (backend, not PostgreSQL)
3. Copy the URL at the top, e.g. `https://campussynz.onrender.com`
4. Add `/api` at the end:

```
https://campussynz.onrender.com/api
```

Test in browser: `https://YOUR-SERVICE.onrender.com/api/health`  
Should show: `{"status":"ok",...}`

## Step 2 — Set Vercel environment variable

1. [Vercel Dashboard](https://vercel.com) → project **campus-synz**
2. **Settings** → **Environment Variables**
3. Add:

| Name | Value | Environments |
|------|--------|--------------|
| `VITE_API_URL` | `https://YOUR-SERVICE.onrender.com/api` | Production, Preview, Development |

4. **Save**

## Step 3 — Redeploy (required)

Env vars are embedded at **build** time. After adding `VITE_API_URL`:

1. **Deployments** tab
2. **⋯** on latest deployment → **Redeploy**
3. Wait until status is **Ready**

## Step 4 — Render CORS

On Render → your Web Service → **Environment**:

```
CORS_ORIGINS=https://campus-synz-67geha76t-9124205085-1684s-projects.vercel.app,https://campus-synz-git-main-9124205085-1684s-projects.vercel.app,http://localhost:5173
```

Redeploy Render if you change this.

## Step 5 — Vercel project settings

| Setting | Value |
|---------|--------|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

## Step 6 — Create admin on Render (once)

Render → Web Service → **Shell**:

```bash
cd backend && python database/init_db.py
```

Login: `admin@kcgcollege.edu` / `Admin@123`

## Verify

After redeploy, the login error (if any) shows which URL the app uses.  
It must **not** say `localhost:5000` on the live Vercel site.
