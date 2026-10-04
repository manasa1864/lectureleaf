import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import { api, type QuizListItem } from '../lib/api';

interface QuizzesProps {
  onStart: (quizId: string) => void;
  onReview: (attemptId: string, quizId: string, title: string | null) => Promise<void>;
  onNew: () => void;
  onLibrary: () => void;
  onSignOut: () => void;
}

const heading = { color: '#151515', fontFamily: 'DM Sans' } as const;
const muted = { color: '#68645F', fontFamily: 'Inter' } as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Quizzes({ onStart, onReview, onNew, onLibrary, onSignOut }: QuizzesProps) {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setError('');
    api.listQuizzes().then(setQuizzes).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your quizzes'));
  };
  useEffect(load, []);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await api.deleteQuiz(id);
      setQuizzes((q) => q && q.filter((x) => x.id !== id));
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that quiz');
    } finally {
      setBusy(null);
    }
  };

  const review = async (q: QuizListItem, attemptId: string) => {
    setBusy(q.id);
    try {
      await onReview(attemptId, q.id, q.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open those results');
      setBusy(null);
    }
  };

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 h-16"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}>
        <button onClick={onLibrary} className="text-sm" style={muted}>← Library</button>
        <Logo size="sm" />
        <div className="flex items-center gap-4">
          <button onClick={onSignOut} className="hidden sm:block text-sm" style={muted}>Sign out</button>
          <button onClick={onNew} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Generate Quiz</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-1" style={{ ...heading, color: '#7A263A', letterSpacing: '-0.02em' }}>My quizzes</h1>
        <p className="mb-8" style={muted}>{quizzes ? (quizzes.length ? `${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'}` : 'Quizzes you generate are kept here, with your scores.') : ' '}</p>

        {error && (
          <div className="mb-6 flex items-center gap-3">
            <p role="alert" className="text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>
            <button onClick={load} className="text-sm font-semibold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>Try again</button>
          </div>
        )}
        {!quizzes && !error && <p className="text-sm animate-progress-pulse" style={muted}>Loading your quizzes…</p>}

        {quizzes && quizzes.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
            <p className="text-base font-bold mb-2" style={heading}>No quizzes yet</p>
            <p className="text-sm mb-6" style={muted}>Pick a lecture from your library and turn it into a quiz.</p>
            <button onClick={onNew} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Generate a quiz</button>
          </div>
        )}

        <div className="space-y-4">
          {quizzes?.map((q) => {
            const last = q.attempts[0];
            const best = q.attempts.reduce((m, a) => Math.max(m, a.percent), 0);
            return (
              <div key={q.id} className="rounded-2xl p-5" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={heading}>{q.title || 'Untitled lecture'}</p>
                    <p className="text-xs mt-1" style={muted}>
                      {fmtDate(q.created_at)} · {q.n_questions} questions · {q.difficulty ?? 'mixed'}
                      {q.time_limit_min ? ` · ${q.time_limit_min} min` : ''}{q.strict ? ' · strict' : ''}
                    </p>
                  </div>
                  {last && (
                    <div className="text-right">
                      <p className="text-xl font-bold" style={{ ...heading, color: '#7A263A' }}>{Math.round(last.percent)}%</p>
                      <p className="text-xs" style={muted}>last{q.attempts.length > 1 ? ` · best ${Math.round(best)}%` : ''} · {q.attempts.length} {q.attempts.length === 1 ? 'attempt' : 'attempts'}</p>
                    </div>
                  )}
                </div>

                {q.status === 'generating' && <p className="text-xs mt-3 animate-progress-pulse" style={muted}>This quiz is still being written. <button onClick={load} className="font-semibold" style={{ color: '#7A263A' }}>Refresh</button></p>}
                {q.status === 'error' && <p className="text-xs mt-3" style={{ color: '#C05050', fontFamily: 'Inter' }}>{q.error || 'This quiz could not be written.'}</p>}

                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  {confirm === q.id ? (
                    <>
                      <span className="text-xs flex-1" style={{ color: '#C05050', fontFamily: 'Inter' }}>Delete this quiz and its results?</span>
                      <button onClick={() => remove(q.id)} disabled={busy === q.id} className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-60" style={{ background: '#C05050', color: '#FFFDF9', fontFamily: 'DM Sans' }}>{busy === q.id ? 'Deleting…' : 'Delete'}</button>
                      <button onClick={() => setConfirm(null)} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}>Keep</button>
                    </>
                  ) : (
                    <>
                      {q.status === 'ready' && (
                        <button onClick={() => onStart(q.id)} className="text-xs font-semibold px-4 py-1.5 rounded-full" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>
                          {q.in_progress ? 'Continue' : last ? 'Retake' : 'Start'}
                        </button>
                      )}
                      {last && (
                        <button onClick={() => review(q, last.id)} disabled={busy === q.id} className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-60" style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}>
                          {busy === q.id ? 'Opening…' : 'Review results'}
                        </button>
                      )}
                      <button onClick={() => setConfirm(q.id)} className="text-xs font-semibold px-3 py-1.5 rounded-full ml-auto" style={{ background: '#FEF5F5', color: '#C05050', border: '1px solid #F5D5D5', fontFamily: 'DM Sans' }}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
