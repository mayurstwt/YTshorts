import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get('name');

  if (!fileName) {
    return new NextResponse('Missing video filename', { status: 400 });
  }

  // Prevent path traversal
  const safeName = path.basename(fileName);
  const filePath = path.join(process.cwd(), 'output', safeName);

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Video file not found or auto-deleted', { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    const headers = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize.toString(),
      'Content-Type': 'video/mp4',
    };

    // @ts-ignore stream to Response in Node
    return new NextResponse(fileStream as any, {
      status: 206,
      headers,
    });
  } else {
    const headers = {
      'Content-Length': fileSize.toString(),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    const fileStream = fs.createReadStream(filePath);
    // @ts-ignore stream to Response in Node
    return new NextResponse(fileStream as any, {
      status: 200,
      headers,
    });
  }
}
