import { useEffect, useState } from 'react';
import type { FramePatch, Job } from '../lib/api';

interface EditProps {
  job: Job;
  onUpdateFrame: (index: number, patch: FramePatch) => Promise<void>;
  onBack: () => void;
  onSave: () => void;
}

const fieldStyle = { background: '#F5F1E8', border: '1px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' };

const parsePoints = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 8);

export default function Edit({ job, onUpdateFrame, onBack, onSave }: EditProps) {
  const frames = job.frames;
  const [selected, setSelected] = useState(0);
  const [heading, setHeading] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const frame = frames[selected];

  // Load the selected frame's text into the editor whenever the selection changes.
  useEffect(() => {
    const f = frames[selected];
    setHeading(f?.heading ?? '');
    setPoints((f?.key_points ?? []).join('\n'));
    setNote(f?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const run = async (index: number, patch: FramePatch) => {
    setError('');
    try {
      await onUpdateFrame(index, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that change');
    }
  };

  /** Save whatever was edited in the text fields (only the parts that changed). */
  const commitText = async () => {
    if (!frame) return;
    const patch: FramePatch = {};
    const newPoints = parsePoints(points);
    if (heading.trim() !== (frame.heading ?? '')) patch.heading = heading.trim();
    if (JSON.stringify(newPoints) !== JSON.stringify(frame.key_points ?? [])) patch.key_points = newPoints;
    if (note.trim() !== (frame.note ?? '')) patch.note = note.trim();
    if (Object.keys(patch).length) await run(frame.index, patch);
  };

  const includedCount = frames.filter((f) => f.included !== false).length;
  const isIncluded = frame?.included !== false;

  if (!frame) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F5F1E8' }}>
        <p style={{ color: '#68645F', fontFamily: 'Inter' }}>There are no frames to edit.</p>
        <button onClick={onBack} className="px-5 py-2 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>
          Back to results
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 h-14"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <button onClick={async () => { await commitText(); onBack(); }} className="flex items-center gap-2 text-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to results
        </button>
        <h1 className="text-sm font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>Review your study pages</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { await commitText(); onSave(); }}
            className="text-sm font-medium px-4 py-1.5 rounded-full"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            Save Changes
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Sidebar — frame list */}
        <div className="w-52 flex-shrink-0 overflow-y-auto p-3 space-y-2" style={{ background: '#FFFDF9', borderRight: '1px solid #E2DDD3' }}>
          <p className="text-xs font-bold uppercase tracking-wide px-1 mb-3" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>
            {includedCount} of {frames.length} frames included
          </p>
          {frames.map((f, i) => {
            const on = f.included !== false;
            return (
              <button
                key={f.index}
                onClick={async () => { await commitText(); setSelected(i); }}
                className="w-full text-left rounded-xl overflow-hidden transition-all"
                style={{ border: `1.5px solid ${selected === i ? '#7A263A' : 'transparent'}`, opacity: on ? 1 : 0.5 }}
              >
                <div className="relative">
                  <img src={f.url} alt={f.heading || `Moment ${f.index}`} className="w-full h-14 object-cover" />
                  <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold px-1 rounded" style={{ background: 'rgba(122,38,58,0.8)', color: '#C5A46D', fontFamily: 'Inter' }}>
                    {f.time}
                  </span>
                  {!on && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(245,241,232,0.5)' }}>
                      <span className="text-[9px] font-bold" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Excluded</span>
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5" style={{ background: selected === i ? '#F7EEEA' : '#F5F1E8' }}>
                  <p className="text-[11px] font-semibold truncate" style={{ color: selected === i ? '#7A263A' : '#151515', fontFamily: 'DM Sans' }}>
                    {f.heading || `Moment ${f.index}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main preview */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          <div className="w-full max-w-xl">
            <div className="rounded-2xl overflow-hidden shadow-xl" style={{ border: '1.5px solid #E2DDD3', background: '#F5F1E8', opacity: isIncluded ? 1 : 0.6 }}>
              <img src={frame.url} alt={frame.heading || `Moment ${frame.index}`} className="w-full object-contain" style={{ maxHeight: 340, background: '#EDE9E0' }} />
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>{frame.time}</span>
                  <div className="w-1 h-1 rounded-full" style={{ background: '#E2DDD3' }} />
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EFE3CC', color: '#7A263A', fontFamily: 'DM Sans', fontWeight: 600 }}>
                    {heading.trim() || `Moment ${frame.index}`}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {parsePoints(points).map((p, k) => (
                    <li key={k} className="text-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>• {p}</li>
                  ))}
                </ul>
              </div>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-center" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>}
          </div>
        </div>

        {/* Right panel — details */}
        <div className="w-72 flex-shrink-0 overflow-y-auto p-5" style={{ background: '#FFFDF9', borderLeft: '1px solid #E2DDD3' }}>
          <h3 className="text-sm font-bold mb-5" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Frame details</h3>

          <div className="mb-4">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Timestamp</p>
            <div className="px-3 py-2 rounded-xl text-sm" style={{ ...fieldStyle, color: '#C5A46D', fontWeight: 500 }}>{frame.time}</div>
          </div>

          <div className="mb-4">
            <label htmlFor="heading" className="block text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Heading</label>
            <input
              id="heading"
              value={heading}
              maxLength={120}
              onChange={(e) => setHeading(e.target.value)}
              onBlur={commitText}
              placeholder={`Moment ${frame.index}`}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={fieldStyle}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="points" className="block text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>
              Key points <span style={{ fontWeight: 400 }}>(one per line)</span>
            </label>
            <textarea
              id="points"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              onBlur={commitText}
              rows={6}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={fieldStyle}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="note" className="block text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>My note</label>
            <textarea
              id="note"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commitText}
              rows={3}
              placeholder="Appears under the key points in the PDF"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={fieldStyle}
            />
          </div>

          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Include in PDF</p>
            <button
              onClick={() => run(frame.index, { included: !isIncluded })}
              role="switch"
              aria-checked={isIncluded}
              className="w-10 h-6 rounded-full transition-all relative"
              style={{ background: isIncluded ? '#7A263A' : '#E2DDD3' }}
            >
              <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all" style={{ background: '#F5F1E8', left: isIncluded ? '50%' : '2px' }} />
            </button>
          </div>
          {includedCount === 0 && (
            <p className="text-xs" style={{ color: '#C05050', fontFamily: 'Inter' }}>Keep at least one frame to build a PDF.</p>
          )}
        </div>
      </div>
    </div>
  );
}
