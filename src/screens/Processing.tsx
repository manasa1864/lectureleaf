import { useState, useEffect } from 'react';
import { api, type Job } from '../lib/api';

interface ProcessingProps {
  jobId: string;
  url: string;
  onComplete: (job: Job) => void;
  onFail: () => void;
}

const steps = [
  { label: 'Lecture loaded', done: true },
  { label: 'Visual changes detected', done: true },
  { label: 'Redundant frames removed', done: true },
  { label: 'Organizing study pages', active: true },
  { label: 'Preparing PDF', done: false },
];

function LeafSpinner() {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: '2px solid #E2DDD3' }}
      />
      <div
        className="absolute inset-0 rounded-full animate-spin-slow"
        style={{
          border: '2px solid transparent',
          borderTopColor: '#C5A46D',
          borderRightColor: '#C5A46D',
        }}
      />
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4C14 4 22 8 22 14C22 18.5 18.5 22 14 22C9.5 22 6 18.5 6 14C6 14 10 17 14 14C18 11 14 4 14 4Z" fill="#C5A46D" opacity="0.7" />
        <path d="M14 22 L14 25" stroke="#C5A46D" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function Processing({ jobId, url, onComplete, onFail }: ProcessingProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
  const progress = job?.progress ?? 2;
  const activeStep = Math.min(job?.step ?? 0, steps.length);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const j = await api.getJob(jobId);
        if (cancelled) return;
        failures = 0;
        setJob(j);
        if (j.status === 'done') {
          timer = setTimeout(() => onComplete(j), 600);
          return;
        }
        if (j.status === 'error') return setError(j.error || 'Processing failed');
      } catch (err) {
        if (cancelled) return;
        // A few failed polls in a row are usually a network blip; only give up after several.
        if (++failures >= 5) return setError(err instanceof Error ? err.message : 'Lost contact with the server');
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, onComplete]);

  const displayedSteps = steps.map((s, i) => ({
    ...s,
    done: i < activeStep,
    active: i === activeStep && !error,
  }));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#F5F1E8' }}
    >
      <div className="w-full max-w-md">
        {/* Animated leaf */}
        <div className="flex justify-center mb-10">
          <LeafSpinner />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2" style={{ color: '#7A263A', fontFamily: 'DM Sans', letterSpacing: '-0.02em' }}>
          Building your LectureLeaf…
        </h1>
        <p className="text-center mb-8" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          We're finding the moments that are worth remembering.
        </p>

        {/* Video info */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl mb-8"
          style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}
        >
          <div className="w-14 h-10 rounded-lg overflow-hidden flex-shrink-0">
            {videoId && <img src={`https://img.youtube.com/vi/${videoId}/default.jpg`} alt="Lecture thumbnail" className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
              {job?.title || 'Loading lecture…'}
            </p>
            {job?.duration_s ? <p className="text-xs" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>{Math.round(job.duration_s / 60)} min</p> : null}
          </div>
          <span className="text-2xl font-bold tabular-nums" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>
            {Math.min(Math.round(progress), 100)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative h-2 rounded-full mb-8" style={{ background: '#E2DDD3' }}>
          <div
            className="absolute top-0 left-0 h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(progress, 100)}%`,
              background: 'linear-gradient(to right, #C5A46D, #7A263A)',
            }}
          />
          {/* Gold pulse dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full -ml-1.5 animate-progress-pulse"
            style={{
              left: `${Math.min(progress, 100)}%`,
              background: '#C5A46D',
              boxShadow: '0 0 8px rgba(197,164,109,0.5)',
            }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {displayedSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: step.done ? '#7A263A' : step.active ? '#EFE3CC' : 'transparent',
                  border: step.done ? 'none' : `1.5px solid ${step.active ? '#C5A46D' : '#E2DDD3'}`,
                }}
              >
                {step.done ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#F5F1E8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : step.active ? (
                  <div className="w-1.5 h-1.5 rounded-full animate-progress-pulse" style={{ background: '#7A263A' }} />
                ) : null}
              </div>
              <span
                className="text-sm"
                style={{
                  color: step.done ? '#151515' : step.active ? '#7A263A' : '#C5A46D',
                  fontFamily: 'Inter',
                  fontWeight: step.active ? 500 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-8 text-center">
            <p role="alert" className="text-sm mb-4" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>
            <button
              onClick={onFail}
              className="px-6 py-2.5 rounded-full text-sm font-semibold"
              style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            >
              Back to settings
            </button>
          </div>
        )}

        <p className="text-center mt-10 text-xs" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>
          This usually takes 2–4 minutes for a full lecture.
        </p>
      </div>
    </div>
  );
}
