import { google } from 'googleapis';
import fs from 'fs';
import { getSettings } from './store';

export interface YouTubeUploadParams {
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'private' | 'unlisted' | 'public';
  publishAt?: string; // ISO 8601 string, e.g. "2026-08-01T14:00:00Z"
}

export interface YouTubeUploadResult {
  videoId: string;
  youtubeUrl: string;
  scheduledPublishAt?: string;
}

export async function uploadToYouTube(params: YouTubeUploadParams): Promise<YouTubeUploadResult> {
  const settings = getSettings();
  const clientId = settings.youtubeClientId || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = settings.youtubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = settings.youtubeRefreshToken || process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('YouTube OAuth credentials (Client ID, Client Secret, Refresh Token) are missing in Settings.');
  }

  if (!fs.existsSync(params.filePath)) {
    throw new Error(`Video file not found at path: ${params.filePath}`);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client,
  });

  const fileSize = fs.statSync(params.filePath).size;
  const mediaBody = fs.createReadStream(params.filePath);

  const requestBody: any = {
    snippet: {
      title: params.title.slice(0, 100), // Max 100 chars
      description: params.description,
      tags: params.tags || ['Shorts', 'YouTubeShorts', 'Viral'],
      categoryId: '22', // People & Blogs
    },
    status: {
      privacyStatus: params.privacyStatus || 'private',
      selfDeclaredMadeForKids: false,
    },
  };

  // If a publishAt ISO date is provided and privacy is private, set publishAt timestamp
  if (params.publishAt && params.privacyStatus === 'private') {
    requestBody.status.publishAt = params.publishAt;
  }

  console.log(`[YouTube API] Uploading ${params.filePath} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`);

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody,
    media: {
      body: mediaBody,
    },
  });

  const videoId = response.data.id;
  if (!videoId) {
    throw new Error('YouTube API returned response without a video ID.');
  }

  const youtubeUrl = `https://youtube.com/shorts/${videoId}`;
  console.log(`[YouTube API] Upload complete! Video ID: ${videoId}, URL: ${youtubeUrl}`);

  return {
    videoId,
    youtubeUrl,
    scheduledPublishAt: params.publishAt,
  };
}
