# Deploy Backend to Render

## Step-by-Step Setup

### 1. Create Render Account
- Go to https://render.com
- Sign up with GitHub

### 2. Create New Web Service
1. Click **+ New** → **Web Service**
2. Connect GitHub account
3. Select `vladkour12/arena-rush` repository
4. Configure:
   - **Name:** `arena-rush-backend`
   - **Environment:** Node
   - **Region:** Choose closest to you (us-east-1 recommended)
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`

### 3. Environment Variables
1. Click **Environment** 
2. Add:
   ```
   PORT=3001
   ```
3. (Optional) Add any other vars like API keys if needed

### 4. Deploy
- Click **Create Web Service**
- Render will automatically deploy your `server.js`
- Wait for "Deploy live" status
- Copy the URL (will look like: `https://arena-rush-backend.onrender.com`)

### 5. Connect Frontend (Vercel)
1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Add:
   ```
   VITE_API_URL=https://arena-rush-backend.onrender.com
   ```
4. Redeploy Vercel

### 6. Test Connection
- Open your Vercel app
- Try logging in
- Should now connect to your Render backend

## Troubleshooting

**"Cannot GET /api/auth/login"**
- Make sure `VITE_API_URL` is set correctly in Vercel
- Redeploy Vercel after setting env var

**Backend not starting**
- Check Render logs: Dashboard → Your Service → Logs
- Make sure `node server.js` works locally: `npm run server`

**CORS errors**
- Backend already has CORS enabled
- If still issues, check server.js has `app.use(cors())`

## Notes

- Free tier on Render will spin down after 15 min of inactivity
- First request after spin-down takes ~30 seconds
- For production, upgrade to paid tier
- Backend + Frontend = ~$7/month combined (paid tiers)
