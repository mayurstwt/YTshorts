import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShortsAI — Automated YouTube Shorts Generator & Scheduler',
  description: 'Convert YouTube videos to 9:16 vertical Shorts automatically with AI transcription and YouTube API native scheduling.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-white font-sans antialiased">
        <div className="relative min-h-screen flex flex-col">
          {/* Background Ambient Glow */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
            <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl"></div>
          </div>
          <main className="relative z-10 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
