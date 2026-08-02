'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Play,
  Sparkles,
  Clock,
  Settings as SettingsIcon,
  Terminal as TerminalIcon,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  UploadCloud,
  Zap,
  RefreshCw,
  Layers,
  Film,
  Calendar,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import { BatchJob, AppSettings, ShortResult } from '@/lib/types';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'batch' | 'monitor' | 'library' | 'settings'>('batch');

  // Batch Form State
  const [urlsInput, setUrlsInput] = useState<string>('');
  const [numShorts, setNumShorts] = useState<number>(3);
  const [whisperModel, setWhisperModel] = useState<string>('base');
  const [titleTemplate, setTitleTemplate] = useState<string>('{title} - Part {n} #Shorts');
  const [description, setDescription] = useState<string>('Check out this amazing short clip! #Shorts #Viral');
  const [tagsInput, setTagsInput] = useState<string>('Shorts, Viral, Trending, AI');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [publishIntervalHours, setPublishIntervalHours] = useState<number>(4);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Monitor & Data State
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [copiedCronUrl, setCopiedCronUrl] = useState<boolean>(false);

  // Terminal scroll ref
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
    youtubeClientId: '',
    youtubeClientSecret: '',
    youtubeRefreshToken: '',
    cronSecretKey: 'ytshorts-cron-secret-2026',
    autoDeleteAfterUpload: true,
  });
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // Fetch initial data
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/batch');
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
      }
    } catch (e) {
      console.error('Failed to fetch jobs:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
        setSettingsForm({
          youtubeClientId: data.settings.youtubeClientId || '',
          youtubeClientSecret: data.settings.youtubeClientSecret || '',
          youtubeRefreshToken: data.settings.youtubeRefreshToken || '',
          cronSecretKey: data.settings.cronSecretKey || 'ytshorts-cron-secret-2026',
          autoDeleteAfterUpload: data.settings.autoDeleteAfterUpload ?? true,
        });
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchSettings();

    // Setup SSE log event stream
    const eventSource = new EventSource('/api/stream-logs');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.jobs) {
          setJobs(data.jobs);
        }
      } catch (e) {
        console.error('SSE JSON error:', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [jobs]);

  // Handle Batch Submit
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);

    const urls = urlsInput
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'));

    if (urls.length === 0) {
      setFormMessage({ type: 'error', text: 'Please enter at least one valid YouTube video URL.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          numShorts,
          whisperModel,
          titleTemplate,
          description,
          tags: tagsInput.split(',').map((t) => t.trim()),
          privacy,
          publishIntervalHours,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFormMessage({ type: 'success', text: `Successfully queued ${urls.length} video job(s)!` });
        setUrlsInput('');
        fetchJobs();
        setActiveTab('monitor');
      } else {
        setFormMessage({ type: 'error', text: data.error || 'Failed to submit batch job.' });
      }
    } catch (err: any) {
      setFormMessage({ type: 'error', text: err.message || 'Network error submitting batch.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (data.success) {
        setSettingsMsg('Settings saved successfully!');
        fetchSettings();
      } else {
        setSettingsMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setSettingsMsg(`Error: ${err.message}`);
    }
  };

  const activeJob =
    jobs.find((j) => ['downloading', 'analyzing', 'transcribing', 'rendering', 'uploading', 'queued'].includes(j.status)) ||
    (jobs.length > 0
      ? jobs.reduce((latest, j) => (new Date(j.createdAt).getTime() > new Date(latest.createdAt).getTime() ? j : latest), jobs[0])
      : null);
  const allShorts: ShortResult[] = jobs.flatMap((j) => j.shorts || []);

  const getCronUrl = () => {
    const host = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.netlify.app';
    const key = settingsForm.cronSecretKey || 'ytshorts-cron-secret-2026';
    return `${host}/api/cron-runner?key=${key}`;
  };

  const copyCronUrl = () => {
    navigator.clipboard.writeText(getCronUrl());
    setCopiedCronUrl(true);
    setTimeout(() => setCopiedCronUrl(false), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Top Navbar */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 pb-6 mb-8 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-rose-500 p-[2px] shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Film className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">
              ShortsAI Pipeline
            </h1>
            <p className="text-xs text-slate-400">Automated YouTube Shorts Generator & Native API Scheduler</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('batch')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'batch'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            Batch Desk
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'monitor'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <TerminalIcon className="w-4 h-4" />
            Live Monitor
            {jobs.some((j) => j.status === 'queued' || j.status === 'downloading') && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'library'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Film className="w-4 h-4" />
            Shorts ({allShorts.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            Settings
          </button>
        </div>
      </header>

      {/* TAB 1: BATCH GENERATOR DESK */}
      {activeTab === 'batch' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Batch Form */}
          <div className="lg:col-span-2 bg-slate-900/60 rounded-2xl border border-slate-800 p-6 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Batch Video Input</h2>
                <p className="text-xs text-slate-400">Paste 5 to 10 YouTube video links to convert into automated Shorts</p>
              </div>
            </div>

            <form onSubmit={handleBatchSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  YouTube Video Links (One URL per line)
                </label>
                <textarea
                  rows={5}
                  value={urlsInput}
                  onChange={(e) => setUrlsInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=...\nhttps://youtu.be/..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Shorts Per Video
                  </label>
                  <select
                    value={numShorts}
                    onChange={(e) => setNumShorts(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value={1}>1 Short per video</option>
                    <option value={2}>2 Shorts per video</option>
                    <option value={3}>3 Shorts per video (Recommended)</option>
                    <option value={4}>4 Shorts per video</option>
                    <option value={5}>5 Shorts per video</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Whisper AI Subtitle Model
                  </label>
                  <select
                    value={whisperModel}
                    onChange={(e) => setWhisperModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="tiny">Tiny (Fastest, lower accuracy)</option>
                    <option value="base">Base (Balanced - Recommended)</option>
                    <option value="small">Small (Better accuracy)</option>
                    <option value="medium">Medium (High accuracy)</option>
                    <option value="large-v3">Large-v3 (Maximum precision)</option>
                  </select>
                </div>
              </div>

              {/* YouTube Upload & Scheduling Configuration */}
              <div className="pt-4 border-t border-slate-800/80 space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                  <YoutubeIcon className="w-4 h-4" /> YouTube Auto-Upload & Native Scheduling
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Title Template ({'{n}'} = part number)
                    </label>
                    <input
                      type="text"
                      value={titleTemplate}
                      onChange={(e) => setTitleTemplate(e.target.value)}
                      placeholder="{title} - Part {n} #Shorts"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Publish Interval (Hours between releases)
                    </label>
                    <select
                      value={publishIntervalHours}
                      onChange={(e) => setPublishIntervalHours(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value={1}>1 Short every hour</option>
                      <option value={2}>1 Short every 2 hours</option>
                      <option value={4}>1 Short every 4 hours (Recommended)</option>
                      <option value={6}>1 Short every 6 hours</option>
                      <option value={12}>1 Short every 12 hours</option>
                      <option value={24}>1 Short per day (24 hours)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Tags (Comma separated)</label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="Shorts, Viral, Trending"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">YouTube Privacy</label>
                    <select
                      value={privacy}
                      onChange={(e) => setPrivacy(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="private">Private (Required for API Scheduling)</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {formMessage && (
                <div
                  className={`p-4 rounded-xl flex items-center gap-3 text-sm ${
                    formMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  }`}
                >
                  {formMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                  {formMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 px-6 rounded-xl font-bold bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-500 text-slate-950 hover:opacity-95 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" /> Queuing Batch...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" /> Launch Automated Batch Pipeline
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick Info & Active Status Panel */}
          <div className="space-y-6">
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 backdrop-blur-sm shadow-xl">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-cyan-400" /> Automated Pipeline Workflow
              </h3>

              <div className="space-y-3 text-xs text-slate-400">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">1</span>
                  <span><strong>yt-dlp Download</strong>: Fetches source YouTube video in 1080p MP4.</span>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">2</span>
                  <span><strong>PySceneDetect</strong>: Finds cut points and visual scene changes.</span>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">3</span>
                  <span><strong>Whisper AI</strong>: Generates word-level subtitles & highlight scores.</span>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">4</span>
                  <span><strong>FFmpeg 9:16 Render</strong>: Crops vertical video & burns subtitle boxes.</span>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">5</span>
                  <span><strong>YouTube Native Schedule</strong>: Uploads with calculated <code className="text-cyan-300">publishAt</code> dates & auto-deletes files post upload.</span>
                </div>
              </div>
            </div>

            {/* cron-job.org Trigger Badge */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 backdrop-blur-sm shadow-xl">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-teal-400" /> cron-job.org Integration
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Trigger queue processing automatically without leaving your computer on.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getCronUrl()}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-cyan-300 truncate"
                />
                <button
                  onClick={copyCronUrl}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 shrink-0 transition"
                  title="Copy Cron URL"
                >
                  {copiedCronUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE MONITOR & TERMINAL */}
      {activeTab === 'monitor' && (
        <div className="space-y-6">
          {/* Active Job Stepper */}
          {activeJob ? (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 backdrop-blur-sm shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Active Batch Job</span>
                  <h3 className="text-base font-semibold text-slate-100 truncate max-w-xl">{activeJob.url}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      activeJob.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : activeJob.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse'
                    }`}
                  >
                    {activeJob.status}
                  </span>
                  <span className="text-sm font-mono text-cyan-400 font-bold">{activeJob.progress}%</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${activeJob.progress}%` }}
                ></div>
              </div>

              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Status: <strong className="text-slate-200">{activeJob.currentStepMessage}</strong></span>
                <span>Shorts Requested: <strong className="text-slate-200">{activeJob.numShorts}</strong></span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-8 text-center text-slate-400">
              No active or queued jobs found. Submit a batch to monitor live progress!
            </div>
          )}

          {/* Terminal Console */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-mono text-slate-400 ml-2">ShortsAI Terminal Output & SSE Feed</span>
              </div>
              <button
                onClick={fetchJobs}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            <div className="p-4 h-96 overflow-y-auto font-mono text-xs text-slate-300 space-y-1.5 selection:bg-cyan-500/30">
              {activeJob && activeJob.logs && activeJob.logs.length > 0 ? (
                activeJob.logs.map((logStr, idx) => (
                  <div key={idx} className="leading-relaxed hover:bg-slate-900/50 rounded px-1">
                    {logStr.includes('ERROR') ? (
                      <span className="text-rose-400">{logStr}</span>
                    ) : logStr.includes('complete') || logStr.includes('successfully') ? (
                      <span className="text-emerald-400">{logStr}</span>
                    ) : (
                      <span className="text-slate-300">{logStr}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 italic">Waiting for pipeline execution logs...</div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SHORTS LIBRARY */}
      {activeTab === 'library' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Film className="w-5 h-5 text-cyan-400" /> Generated Shorts & YouTube Release Status ({allShorts.length})
            </h2>
          </div>

          {allShorts.length === 0 ? (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
              <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              No generated Shorts yet. Launch your first batch on the Batch Desk!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {allShorts.map((short) => (
                <div
                  key={short.id}
                  className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition"
                >
                  {/* Aspect Ratio 9:16 Video Container */}
                  <div className="relative aspect-[9/16] bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800 group">
                    <video
                      src={`/api/video?name=${encodeURIComponent(short.fileName)}`}
                      controls
                      preload="metadata"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Hide broken video element if file was auto-deleted from disk
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 text-center pointer-events-none -z-10">
                      <Film className="w-10 h-10 text-slate-700 mb-2" />
                      <span className="text-[11px] text-slate-500">Video preview unavailable</span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 text-xs font-semibold text-slate-200 truncate bg-slate-950/80 px-2 py-1 rounded border border-slate-800/60 pointer-events-none">
                      {short.title}
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Duration: {short.durationSeconds}s</span>
                      <span className="text-slate-400">Size: {short.fileSizeMB} MB</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      {short.uploadStatus === 'scheduled' || short.uploadStatus === 'uploaded' ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> YouTube Native Scheduled
                          </div>
                          {short.scheduledPublishAt && (
                            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-cyan-400" />
                              {new Date(short.scheduledPublishAt).toLocaleString()}
                            </div>
                          )}
                          {short.youtubeUrl && (
                            <a
                              href={short.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 text-xs text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                            >
                              View on YouTube <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Upload Status: {short.uploadStatus}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SETTINGS & CRON GUIDE */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-slate-900/60 rounded-2xl border border-slate-800 p-6 backdrop-blur-sm shadow-xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <YoutubeIcon className="w-5 h-5 text-rose-500" /> YouTube Data API v3 OAuth Configuration
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your Google Cloud Console OAuth 2.0 Client ID, Client Secret, and Refresh Token to enable native background uploads.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">YouTube Client ID</label>
                <input
                  type="text"
                  value={settingsForm.youtubeClientId}
                  onChange={(e) => setSettingsForm({ ...settingsForm, youtubeClientId: e.target.value })}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">YouTube Client Secret</label>
                <input
                  type="password"
                  value={settingsForm.youtubeClientSecret}
                  onChange={(e) => setSettingsForm({ ...settingsForm, youtubeClientSecret: e.target.value })}
                  placeholder="GOCSPX-xxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">YouTube Refresh Token</label>
                <input
                  type="password"
                  value={settingsForm.youtubeRefreshToken}
                  onChange={(e) => setSettingsForm({ ...settingsForm, youtubeRefreshToken: e.target.value })}
                  placeholder="1//04xxxx..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Cron Secret Key (for cron-job.org)</label>
                <input
                  type="text"
                  value={settingsForm.cronSecretKey}
                  onChange={(e) => setSettingsForm({ ...settingsForm, cronSecretKey: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              {settingsMsg && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-cyan-400">
                  {settingsMsg}
                </div>
              )}

              <button
                type="submit"
                className="py-3 px-6 rounded-xl font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition"
              >
                Save Settings
              </button>
            </form>
          </div>

          <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 backdrop-blur-sm shadow-xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-400" /> How to Setup cron-job.org
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-400 leading-relaxed">
              <li>Create a free account on <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-cyan-400 underline">cron-job.org</a>.</li>
              <li>Click <strong>Create Cronjob</strong>.</li>
              <li>Paste your Cron URL: <br/><code className="text-cyan-300 font-mono break-all">{getCronUrl()}</code></li>
              <li>Set schedule interval to <strong>Every 1 hour</strong> or <strong>Every 4 hours</strong>.</li>
              <li>Click Save. Now your application will automatically wake up and process queued video batches with zero manual effort!</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}
