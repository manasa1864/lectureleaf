import { useState } from 'react';
import Logo from '../components/Logo';
import type { FramePatch, Job } from '../lib/api';
import { pdfFilename, saveBlob } from '../lib/download';

interface ResultsProps {
  job: Job;
  onUpdateFrame: (index: number, patch: FramePatch) => Promise<void>;
  onGetPdf: () => Promise<Blob>;
  onPreview: () => void;
  onEdit: () => void;
  onBack: () => void;
}

export default function Results({ job, onUpdateFrame, onGetPdf, onPreview, onEdit, onBack }: ResultsProps) {
  const [activeTab, setActiveTab] = useState<'frames' | 'topics'>('frames');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const frames = job.frames;
  const keptCount = frames.filter((f) => f.included !== false).length;
  const hasTopics = frames.some((f) => f.heading);

  const toggleKeep = (index: number, included: boolean) => {
    setError('');
    onUpdateFrame(index, { included }).catch((err) =>
      setError(err instanceof Error ? err.message : 'Could not save that change'),
    );
  };

  const downloadPdf = async () => {
    setError('');
    setDownloading(true);
    try {
      saveBlob(await onGetPdf(), pdfFilename(job.title));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get the PDF');
    } finally {
      setDownloading(false);
    }
  };

  const stats = [
    { value: `${keptCount}`, label: 'Important frames' },
    ...(job.duration_s ? [{ value: `${Math.max(1, Math.round(job.duration_s / 60))}m`, label: 'Lecture duration' }] : []),
  ];

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 h-16"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <button onClick={onBack} className="flex items-center gap-2 text-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          New lecture
        </button>
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          <button
            onClick={onEdit}
            className="text-sm font-medium px-4 py-2 rounded-full transition-all"
            style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#C5A46D')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E2DDD3')}
          >
            Edit Results
          </button>
          <button
            onClick={onPreview}
            disabled={keptCount === 0}
            className="text-sm font-medium px-4 py-2 rounded-full transition-all disabled:opacity-50"
            style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}
          >
            Preview
          </button>
          <button
            onClick={downloadPdf}
            disabled={!job.has_pdf || downloading || keptCount === 0}
            className="text-sm font-medium px-5 py-2 rounded-full transition-all flex items-center gap-2 disabled:opacity-50"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2 L7 9 M4 6.5 L7 9 L10 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
        {/* Hero result */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#C5A46D' }} />
            <span className="text-sm font-semibold" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>Processing complete</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2" style={{ color: '#7A263A', fontFamily: 'DM Sans', letterSpacing: '-0.02em' }}>
            Your LectureLeaf is ready.
          </h1>
          {job.title && <p className="text-sm mb-1" style={{ color: '#151515', fontFamily: 'DM Sans', fontWeight: 600 }}>{job.title}</p>}
          <p style={{ color: '#68645F', fontFamily: 'Inter' }}>
            We found {keptCount} useful visual moments from this lecture.
          </p>
          {job.summary && (
            <p className="mt-4 text-sm leading-relaxed max-w-2xl" style={{ color: '#151515', fontFamily: 'Inter' }}>{job.summary}</p>
          )}
          {job.warning && (
            <p className="mt-4 text-xs p-3 rounded-lg max-w-2xl" style={{ background: '#F7EEEA', border: '1px solid #C5A46D', color: '#7A263A', fontFamily: 'Inter' }}>
              {job.warning}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {stats.map((stat) => (
            <div key={stat.label} className="p-5 rounded-2xl" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
              <p className="text-3xl font-bold mb-1" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>{stat.value}</p>
              <p className="text-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}>
          {([['frames', 'Captured moments'], ['topics', 'Topic structure']] as const)
            .filter(([id]) => id === 'frames' || hasTopics)
            .map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeTab === id ? '#F5F1E8' : 'transparent',
                  color: activeTab === id ? '#7A263A' : '#68645F',
                  fontFamily: 'DM Sans',
                  boxShadow: activeTab === id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                  border: activeTab === id ? '1px solid #E2DDD3' : '1px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
        </div>

        {activeTab === 'frames' || !hasTopics ? (
          <>
            <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Captured moments</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {frames.map((frame) => {
                const kept = frame.included !== false;
                const points = frame.key_points?.length ? frame.key_points : [`Captured at ${frame.time}`];
                return (
                  <div
                    key={frame.index}
                    className="rounded-2xl overflow-hidden transition-all"
                    style={{
                      border: `1.5px solid ${kept ? '#E2DDD3' : '#EDE9E0'}`,
                      background: kept ? '#F5F1E8' : '#FFFDF9',
                      opacity: kept ? 1 : 0.5,
                    }}
                  >
                    <div className="relative">
                      <img src={frame.url} alt={frame.heading || `Moment ${frame.index}`} className="w-full h-28 object-cover" />
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: 'rgba(122,38,58,0.85)', color: '#C5A46D', fontFamily: 'Inter' }}>
                        {frame.time}
                      </div>
                      <button
                        onClick={() => toggleKeep(frame.index, !kept)}
                        aria-label={kept ? 'Remove from PDF' : 'Include in PDF'}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all"
                        style={{ background: kept ? '#7A263A' : 'rgba(245,241,232,0.9)' }}
                      >
                        {kept ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5L4.5 7.5L8.5 2.5" stroke="#F5F1E8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2L8 8M8 2L2 8" stroke="#68645F" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>
                        {frame.heading || `Moment ${frame.index}`}
                      </span>
                      <ul className="mt-1 space-y-1">
                        {points.map((pt, k) => (
                          <li key={k} className="text-xs leading-snug" style={{ color: '#68645F', fontFamily: 'Inter' }}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Your lecture, organized.</h2>
            <div className="space-y-3">
              {frames.map((f, i) => (
                <div
                  key={f.index}
                  className="flex items-center gap-4 p-4 rounded-2xl transition-all"
                  style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3', opacity: f.included === false ? 0.5 : 1 }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#C5A46D')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E2DDD3')}
                >
                  <span className="text-sm font-bold w-8 flex-shrink-0" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="w-14 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img src={f.url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: '#151515', fontFamily: 'DM Sans' }}>{f.heading || `Moment ${f.index}`}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>
                      {f.time} – {frames[i + 1]?.time ?? 'end'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
