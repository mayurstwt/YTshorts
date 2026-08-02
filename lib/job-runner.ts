import path from 'path';
import fs from 'fs';
import { getJobById, updateJob, appendJobLog, getSettings } from './store';
import { uploadToYouTube } from './youtube';
import { processVideoPipeline, ProcessedShort } from './processor';
import { ShortResult } from './types';

let isRunningQueue = false;

export async function triggerQueueProcessor() {
  if (isRunningQueue) return;
  isRunningQueue = true;

  try {
    const { getJobs } = await import('./store');

    // Keep processing queued jobs one at a time until the queue is empty
    while (true) {
      const jobs = getJobs();
      const queuedJob = jobs.find((j) => j.status === 'queued');
      if (!queuedJob) break;

      console.log(`[JobRunner] Starting queued job: ${queuedJob.id} (${queuedJob.url})`);
      await processSingleJob(queuedJob.id);
      console.log(`[JobRunner] Finished job ${queuedJob.id}. Checking for more queued jobs...`);
    }

    console.log('[JobRunner] Queue is empty. All jobs processed.');
  } catch (err) {
    console.error('[JobRunner] Queue processing error:', err);
  } finally {
    isRunningQueue = false;
  }
}

export async function processSingleJob(jobId: string) {
  const job = getJobById(jobId);
  if (!job) return;

  updateJob(jobId, {
    status: 'downloading',
    progress: 5,
    startedAt: new Date().toISOString(),
    currentStepMessage: 'Initializing batch process...',
  });
  console.log(`[JobRunner] [${new Date().toLocaleTimeString()}] Processing job ${jobId} (${job.url})`);
  appendJobLog(jobId, `Started processing job for URL: ${job.url}`);

  try {
    const generatedShortsData: ProcessedShort[] = await processVideoPipeline({
      url: job.url,
      numShorts: job.numShorts,
      whisperModel: job.whisperModel,
      onLog: (msg: string) => {
        console.log(`[Job:${jobId.slice(-4)}] ${msg}`);
        appendJobLog(jobId, msg);
      },
      onProgress: (percent: number, stage: string, msg: string) => {
        updateJob(jobId, {
          progress: percent,
          status: stage as any,
          currentStepMessage: msg,
        });
      },
    });

    const msgExt = `Video extraction complete! Found ${generatedShortsData.length} generated shorts.`;
    appendJobLog(jobId, msgExt);
    console.log(`[JobRunner] ${msgExt}`);

    updateJob(jobId, {
      status: 'uploading',
      progress: 90,
      currentStepMessage: 'Uploading & Scheduling Shorts on YouTube API...',
    });

    const settings = getSettings();
    const intervalHours = job.publishIntervalHours || settings.defaultPublishIntervalHours || 4;
    const shortsResults: ShortResult[] = [];

    // Calculate initial publish time (10 mins from now)
    let publishTime = new Date(Date.now() + 10 * 60 * 1000);

    for (let i = 0; i < generatedShortsData.length; i++) {
      const item = generatedShortsData[i];
      const shortIndex = i + 1;

      // Custom title template replacement
      const formattedTitle = (job.titleTemplate || 'Shorts Highlight #{n}')
        .replace('{n}', String(shortIndex))
        .replace('{title}', 'Highlight');

      const publishIso = publishTime.toISOString();
      const upMsg = `Uploading Short #${shortIndex} to YouTube (Scheduled for ${publishIso})...`;
      appendJobLog(jobId, upMsg);
      console.log(`[YouTube API Step] ${upMsg}`);

      let uploadStatus: 'scheduled' | 'uploaded' | 'failed' = 'scheduled';
      let ytRes: any = null;
      let uploadErr: string | undefined = undefined;

      try {
        ytRes = await uploadToYouTube({
          filePath: item.path,
          title: formattedTitle,
          description: job.description || 'Generated automatically with ytshorts AI',
          tags: job.tags || ['Shorts', 'Viral'],
          privacyStatus: job.privacy || 'private',
          publishAt: publishIso,
        });

        const successMsg = `Short #${shortIndex} successfully uploaded & scheduled on YouTube! URL: ${ytRes.youtubeUrl}`;
        appendJobLog(jobId, successMsg);
        console.log(`[YouTube API Success] ${successMsg}`);
      } catch (err: any) {
        uploadStatus = 'failed';
        uploadErr = err.message || String(err);
        const errLogMsg = `YouTube upload error for Short #${shortIndex}: ${uploadErr}`;
        appendJobLog(jobId, errLogMsg);
        console.error(`[YouTube API Error] ${errLogMsg}`);
      }

      const shortResult: ShortResult = {
        id: `short_${Date.now()}_${shortIndex}`,
        jobId: jobId,
        title: formattedTitle,
        filePath: item.path,
        fileName: item.name,
        fileSizeMB: item.size_mb,
        durationSeconds: item.duration,
        youtubeVideoId: ytRes?.videoId,
        youtubeUrl: ytRes?.youtubeUrl,
        scheduledPublishAt: publishIso,
        uploadStatus: uploadStatus,
        uploadError: uploadErr,
        score: 10.0,
        createdAt: new Date().toISOString(),
      };

      shortsResults.push(shortResult);

      // Auto-delete local MP4 file post upload ONLY if upload succeeded AND autoDelete is enabled
      if (uploadStatus === 'scheduled' && settings.autoDeleteAfterUpload && fs.existsSync(item.path)) {
        try {
          fs.unlinkSync(item.path);
          appendJobLog(jobId, `Auto-deleted rendered short file post-upload: ${item.name}`);
          console.log(`[Storage] Auto-deleted rendered short file: ${item.name}`);
        } catch (e) {
          console.error('Failed to auto-delete rendered short:', e);
        }
      } else if (fs.existsSync(item.path)) {
        appendJobLog(jobId, `Retained rendered short file on disk for local preview: ${item.name}`);
        console.log(`[Storage] Retained rendered short file on disk for preview: ${item.name}`);
      }

      // Increment time for next short
      publishTime = new Date(publishTime.getTime() + intervalHours * 60 * 60 * 1000);
    }

    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      currentStepMessage: 'All Shorts rendered, scheduled on YouTube, and retained/cleaned up!',
      shorts: shortsResults,
      completedAt: new Date().toISOString(),
    });

    appendJobLog(jobId, 'Batch job processing completed successfully!');
  } catch (error: any) {
    appendJobLog(jobId, `ERROR in batch runner: ${error.message}`);
    updateJob(jobId, {
      status: 'failed',
      error: error.message,
      currentStepMessage: 'Processing failed.',
    });
  }
}
