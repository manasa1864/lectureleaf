import { useEffect, useState } from 'react';
import type { Job } from '../lib/api';
import { pdfFilename, saveBlob } from '../lib/download';

interface PreviewProps {
  job: Job;
  onGetPdf: () => Promise<Blob>;
  onBack: () => void;
  onEdit: () => void;
}

/** Shows the real PDF, rebuilt first if frames were changed since it was generated. */
export default function Preview({ job, onGetPdf, onBack, onEdit }: PreviewProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setBlob(null);
    setSrc('');
    setError('');
    onGetPdf()
      .then((b) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setSrc(objectUrl);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the PDF'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // onGetPdf changes identity on every render of the parent; load once per visit (or retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="flex flex-col" style={{ background: '#EDE9E0', height: '100vh' }}>
      {/* Controls bar */}
      <div
        className="flex items-center justify-between px-6 h-14 gap-4 flex-shrink-0"
        style={{ background: 'rgba(245,241,232,0.94)', borderBottom: '1px solid #E2DDD3' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm transition-colors flex-shrink-0"
            style={{ color: '#68645F', fontFamily: 'Inter' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#7A263A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#68645F')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to results
          </button>
          <span className="text-sm font-bold truncate" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>
            {job.title || 'Study Pages'}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onEdit}
            className="text-sm font-medium px-4 py-1.5 rounded-full transition-all"
            style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}
          >
            Edit
          </button>
          <button
            onClick={() => blob && saveBlob(blob, pdfFilename(job.title))}
            disabled={!blob}
            className="text-sm font-medium px-4 py-1.5 rounded-full flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 2 L6.5 8.5 M4 6.5 L6.5 9 L9 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="1.5" y1="11" x2="11.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {src && <iframe title="PDF preview" src={src} className="absolute inset-0 w-full h-full border-0" />}
        {!src && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm animate-progress-pulse" style={{ color: '#68645F', fontFamily: 'Inter' }}>
              Preparing your preview…
            </p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p role="alert" className="text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="px-5 py-2 rounded-full text-sm font-semibold"
              style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
