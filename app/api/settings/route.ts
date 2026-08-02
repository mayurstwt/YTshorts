import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/store';

export async function GET() {
  const settings = getSettings();
  // Mask secret keys slightly for display security
  const safeSettings = {
    ...settings,
    hasYoutubeCredentials: Boolean(
      settings.youtubeClientId && settings.youtubeClientSecret && settings.youtubeRefreshToken
    ),
  };
  return NextResponse.json({ success: true, settings: safeSettings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = saveSettings(body);
    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully.',
      settings: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to save settings.' },
      { status: 500 }
    );
  }
}
