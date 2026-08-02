# 🚀 Deployment Guide — ShortsAI Pipeline

## ⚠️ Important: Why Netlify Won't Work

This app **cannot be deployed on Netlify** (or Vercel) because:

| Requirement | Netlify / Vercel | Supported? |
|---|---|---|
| Run `ffmpeg` binary | ❌ Not available | ✗ |
| Run `yt-dlp` binary | ❌ Not available | ✗ |
| Processes longer than 10–26 seconds | ❌ Serverless timeout | ✗ |
| Write files to disk (`temp/`, `output/`) | ❌ Read-only filesystem | ✗ |

**Use one of these instead** — all have **free tiers**:

| Platform | Free Tier | Notes |
|---|---|---|
| **Railway** ⭐ Recommended | $5 credit/month (enough for personal use) | 1-click deploy, persistent disk, full Linux |
| **Render** | 750 hrs/month free | Auto-sleep on free tier after 15 min idle |
| **Fly.io** | 3 shared VMs free | Docker-based, persistent volumes |
| **VPS (Hetzner)** | ~€4/month | Cheapest full control, Ubuntu server |

---

## 📁 Step 1: Prepare for GitHub

### 1. Verify `.gitignore` is correct
Your `.gitignore` already excludes secrets and large files:
```
/temp/        ← source videos, db.json (NOT committed)
/output/      ← rendered shorts (NOT committed)
.env*         ← your credentials (NOT committed)
/node_modules
/.next/
```

> ⚠️ **NEVER commit `.env`** — it contains your YouTube API credentials.

### 2. Create your GitHub repository

```bash
cd /home/mayur/Desktop/Projects/small-builds/ytshorts

# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit: ShortsAI Pipeline"

# Create repo at https://github.com/new then:
git remote add origin https://github.com/YOUR_USERNAME/ytshorts.git
git branch -M main
git push -u origin main
```

> Make the repository **Private** since it contains your personal automation tool.

---

## 🚂 Option 1: Deploy on Railway (Recommended — Free)

Railway supports full Linux environments with FFmpeg and yt-dlp.

### Step 1: Create Railway account
Go to [railway.app](https://railway.app) and sign in with GitHub.

### Step 2: Deploy from GitHub

1. Click **New Project → Deploy from GitHub repo**
2. Select your `ytshorts` repository
3. Railway auto-detects Next.js and deploys it

### Step 3: Add Environment Variables

In Railway dashboard → your service → **Variables** tab, add:

```
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-your-client-secret
YOUTUBE_REFRESH_TOKEN=your-refresh-token
CRON_SECRET_KEY=your-random-secret-key
```

### Step 4: Install FFmpeg and yt-dlp on Railway

Create a `nixpacks.toml` file in your project root:

```toml
[phases.setup]
nixPkgs = ["ffmpeg", "yt-dlp"]
```

### Step 5: Fix the `temp/` and `output/` directories

Since Railway has an ephemeral filesystem that resets on restart, add this to ensure directories exist at startup. Railway gives you a persistent `/data` volume if needed, but since `autoDeleteAfterUpload = true`, files are deleted after upload anyway.

Add a `railway.json` to project root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run build && npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Step 6: Generate your domain

In Railway → Settings → **Networking** → Generate Domain.
Your app will be at `https://ytshorts-xxxx.railway.app`

---

## 🖥️ Option 2: VPS Deployment (Full Control)

Best if you want cheapest long-term hosting. Get a €4/month VPS from [Hetzner](https://hetzner.com) or [DigitalOcean](https://digitalocean.com) ($6/month).

### Step 1: Server setup

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg, yt-dlp, git, nginx, PM2
sudo apt install -y ffmpeg git nginx
sudo pip3 install yt-dlp    # or: sudo apt install yt-dlp
sudo npm install -g pm2

# Verify
node -v && ffmpeg -version && yt-dlp --version
```

### Step 2: Clone and configure

```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/ytshorts.git
cd ytshorts
sudo chown -R $USER:$USER /var/www/ytshorts

npm install

# Create env file
cp .env.example .env
nano .env
# Paste your real credentials here
```

### Step 3: Build and start with PM2

```bash
npm run build
pm2 start npm --name "ytshorts" -- start -- -p 3000
pm2 save
pm2 startup
```

### Step 4: Nginx reverse proxy

```bash
sudo nano /etc/nginx/sites-available/ytshorts
```

Paste:
```nginx
server {
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE streaming for live logs
    location /api/stream-logs {
        proxy_pass http://localhost:3000;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ytshorts /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free SSL certificate
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

---

## 🐳 Option 3: Docker (Any Platform)

Create `Dockerfile` in project root:

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 python3-pip curl \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
```

Create `docker-compose.yml`:
```yaml
services:
  ytshorts:
    build: .
    restart: always
    ports:
      - "3000:3000"
    environment:
      - YOUTUBE_CLIENT_ID=${YOUTUBE_CLIENT_ID}
      - YOUTUBE_CLIENT_SECRET=${YOUTUBE_CLIENT_SECRET}
      - YOUTUBE_REFRESH_TOKEN=${YOUTUBE_REFRESH_TOKEN}
      - CRON_SECRET_KEY=${CRON_SECRET_KEY}
    volumes:
      - ./temp:/app/temp
      - ./output:/app/output
```

```bash
docker compose up -d --build
```

---

## ⏰ Cron Job Setup (Auto-process queue without manual trigger)

After deploying, set up [cron-job.org](https://cron-job.org) (free) to keep the queue running:

1. Sign up at [cron-job.org](https://cron-job.org)
2. Create a new cron job:
   - **URL**: `https://YOUR_DOMAIN/api/cron-runner?key=YOUR_CRON_SECRET_KEY`
   - **Schedule**: Every 5–15 minutes
   - **Method**: GET
3. Save

This pings your server regularly so queued jobs don't stall if the server was restarted.

---

## ✅ Post-Deployment Checklist

- [ ] App loads at your domain
- [ ] Settings page shows YouTube credentials
- [ ] Test with 1 video URL in Batch Desk
- [ ] Terminal output shows download → render → upload
- [ ] YouTube channel shows the uploaded short (as private/scheduled)
- [ ] `output/` folder is empty after upload (auto-delete working)
- [ ] Cron job is configured and firing on schedule
