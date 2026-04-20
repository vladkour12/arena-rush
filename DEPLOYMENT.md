# Deployment Guide

## Frontend Deployment (Vercel)

1. Push code to GitHub
2. Connect repo to Vercel: https://vercel.com/import
3. Set Environment Variables in Vercel Dashboard:
   ```
   VITE_API_URL=https://your-backend-url.com
   ```
4. Deploy!

## Backend Deployment Options

### Option 1: Railway (Recommended for Node.js)

1. Go to https://railway.app/
2. Create new project → Deploy from GitHub
3. Select your repo
4. Add Node.js environment variable:
   ```
   PORT=3001
   ```
5. Railway provides a URL like: `https://your-app.railway.app`
6. Use this as `VITE_API_URL` in Vercel

### Option 2: Render

1. Go to https://render.com/
2. Create new Web Service
3. Connect GitHub repo
4. Runtime: Node
5. Build Command: `npm install`
6. Start Command: `node server.js`
7. Add environment variable:
   ```
   PORT=3001
   ```

### Option 3: Heroku (Free tier discontinued, but still option)

Similar setup to Render

## Testing Production Build Locally

```bash
npm run build
npm run preview
```

Then in `.env.local`, set your backend URL:
```
VITE_API_URL=https://your-deployed-backend.railway.app
```

## Troubleshooting

- **CORS errors**: Backend should have CORS enabled (already configured in server.js)
- **Connection refused**: Make sure `VITE_API_URL` is set correctly in Vercel
- **WebSocket errors**: Backend needs to support WebSocket (already configured)
