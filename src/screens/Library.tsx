import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import { api, type LectureCard } from '../lib/api';
import { pdfFilename, saveBlob } from '../lib/download';

interface LibraryProps {
  email: string;
  onOpen: (id: string) => Promise<void>;
  onView: (id: string) => Promise<void>;
  onNew: () => void;
  onSignOut: () => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Library({ email, onOpen, onView, onNew, onSignOut }: LibraryProps) {
  const [lectures, setLectures] = useState<LectureCard[] | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setError('');
    setLectures(null);
    api.listLectures().then(setLectures).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your library'));
  };

  useEffect(load, []);

  const open = async (id: string, view = false) => {
    setBusy(id);
    setError('');
    try {
      await (view ? onView(id) : onOpen(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that lecture');
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await api.deleteJob(id);
      setLectures((l) => l && l.filter((x) => x.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that lecture');
    } finally {
      setBusy(null);
    }
  };

  const saveName = async () => {
    if (!renaming) return;
    const title = renaming.value.trim();
    const current = lectures?.find((l) => l.id === renaming.id);
    setRenaming(null);
    if (!title || title === current?.title) return;
    try {
      const res = await api.renameJob(renaming.id, title);
      setLectures((l) => l && l.map((x) => (x.id === renaming.id ? { ...x, title: res.title } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename that lecture');
    }
  };

  const download = async (lecture: LectureCard) => {
    setBusy(lecture.id);
    setError('');
    try {
      saveBlob(await api.getPdfBlob(lecture.id), pdfFilename(lecture.title));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get the PDF');
    } finally {
      setBusy(null);
    }
  };

  const outline = { background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' } as const;

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 h-16"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <Logo size="sm" />
        <div className="flex items-center gap-4">
          <button
            onClick={onSignOut}
            title={email}
            className="text-sm"
            style={{ color: '#68645F', fontFamily: 'Inter', fontWeight: 500 }}
          >
            Sign out
          </button>
          <button
            onClick={onNew}
            className="text-sm font-semibold px-5 py-2 rounded-lg"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            New lecture
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <h1 className="text-3xl font-bold mb-1" style={{ color: '#7A263A', fontFamily: 'DM Sans', letterSpacing: '-0.02em' }}>
          Your library
        </h1>
        <p className="mb-8" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          {lectures ? (lectures.length ? `${lectures.length} saved ${lectures.length === 1 ? 'lecture' : 'lectures'}` : 'Lectures you process are saved here.') : ' '}
        </p>

        {error && (
          <div className="mb-6 flex items-center gap-3">
            <p role="alert" className="text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>
            <button onClick={load} className="text-sm font-semibold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>Try again</button>
          </div>
        )}

        {!lectures && !error && (
          <p className="text-sm animate-progress-pulse" style={{ color: '#68645F', fontFamily: 'Inter' }}>Loading your lectures…</p>
        )}

        {lectures && lectures.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
            <p className="text-base font-bold mb-2" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Nothing here yet</p>
            <p className="text-sm mb-6" style={{ color: '#68645F', fontFamily: 'Inter' }}>
              Paste a YouTube lecture and your finished notes will be saved to this library.
            </p>
            <button
              onClick={onNew}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            >
              Process a lecture
            </button>
          </div>
        )}

        {lectures && lectures.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {lectures.map((l) => (
              <div key={l.id} className="rounded-2xl overflow-hidden flex flex-col" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
                <button onClick={() => open(l.id)} className="block text-left" aria-label={`Open ${l.title ?? 'lecture'}`}>
                  <div className="h-40 w-full" style={{ background: '#EDE9E0' }}>
                    {l.thumbnail && <img src={l.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                </button>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div>
                    {renaming?.id === l.id ? (
                      <input
                        autoFocus
                        value={renaming.value}
                        maxLength={150}
                        onChange={(e) => setRenaming({ id: l.id, value: e.target.value })}
                        onBlur={saveName}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        className="w-full px-2 py-1 rounded-lg text-sm outline-none font-bold"
                        style={{ background: '#F5F1E8', border: '1.5px solid #C5A46D', color: '#151515', fontFamily: 'DM Sans' }}
                      />
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="text-sm font-bold leading-snug flex-1" style={{ color: '#151515', fontFamily: 'DM Sans', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {l.title || 'Untitled lecture'}
                        </p>
                        <button
                          onClick={() => setRenaming({ id: l.id, value: l.title ?? '' })}
                          aria-label="Rename"
                          title="Rename"
                          className="flex-shrink-0 mt-0.5"
                          style={{ color: '#C5A46D' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                            <path d="M3 13 L11 5 L14 8 L6 16 L2 16 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <p className="text-xs mt-1" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                      {formatDate(l.created_at)} · {l.frame_count} {l.frame_count === 1 ? 'page' : 'pages'}
                      {l.duration_s ? ` · ${Math.max(1, Math.round(l.duration_s / 60))} min` : ''}
                    </p>
                  </div>

                  {confirmDelete === l.id ? (
                    <div className="mt-auto flex items-center gap-2">
                      <span className="text-xs flex-1" style={{ color: '#C05050', fontFamily: 'Inter' }}>Delete this lecture for good?</span>
                      <button
                        onClick={() => remove(l.id)}
                        disabled={busy === l.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
                        style={{ background: '#C05050', color: '#FFFDF9', fontFamily: 'DM Sans' }}
                      >
                        {busy === l.id ? 'Deleting…' : 'Delete'}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={outline}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        onClick={() => open(l.id, true)}
                        disabled={busy === l.id}
                        className="text-xs font-semibold px-4 py-1.5 rounded-full disabled:opacity-60"
                        style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
                      >
                        {busy === l.id ? 'Opening…' : 'View PDF'}
                      </button>
                      <button onClick={() => open(l.id)} disabled={busy === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-60" style={outline}>
                        Edit
                      </button>
                      <button onClick={() => download(l)} disabled={busy === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-60" style={outline}>
                        Download
                      </button>
                      <button
                        onClick={() => setConfirmDelete(l.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full ml-auto"
                        style={{ background: '#FEF5F5', color: '#C05050', border: '1px solid #F5D5D5', fontFamily: 'DM Sans' }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
