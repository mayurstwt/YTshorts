export interface ShortResult {
  id: string;
  jobId: string;
  title: string;
  filePath: string;
  fileName: string;
  fileSizeMB: number;
  durationSeconds: number;
  score: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  scheduledPublishAt?: string;
  uploadStatus: 'pending' | 'uploading' | 'scheduled' | 'uploaded' | 'failed';
  uploadError?: string;
  createdAt: string;
}

export interface BatchJob {
  id: string;
  url: string;
  numShorts: number;
  whisperModel: string;
  titleTemplate: string;
  description: string;
  tags: string[];
  privacy: 'private' | 'unlisted' | 'public';
  publishIntervalHours: number;
  status: 'queued' | 'downloading' | 'analyzing' | 'transcribing' | 'rendering' | 'uploading' | 'completed' | 'failed';
  progress: number;
  currentStepMessage: string;
  shorts: ShortResult[];
  logs: string[];
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AppSettings {
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRefreshToken: string;
  cronSecretKey: string;
  defaultWhisperModel: string;
  defaultNumShorts: number;
  defaultPublishIntervalHours: number;
  defaultPrivacy: 'private' | 'unlisted' | 'public';
  autoDeleteAfterUpload: boolean;
}
