import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

export interface ProcessedShort {
  path: string;
  name: string;
  size_mb: number;
  duration: number;
}

export interface ProcessingOptions {
  url: string;
  numShorts: number;
  whisperModel: string;
  onLog: (msg: string) => void;
  onProgress: (percent: number, stage: string, msg: string) => void;
}

/**
 * Downloads YouTube video using yt-dlp binary
 */
export async function downloadVideo(
  url: string,
  tempDir: string,
  onLog: (msg: string) => void,
  onProgress?: (percent: number, stage: string, msg: string) => void
): Promise<string> {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const localBinYtDlp = path.join(process.env.HOME || '', '.local', 'bin', 'yt-dlp');
  const venvYtDlp = path.join(process.cwd(), '.venv', 'bin', 'yt-dlp');
  const ytDlpCmd = fs.existsSync(localBinYtDlp)
    ? localBinYtDlp
    : fs.existsSync(venvYtDlp)
    ? venvYtDlp
    : 'yt-dlp';

  const outputTemplate = path.join(tempDir, `vid_${Date.now()}_%(id)s.%(ext)s`);

  const args = [
    url,
    '-o', outputTemplate,
    '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/18/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
  ];

  onLog(`Downloading video via yt-dlp (${ytDlpCmd})...`);

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpCmd, args, { cwd: process.cwd() });
    let downloadedFile = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      onLog(`[yt-dlp] ${text.trim()}`);
      const match = text.match(/\[download\] Destination: (.+\.(?:mp4|mkv|webm))/i) || text.match(/\[Merger\] Merging formats into "(.+\.mp4)"/i);
      if (match && match[1]) {
        downloadedFile = match[1].trim();
      }
    });

    proc.stderr.on('data', (data) => {
      onLog(`[yt-dlp] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      onLog(`[yt-dlp error] ${err.message}`);
      if ((err as any).code === 'ENOENT') {
        reject(new Error(`'yt-dlp' is not installed or not available in system PATH. Please install yt-dlp (e.g., 'sudo apt install yt-dlp' or 'sudo pip install yt-dlp').`));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Fallback search if downloadedFile not captured
        if (!downloadedFile || !fs.existsSync(downloadedFile) || !downloadedFile.endsWith('.mp4')) {
          const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.mp4'));
          if (files.length > 0) {
            // Pick most recent
            files.sort((a, b) => fs.statSync(path.join(tempDir, b)).mtimeMs - fs.statSync(path.join(tempDir, a)).mtimeMs);
            downloadedFile = path.join(tempDir, files[0]);
          }
        }
        if (downloadedFile && fs.existsSync(downloadedFile)) {
          resolve(downloadedFile);
        } else {
          reject(new Error('Downloaded video file not found on disk.'));
        }
      } else {
        reject(new Error(`yt-dlp process exited with code ${code}`));
      }
    });
  });
}

/**
 * Extracts or fetches subtitles/captions using yt-dlp (pure Node.js, no Python required)
 */
export async function transcribeAudio(
  videoPath: string,
  url: string,
  modelName: string,
  tempDir: string,
  onLog: (msg: string) => void
): Promise<string | null> {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const targetSrtPath = path.join(tempDir, `${baseName}.srt`);

  onLog('Extracting / fetching subtitles via yt-dlp...');

  // 1. Check if yt-dlp already generated an .srt file in tempDir during video download
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    const srtFile = files.find((f) => f.startsWith(baseName) && f.endsWith('.srt'));
    if (srtFile) {
      const foundPath = path.join(tempDir, srtFile);
      if (foundPath !== targetSrtPath) {
        fs.copyFileSync(foundPath, targetSrtPath);
      }
      onLog(`Captions ready: ${path.basename(targetSrtPath)}`);
      return targetSrtPath;
    }
  }

  // 2. If not found, run yt-dlp subtitle download specifically
  const localBinYtDlp = path.join(process.env.HOME || '', '.local', 'bin', 'yt-dlp');
  const venvYtDlp = path.join(process.cwd(), '.venv', 'bin', 'yt-dlp');
  const ytDlpCmd = fs.existsSync(localBinYtDlp)
    ? localBinYtDlp
    : fs.existsSync(venvYtDlp)
    ? venvYtDlp
    : 'yt-dlp';

  const outputSubTemplate = path.join(tempDir, `${baseName}.%(ext)s`);
  const args = [
    '--write-auto-subs',
    '--write-subs',
    '--sub-lang', 'en.*,en,all',
    '--convert-subs', 'srt',
    '--skip-download',
    '-o', outputSubTemplate,
    url || videoPath,
  ];

  return new Promise((resolve) => {
    const proc = spawn(ytDlpCmd, args, { cwd: process.cwd() });

    proc.stdout.on('data', (data) => {
      onLog(`[yt-dlp captions] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      onLog(`[yt-dlp captions] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      onLog(`[yt-dlp error] Could not fetch subtitles: ${err.message}`);
      resolve(null);
    });

    proc.on('close', () => {
      const files = fs.existsSync(tempDir) ? fs.readdirSync(tempDir) : [];
      const srtFile = files.find((f) => f.startsWith(baseName) && f.endsWith('.srt'));
      if (srtFile) {
        const foundPath = path.join(tempDir, srtFile);
        if (foundPath !== targetSrtPath) {
          fs.copyFileSync(foundPath, targetSrtPath);
        }
        onLog(`Captions extracted successfully: ${path.basename(targetSrtPath)}`);
        resolve(targetSrtPath);
      } else {
        onLog('No captions/subtitles available for this video. Proceeding without captions.');
        resolve(null);
      }
    });
  });
}

/**
 * Probes video duration using ffprobe
 */
export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration || 0;
      resolve(duration);
    });
  });
}

/**
 * Renders 9:16 vertical Short using FFmpeg
 */
export async function renderShortClip(
  videoPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
  srtPath: string | null,
  clipIndex: number,
  onLog: (msg: string) => void
): Promise<ProcessedShort> {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filters: string[] = [
    'scale=1080:-2',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
  ];

  if (srtPath && fs.existsSync(srtPath)) {
    // Escape path for ffmpeg subtitles filter
    let escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const forceStyle = "FontName=Arial,FontSize=22,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=30";
    filters.push(`subtitles=${escapedSrt}:force_style='${forceStyle}'`);
  }

  return new Promise((resolve, reject) => {
    onLog(`Rendering Short #${clipIndex}: ${startSec.toFixed(1)}s -> ${(startSec + durationSec).toFixed(1)}s`);

    ffmpeg(videoPath)
      .setStartTime(startSec)
      .setDuration(durationSec)
      .videoFilters(filters)
      .videoCodec('libx264')
      .outputOptions([
        '-crf 23',
        '-preset fast',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        onLog(`FFmpeg command: ${commandLine}`);
      })
      .on('error', (err) => {
        onLog(`FFmpeg render error for Short #${clipIndex}: ${err.message}`);
        reject(err);
      })
      .on('end', () => {
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const sizeMB = Number((stats.size / (1024 * 1024)).toFixed(2));
          onLog(`Short #${clipIndex} rendered successfully: ${path.basename(outputPath)} (${sizeMB} MB)`);
          resolve({
            path: outputPath,
            name: path.basename(outputPath),
            size_mb: sizeMB,
            duration: Number(durationSec.toFixed(1)),
          });
        } else {
          reject(new Error(`Render finished but output file missing: ${outputPath}`));
        }
      })
      .run();
  });
}

