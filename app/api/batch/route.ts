import { NextRequest, NextResponse } from 'next/server';
import { getJobs, addJobs, initDb } from '@/lib/store';
import { BatchJob } from '@/lib/types';
import { triggerQueueProcessor } from '@/lib/job-runner';

// Run once at server startup to mark orphaned jobs as failed
initDb();

export async function GET() {
  const jobs = getJobs();
  return NextResponse.json({ success: true, jobs });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      urls,
      numShorts = 3,
      whisperModel = 'base',
      titleTemplate = '{title} - Part {n} #Shorts',
      description = 'Generated with ShortsAI',
      tags = ['Shorts', 'Viral'],
      privacy = 'private',
      publishIntervalHours = 4,
    } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please provide at least one valid YouTube URL.' },
        { status: 400 }
      );
    }

    const newJobs: BatchJob[] = urls.map((urlStr: string, idx: number) => ({
      id: `job_${Date.now()}_${idx}`,
      url: urlStr.trim(),
      numShorts: Number(numShorts) || 3,
      whisperModel: whisperModel || 'base',
      titleTemplate: titleTemplate || '{title} - Part {n} #Shorts',
      description: description || '',
      tags: Array.isArray(tags) ? tags : ['Shorts'],
      privacy: privacy || 'private',
      publishIntervalHours: Number(publishIntervalHours) || 4,
      status: 'queued',
      progress: 0,
      currentStepMessage: 'Queued for processing',
      shorts: [],
      logs: [`Job submitted at ${new Date().toLocaleTimeString()}`],
      createdAt: new Date().toISOString(),
    }));

    addJobs(newJobs);

    // Trigger queue processor in background
    triggerQueueProcessor().catch((err) => console.error('Background runner error:', err));

    return NextResponse.json({
      success: true,
      message: `Successfully queued ${newJobs.length} video job(s).`,
      jobs: newJobs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to submit batch job.' },
      { status: 500 }
    );
  }
}
