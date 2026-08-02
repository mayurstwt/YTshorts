import fs from 'fs';
import path from 'path';
import { BatchJob, AppSettings } from './types';

const DB_PATH = path.join(process.cwd(), 'temp', 'db.json');

interface DatabaseSchema {
  jobs: BatchJob[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
  youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
  cronSecretKey: process.env.CRON_SECRET_KEY || 'ytshorts-cron-secret-2026',
  defaultWhisperModel: 'base',
  defaultNumShorts: 3,
  defaultPublishIntervalHours: 4,
  defaultPrivacy: 'private',
  autoDeleteAfterUpload: true,
};

function ensureDbExists() {
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const initialData: DatabaseSchema = {
      jobs: [],
      settings: DEFAULT_SETTINGS,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

// Track whether we've already run startup cleanup
let _startupCleanupDone = false;

/**
 * Called once at server start to mark any orphaned in-progress or queued jobs
 * as failed (they were interrupted by the previous server process).
 */
export function initDb() {
  if (_startupCleanupDone) return;
  _startupCleanupDone = true;

  ensureDbExists();
  try {
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    const jobs: BatchJob[] = parsed.jobs || [];

    const activeStatuses = ['queued', 'downloading', 'analyzing', 'transcribing', 'rendering', 'uploading'];
    let cleaned = false;
    for (const job of jobs) {
      if (activeStatuses.includes(job.status)) {
        job.status = 'failed';
        job.error = 'Process interrupted by server restart';
        job.currentStepMessage = 'Interrupted by server restart';
        cleaned = true;
        console.log(`[Store] Marked orphaned job ${job.id} as failed (was: ${job.status})`);
      }
    }

    if (cleaned) {
      const db = { jobs, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } };
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
      console.log('[Store] Startup cleanup complete: orphaned jobs marked as failed.');
    }
  } catch (err) {
    console.error('[Store] initDb cleanup error:', err);
  }
}

export function readDb(): DatabaseSchema {
  ensureDbExists();
  try {
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      jobs: parsed.jobs || [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch (err) {
    console.error('Failed to read db.json:', err);
    return { jobs: [], settings: DEFAULT_SETTINGS };
  }
}

export function writeDb(data: DatabaseSchema) {
  ensureDbExists();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function getJobs(): BatchJob[] {
  return readDb().jobs;
}

export function getJobById(id: string): BatchJob | undefined {
  return readDb().jobs.find((j) => j.id === id);
}

export function saveJob(job: BatchJob): BatchJob {
  const db = readDb();
  const index = db.jobs.findIndex((j) => j.id === job.id);
  if (index >= 0) {
    db.jobs[index] = job;
  } else {
    db.jobs.unshift(job);
  }
  writeDb(db);
  return job;
}

export function addJobs(jobs: BatchJob[]): BatchJob[] {
  const db = readDb();
  db.jobs.unshift(...jobs);
  writeDb(db);
  return jobs;
}

export function updateJob(id: string, updates: Partial<BatchJob>): BatchJob | undefined {
  const db = readDb();
  const index = db.jobs.findIndex((j) => j.id === id);
  if (index >= 0) {
    db.jobs[index] = { ...db.jobs[index], ...updates };
    writeDb(db);
    return db.jobs[index];
  }
  return undefined;
}

export function appendJobLog(id: string, logMsg: string) {
  const db = readDb();
  const job = db.jobs.find((j) => j.id === id);
  if (job) {
    job.logs = job.logs || [];
    job.logs.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
    writeDb(db);
  }
}

export function getSettings(): AppSettings {
  const dbSettings = readDb().settings;
  return {
    ...dbSettings,
    youtubeClientId: dbSettings.youtubeClientId || process.env.YOUTUBE_CLIENT_ID || '',
    youtubeClientSecret: dbSettings.youtubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET || '',
    youtubeRefreshToken: dbSettings.youtubeRefreshToken || process.env.YOUTUBE_REFRESH_TOKEN || '',
    cronSecretKey: dbSettings.cronSecretKey || process.env.CRON_SECRET_KEY || 'ytshorts-cron-secret-2026',
  };
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const db = readDb();
  db.settings = { ...db.settings, ...settings };
  writeDb(db);
  return getSettings();
}
