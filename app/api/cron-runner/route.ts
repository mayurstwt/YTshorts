import { NextRequest, NextResponse } from 'next/server';
import { getSettings, getJobs } from '@/lib/store';
import { triggerQueueProcessor } from '@/lib/job-runner';

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const settings = getSettings();

  // Validate cron secret key
  if (settings.cronSecretKey && key !== settings.cronSecretKey) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized cron key.' },
      { status: 401 }
    );
  }

  const jobs = getJobs();
  const pendingJobs = jobs.filter((j) => j.status === 'queued');

  if (pendingJobs.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'Cron triggered successfully: No pending queued jobs found.',
      queueLength: 0,
    });
  }

  // Trigger background job runner asynchronously
  triggerQueueProcessor().catch((err) => console.error('Cron job runner error:', err));

  return NextResponse.json({
    success: true,
    message: `Cron triggered successfully! Processing ${pendingJobs.length} queued job(s).`,
    nextJobId: pendingJobs[0].id,
    queueLength: pendingJobs.length,
  });
}