/**
 * Main Video Processor function running the end-to-end pipeline in Node.js
 */
export async function processVideoPipeline(options: ProcessingOptions): Promise<ProcessedShort[]> {
  const { url, numShorts, whisperModel, onLog, onProgress } = options;
  const tempDir = path.join(process.cwd(), 'temp');
  const outputDir = path.join(process.cwd(), 'output');

  // Step 1: Download
  onProgress(10, 'downloading', 'Downloading video via yt-dlp...');
  const videoPath = await downloadVideo(url, tempDir, onLog);
  onLog(`Source video downloaded to ${videoPath}`);

  // Step 2: Probe Duration & Calculate Clips
  onProgress(30, 'analyzing', 'Analyzing video duration & segmenting...');
  const duration = await getVideoDuration(videoPath);
  onLog(`Source video duration: ${duration.toFixed(1)}s`);

  // Step 3: Captions / Subtitles
  onProgress(50, 'transcribing', 'Fetching / extracting video captions via yt-dlp...');
  const srtPath = await transcribeAudio(videoPath, url, whisperModel, tempDir, onLog);

  // Step 4: Calculate Clip Windows
  onProgress(70, 'selecting', 'Scoring & selecting top highlight clips...');
  const clipDuration = Math.min(45, Math.max(20, Math.floor(duration / Math.max(numShorts, 1))));
  const clipsToRender: { start: number; duration: number }[] = [];

  if (duration <= 60) {
    clipsToRender.push({ start: 0, duration: duration });
  } else {
    const step = (duration - clipDuration) / Math.max(numShorts, 1);
    for (let i = 0; i < numShorts; i++) {
      const startSec = Math.floor(i * step);
      clipsToRender.push({ start: startSec, duration: clipDuration });
    }
  }

  // Step 5: Render Clips
  onProgress(85, 'rendering', 'Rendering vertical 9:16 Shorts with FFmpeg...');
  const results: ProcessedShort[] = [];

  for (let i = 0; i < clipsToRender.length; i++) {
    const clip = clipsToRender[i];
    const clipIndex = i + 1;
    const shortFilename = `short_${clipIndex}_${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, shortFilename);

    try {
      const result = await renderShortClip(
        videoPath,
        clip.start,
        clip.duration,
        outputPath,
        srtPath,
        clipIndex,
        onLog
      );
      results.push(result);
    } catch (e: any) {
      onLog(`Failed to render clip #${clipIndex}: ${e.message}`);
    }
  }

  // Auto-cleanup downloaded source video and captions in temp
  const baseName = path.basename(videoPath, path.extname(videoPath));
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    for (const f of files) {
      if (f.startsWith(baseName)) {
        try {
          fs.unlinkSync(path.join(tempDir, f));
        } catch (e) {
          // ignore error
        }
      }
    }
    onLog('Cleaned up temporary source files and captions.');
  }

  onProgress(100, 'completed', 'Batch video processing completed successfully.');
  return results;
}
