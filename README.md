# 🎬 ShortsAI Pipeline — YouTube Shorts Generator & Automation Suite

Welcome to **ShortsAI Pipeline**! This project is a modern, full-stack **Next.js Web Application** designed to automate the entire YouTube Shorts creation lifecycle: downloading long-form YouTube videos, extracting top highlight clips, transcribing audio with Whisper AI, cropping to 9:16 vertical video using FFmpeg, burning styled captions, and scheduling native uploads to YouTube channels via the YouTube Data API v3—triggered manually or automatically via **cron-job.org**.

---

## 📌 Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Directory & File Structure](#-directory--file-structure)
3. [Feature Guide](#-feature-guide)
   - [1. Batch Desk](#1-batch-desk)
   - [2. Live Monitor & SSE Logs](#2-live-monitor--sse-logs)
   - [3. Shorts Library](#3-shorts-library)
   - [4. YouTube Auto-Upload & Native Scheduling](#4-youtube-auto-upload--native-scheduling)
   - [5. cron-job.org Remote Trigger](#5-cron-joborg-remote-trigger)
   - [6. Settings & Persistent Store](#6-settings--persistent-store)
   - [7. Automatic Media Cleanup](#7-automatic-media-cleanup)
4. [Getting Started for Developers](#-getting-started-for-developers)
   - [System Prerequisites](#1-system-prerequisites)
   - [Installation](#2-installation)
   - [Environment Variables](#3-environment-variables)
   - [Google Cloud / YouTube OAuth Setup](#4-google-cloud--youtube-oauth-setup)
5. [Production Deployment Guide](DEPLOYMENT.md)
6. [API Routes Documentation](#-api-routes-documentation)
7. [Pipeline Implementation Deep-Dive](#-pipeline-implementation-deep-dive)
8. [Troubleshooting & Common Gotchas](#-troubleshooting--common-gotchas)

---

## 🏗️ Architecture Overview

```
                          ┌──────────────────────────┐
                          │       cron-job.org       │ (Scheduled Cron Ping, e.g. every hour)
                          └────────────┬─────────────┘
                                       │
                                       │ Sends HTTP POST/GET /api/cron-runner?key=SECRET
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                              Next.js Application Server                                │
 │                                                                                        │
 │ ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
 │ │    Batch Desk    │  │   Live Monitor   │  │  Shorts Library  │  │ Settings Manager │ │
 │ └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
 └──────────┼─────────────────────┼─────────────────────┼─────────────────────┼───────────┘
            │                     │                     │                     │
            ▼                     ▼                     ▼                     ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                            In-Memory & Storage Manager (`lib/store.ts`)               │
 └────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                                          │ Trigger Processing Queue
                                          ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                           Video Pipeline Processor (`lib/processor.ts`)                 │
 │                                                                                        │
 │  1. Download: `yt-dlp` fetches YouTube video → saved to `temp/`                       │
 │  2. Probe: `ffprobe` extracts video duration & height/width metadata                  │
 │  3. Transcribe: `yt-dlp` extracts auto/manual subtitles & generates `.srt` captions       │
 │  4. Segment: Calculates optimal 20–45s highlight clip windows                          │
 │  5. Render: `fluent-ffmpeg` scales/pads 16:9 → 9:16 vertical & burns `.srt` subtitles  │
 └────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                                          │ Video Ready
                                          ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                     YouTube Upload Engine (`lib/youtube.ts`)                           │
 │                                                                                        │
 │  • Uploads video with `privacyStatus = "private"`                                      │
 │  • Sets `publishAt = ISO_TIMESTAMP` for calculated publishing intervals                │
 │  • Auto-deletes rendered local `.mp4` file post-upload                                │
 └────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                                          │ Native API Scheduled
                                          ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                           YouTube Channel Studio API                                   │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Directory & File Structure

```
ytshorts/
├── app/                        # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── batch/              # GET (list jobs) & POST (submit batch links)
│   │   │   └── route.ts
│   │   ├── cron-runner/        # GET/POST endpoint called by cron-job.org
│   │   │   └── route.ts
│   │   ├── settings/           # GET & POST for OAuth & app settings
│   │   │   └── route.ts
│   │   └── stream-logs/        # Server-Sent Events (SSE) log & progress feed
│   │       └── route.ts
│   ├── globals.css             # Tailwind CSS & global styles
│   ├── layout.tsx              # Root HTML layout & Google Font provider
│   └── page.tsx                # Main Dashboard UI (Batch Desk, Monitor, Library, Settings)
├── lib/                        # Core backend business logic and services
│   ├── job-runner.ts           # Asynchronous queue manager & batch orchestrator
│   ├── processor.ts            # yt-dlp downloader, Whisper transcription, FFmpeg render engine
│   ├── store.ts                # Persistent JSON storage for jobs, logs, and settings
│   ├── types.ts                # TypeScript interfaces (BatchJob, ShortResult, AppSettings)
│   └── youtube.ts              # YouTube Data API v3 OAuth 2.0 uploader
├── public/                     # Static public web assets
├── temp/                       # Temporary folder for downloaded source videos & SRT files
├── output/                     # Rendered 9:16 vertical MP4 Shorts output folder
├── .env.example                # Demo environment variables template
├── next.config.ts              # Next.js configuration
├── package.json                # Node dependencies & npm scripts
├── tsconfig.json               # TypeScript configuration
└── README.md                   # Project documentation
```

---

## 🚀 Feature Guide

### 1. Batch Desk
* **Location**: Dashboard Home Tab (`app/page.tsx`)
* **Purpose**: Input up to 10 YouTube video links at once to generate a series of vertical Shorts.
* **Customization Options**:
  * **Shorts Per Video**: Choose 1 to 5 Shorts per source video.
  * **Whisper AI Model**: Choose between `tiny`, `base` (recommended), `small`, `medium`, or `large-v3`.
  * **Title Template**: Use placeholders like `{n}` for short part number and `{title}` for highlight text (e.g. `{title} - Part {n} #Shorts`).
  * **Publish Interval**: Configure hours between scheduled YouTube releases (e.g., *1 Short every 4 hours*).
  * **Tags & Privacy**: Custom comma-separated tags and privacy status (`private` required for native scheduling).

### 2. Live Monitor & SSE Logs
* **Location**: Live Monitor Tab (`app/page.tsx`)
* **Purpose**: Real-time progress bar, stage indicator (`downloading`, `analyzing`, `transcribing`, `rendering`, `uploading`), and live terminal console feed powered by Server-Sent Events (`/api/stream-logs`).

### 3. Shorts Library
* **Location**: Shorts Tab (`app/page.tsx`)
* **Purpose**: Displays rendered 9:16 vertical Shorts, duration, file size, YouTube release status, calculated `publishAt` timestamp, and direct YouTube video link.

### 4. YouTube Auto-Upload & Native Scheduling
* **Module**: [lib/youtube.ts](file:///home/mayur/Desktop/Projects/small-builds/ytshorts/lib/youtube.ts)
* **How It Works**: Uses Google OAuth 2.0 to upload videos directly to YouTube Studio. When `privacyStatus` is `private` and `publishAt` is provided as an ISO date string, YouTube automatically publishes the video publicly at that exact time.

### 5. `cron-job.org` Remote Trigger
* **Endpoint**: [app/api/cron-runner/route.ts](file:///home/mayur/Desktop/Projects/small-builds/ytshorts/app/api/cron-runner/route.ts)
* **Usage**: Ping `https://your-domain.netlify.app/api/cron-runner?key=YOUR_SECRET_KEY` on a schedule (e.g. every hour). The server checks for queued jobs and executes them automatically without requiring an active browser session.

### 6. Settings & Persistent Store
* **Module**: [lib/store.ts](file:///home/mayur/Desktop/Projects/small-builds/ytshorts/lib/store.ts)
* **Purpose**: Persists application settings and batch job histories in local JSON files so configuration remains saved across restarts.

### 7. Automatic Media Cleanup
* **Feature**: Automatically unlinks temporary source videos in `temp/` and rendered MP4 files in `output/` immediately after successful YouTube upload, avoiding server storage overflow.

---

## 💻 Getting Started for Developers

### 1. System Prerequisites

Before running the application, make sure your operating system has the following binaries installed and available in system `PATH`:

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y nodejs ffmpeg yt-dlp python3

# macOS (Homebrew)
brew install node ffmpeg yt-dlp
```

Verify binary installation:
```bash
node -v
ffmpeg -version
yt-dlp --version
```

### 2. Installation

Clone the repository and install npm packages:

```bash
git clone https://github.com/your-username/ytshorts.git
cd ytshorts
npm install
```

### 3. Environment Variables

Create `.env.local` based on `.env.example`:

```bash
cp .env.example .env.local
```

Example `.env.local`:
```env
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-your-client-secret
YOUTUBE_REFRESH_TOKEN=1//04-your-refresh-token
CRON_SECRET_KEY=ytshorts-cron-secret-2026
```

### 4. Google Cloud / YouTube OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable **YouTube Data API v3**.
3. Create an **OAuth 2.0 Client ID** (Web Application).
4. Generate a **Refresh Token** with the `https://www.googleapis.com/auth/youtube.upload` scope.
5. Paste `Client ID`, `Client Secret`, and `Refresh Token` into `.env.local` or directly in the app's **Settings** tab in the browser.

---

## 🌐 API Routes Documentation

### `POST /api/batch`
Queues a new video processing batch.
* **Request Body**:
  ```json
  {
    "urls": ["https://www.youtube.com/watch?v=EXAMPLE"],
    "numShorts": 3,
    "whisperModel": "base",
    "titleTemplate": "{title} - Part {n} #Shorts",
    "description": "Generated with ShortsAI",
    "tags": ["Shorts", "Viral"],
    "privacy": "private",
    "publishIntervalHours": 4
  }
  ```

### `GET /api/batch`
Returns current list of queued, processing, and completed batch jobs.

### `GET /api/cron-runner?key=SECRET_KEY`
Called by `cron-job.org` or curl. Triggers queue processor if pending queued jobs exist.

### `GET /api/stream-logs`
Server-Sent Events (SSE) endpoint providing real-time JSON log streaming to the frontend console.

---

## 🔧 Pipeline Implementation Deep-Dive

When a job starts processing in `lib/job-runner.ts`, it invokes `processVideoPipeline()` in `lib/processor.ts`:

1. **`downloadVideo()`**: Spawns `yt-dlp` to download the best MP4 video stream (<= 1080p).
2. **`transcribeAudio()`**: Executes `faster_whisper` in Python/Node to generate a precise `.srt` timestamped subtitle file.
3. **`getVideoDuration()`**: Uses `ffprobe` to determine total video duration.
4. **`renderShortClip()`**: Runs `fluent-ffmpeg` with the following filter chain:
   ```
   scale=1080:-2, pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black, subtitles=subtitles.srt
   ```
5. **`uploadToYouTube()`**: Takes rendered `.mp4` file and uploads it to YouTube with `publishAt` timestamps.

---

## ❓ Troubleshooting & Common Gotchas

* **`yt-dlp: command not found`**: Ensure `yt-dlp` is installed and added to your system `PATH` or Python virtual environment.
* **`FFmpeg exited with error code`**: Check if `ffmpeg` and `ffprobe` binaries are accessible.
* **`YouTube OAuth Invalid Credentials`**: Ensure your Refresh Token has the `youtube.upload` scope granted in Google OAuth consent screen.
* **cron-job.org HTTP 401**: Verify that the `key` parameter in your cron URL matches `CRON_SECRET_KEY` in your settings.
