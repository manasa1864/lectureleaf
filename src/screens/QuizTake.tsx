import { useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo';
import { api, type Answer, type Attempt, type Quiz, type QuizQuestion, type Rule, type SkipReason, type Skips } from '../lib/api';

interface QuizTakeProps {
  quizId: string;
  onFinished: (attempt: Attempt) => void;
  onExit: () => void;
}

const SKIP_REASONS: { id: SkipReason; label: string }[] = [
  { id: 'dont_know', label: "I didn't know the answer" },
  { id: 'unclear_topic', label: 'The topic is unclear to me' },
  { id: 'no_formula', label: "I didn't know the formula" },
  { id: 'unclear_question', label: 'The question itself was unclear' },
  { id: 'out_of_time', label: "I'm running out of time" },
  { id: 'other', label: 'Other' },
];

const TYPE_LABEL: Record<string, string> = {
  mcq: 'MCQ', msq: 'MSQ · select all that apply', fill: 'Fill in the blank', short: 'Short answer', long: 'Long answer', numerical: 'Numerical',
};

const heading = { color: '#151515', fontFamily: 'DM Sans' } as const;
const muted = { color: '#68645F', fontFamily: 'Inter' } as const;

const isAnswered = (a: Answer | undefined) =>
  a !== undefined && (typeof a === 'string' ? a.trim() !== '' : Array.isArray(a) ? a.length > 0 : typeof a === 'number');

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const hasWord = (text: string, w: string) => {
  const k = w.toLowerCase().trim();
  return !k || text.toLowerCase().includes(k.length < 6 ? k : k.slice(0, -2));
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Which of the student's own rules apply to this question (mirrors the server). */
const rulesFor = (q: QuizQuestion, rules: Rule[]) =>
  q.type === 'short' || q.type === 'long' || (q.type === 'numerical' && q.numerical_format === 'working') ? rules : [];

export default function QuizTake({ quizId, onFinished, onExit }: QuizTakeProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [skips, setSkips] = useState<Skips>({});
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [skipping, setSkipping] = useState<{ reason: SkipReason; note: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const skew = useRef(0);
  const loaded = useRef(false);
  const submittedOnce = useRef(false);
  const latest = useRef({ answers, skips });
  latest.current = { answers, skips };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [q, a] = await Promise.all([api.getQuiz(quizId), api.startAttempt(quizId)]);
        if (cancelled) return;
        skew.current = Date.parse(a.server_now) - Date.now();
        setQuiz(q);
        setAttempt(a);
        setAnswers(a.answers as Record<string, Answer>);
        setSkips(a.skips);
        const firstOpen = q.questions.findIndex((x) => !isAnswered(a.answers[x.id] as Answer) && !a.skips[x.id]);
        setIdx(Math.max(0, firstOpen));
        loaded.current = true;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open the quiz');
      }
    })();
    return () => { cancelled = true; };
  }, [quizId]);

  // Progress is saved as you go, so a refresh doesn't lose anything.
  useEffect(() => {
    if (!attempt || !loaded.current) return;
    const t = setTimeout(() => { api.saveAttempt(attempt.id, { answers, skips }).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [answers, skips, attempt]);

  const limitMs = (quiz?.config.time_limit_min ?? 0) * 60000;
  const startedMs = attempt ? Date.parse(attempt.started_at) : 0;
  const remaining = limitMs ? limitMs - (now + skew.current - startedMs) : null;

  useEffect(() => {
    if (!attempt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [attempt]);

  const submit = async (auto = false) => {
    if (!attempt || submittedOnce.current && !error) return;
    submittedOnce.current = true;
    setSubmitting(true);
    setConfirming(false);
    setError('');
    try {
      const elapsed = Math.round((Date.now() + skew.current - startedMs) / 1000);
      const res = await api.submitAttempt(attempt.id, { ...latest.current, time_taken_s: Math.max(0, elapsed) });
      onFinished(res);
    } catch (e) {
      submittedOnce.current = false;
      setSubmitting(false);
      setError((auto ? 'Time is up, but submitting failed: ' : '') + (e instanceof Error ? e.message : 'Could not submit'));
    }
  };

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && attempt && quiz && !submittedOnce.current) submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining !== null && remaining <= 0]);

  const q = quiz?.questions[idx];
  const counts = useMemo(() => {
    const qs = quiz?.questions ?? [];
    const answered = qs.filter((x) => isAnswered(answers[x.id])).length;
    const skipped = qs.filter((x) => !isAnswered(answers[x.id]) && skips[x.id]).length;
    return { answered, skipped, open: qs.length - answered - skipped, total: qs.length };
  }, [quiz, answers, skips]);

  const setAnswer = (id: string, value: Answer) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (isAnswered(value)) setSkips((s) => { if (!s[id]) return s; const { [id]: _drop, ...rest } = s; return rest; });
  };
  const clearAnswer = (id: string) => setAnswers((a) => { const { [id]: _drop, ...rest } = a; return rest; });

  const go = (i: number) => quiz && setIdx(Math.min(Math.max(0, i), quiz.questions.length - 1));

  const confirmSkip = () => {
    if (!q || !skipping) return;
    clearAnswer(q.id);
    setSkips((s) => ({ ...s, [q.id]: { reason: skipping.reason, note: skipping.note.trim() } }));
    setSkipping(null);
    go(idx + 1);
  };

  if (error && !quiz) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#F5F1E8' }}>
        <p role="alert" className="text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>
        <button onClick={onExit} className="px-5 py-2 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Back</button>
      </div>
    );
  }
  if (!quiz || !attempt || !q) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F1E8' }}>
        <p className="text-sm animate-progress-pulse" style={muted}>Opening your quiz…</p>
      </div>
    );
  }

  const ans = answers[q.id];
  const text = typeof ans === 'string' ? ans : '';
  const strict = quiz.config.strict;
  const myRules = strict ? rulesFor(q, quiz.rules) : [];
  const typed = q.type === 'short' || q.type === 'long' || (q.type === 'numerical' && q.numerical_format === 'working');
  const lowTime = remaining !== null && remaining < 60000;

  const optionList = (multi: boolean) => (
    <div className="space-y-2.5">
      {(q.options ?? []).map((o, i) => {
        const on = multi ? Array.isArray(ans) && ans.includes(i) : ans === i;
        return (
          <button key={i} type="button"
            onClick={() => multi
              ? setAnswer(q.id, on ? (ans as number[]).filter((x) => x !== i) : [...(Array.isArray(ans) ? ans : []), i])
              : setAnswer(q.id, i)}
            role={multi ? 'checkbox' : 'radio'} aria-checked={on}
            className="w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
            style={{ background: on ? '#F7EEEA' : '#FFFDF9', border: `1.5px solid ${on ? '#7A263A' : '#E2DDD3'}` }}>
            <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center ${multi ? 'rounded-md' : 'rounded-full'}`}
              style={{ border: `1.5px solid ${on ? '#7A263A' : '#C5A46D'}`, background: on ? '#7A263A' : 'transparent', color: '#FFFDF9', fontSize: 11 }}>
              {on ? '✓' : ''}
            </span>
            <span className="text-sm" style={{ color: '#151515', fontFamily: 'Inter' }}>
              <b style={{ color: '#C5A46D' }}>{String.fromCharCode(65 + i)}.</b>&nbsp;{o}
            </span>
          </button>
        );
      })}
    </div>
  );

  const blankParts = q.type === 'fill' ? q.text.split('____') : [];

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-8 h-16 gap-3"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}>
        <button onClick={onExit} className="text-sm" style={muted} title="Your progress is saved">← Save & exit</button>
        <div className="hidden sm:block"><Logo size="sm" /></div>
        <div className="flex items-center gap-3">
          {strict && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>STRICT</span>}
          {remaining !== null && (
            <span className="text-sm font-bold tabular-nums px-3 py-1 rounded-full" aria-live="off"
              style={{ background: lowTime ? '#FEF5F5' : '#FFFDF9', color: lowTime ? '#C05050' : '#7A263A', border: `1px solid ${lowTime ? '#F5D5D5' : '#E2DDD3'}`, fontFamily: 'DM Sans' }}>
              ⏱ {fmt(remaining)}
            </span>
          )}
          <button onClick={() => setConfirming(true)} disabled={submitting}
            className="text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-60" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>
            {submitting ? 'Marking…' : 'Submit'}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 grid lg:grid-cols-[1fr_260px] gap-8">
        <main>
          <div className="h-1.5 rounded-full mb-6" style={{ background: '#E2DDD3' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${((counts.answered + counts.skipped) / counts.total) * 100}%`, background: 'linear-gradient(to right, #C5A46D, #7A263A)' }} />
          </div>

          {quiz.warning && idx === 0 && <p className="text-xs p-3 rounded-lg mb-4" style={{ background: '#F7EEEA', border: '1px solid #C5A46D', color: '#7A263A', fontFamily: 'Inter' }}>{quiz.warning}</p>}

          <div className="rounded-2xl p-6 md:p-8" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-xs font-bold" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>QUESTION {idx + 1} OF {counts.total}</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EFE3CC', color: '#7A263A', fontFamily: 'DM Sans', fontWeight: 600 }}>{TYPE_LABEL[q.type]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: '#F5F1E8', color: '#68645F', fontFamily: 'DM Sans' }}>{q.difficulty}</span>
              <span className="text-xs ml-auto" style={muted}>{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
            </div>

            {q.type === 'fill' ? (
              <p className="text-lg leading-relaxed mb-6" style={{ ...heading, fontWeight: 500 }}>
                {blankParts[0]}
                <input value={text} onChange={(e) => setAnswer(q.id, e.target.value)} aria-label="Your answer" maxLength={120}
                  className="mx-1 px-2 py-0.5 w-44 outline-none text-center" style={{ borderBottom: '2px solid #7A263A', background: '#F7EEEA', color: '#151515', fontFamily: 'Inter' }} />
                {blankParts.slice(1).join('____')}
              </p>
            ) : (
              <p className="text-lg leading-relaxed mb-6 whitespace-pre-line" style={{ ...heading, fontWeight: 500 }}>{q.text}</p>
            )}

            {(q.type === 'mcq' || (q.type === 'numerical' && q.numerical_format === 'mcq')) && optionList(false)}
            {q.type === 'msq' && optionList(true)}

            {q.type === 'numerical' && q.numerical_format === 'answer' && (
              <div>
                <input value={text} onChange={(e) => setAnswer(q.id, e.target.value)} inputMode="decimal" aria-label="Your answer" maxLength={60}
                  placeholder={q.unit ? `Type the number (${q.unit})` : 'Type the number'}
                  className="w-full max-w-xs px-4 py-3 rounded-xl text-base outline-none" style={{ background: '#F5F1E8', border: '1.5px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' }} />
                <p className="text-xs mt-2" style={muted}>Only the final value is marked. Expressions like 2^10 are fine.</p>
              </div>
            )}

            {typed && (
              <div>
                <textarea value={text} onChange={(e) => setAnswer(q.id, e.target.value)} aria-label="Your answer"
                  rows={q.type === 'long' || q.numerical_format === 'working' ? 10 : 5} maxLength={8000}
                  placeholder={q.type === 'numerical' ? 'Write the formula, each step of the substitution, and the final answer…' : 'Write your answer…'}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y leading-relaxed" style={{ background: '#F5F1E8', border: '1.5px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' }} />
                <p className="text-xs mt-1.5" style={muted}>{wordCount(text)} words</p>
              </div>
            )}

            {strict && typed && myRules.length > 0 && (
              <div className="mt-5 rounded-xl p-4" style={{ background: '#F7EEEA', border: '1px solid #E8D5C0' }}>
                <p className="text-xs font-bold mb-2" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>INVIGILATOR · your rules</p>
                <p className="text-xs mb-2" style={muted}>When you submit, the AI invigilator reads this answer against each rule and cuts marks for any it breaks. Word counts and keywords are shown live.</p>
                <ul className="space-y-1.5">
                  {myRules.map((r) => {
                    let state: 'ok' | 'bad' | 'later' = 'later';
                    let detail = 'checked when you submit';
                    const w = wordCount(text);
                    if (r.kind === 'length') {
                      const bad = (r.min_words && w < r.min_words) || (r.max_words && w > r.max_words);
                      state = bad ? 'bad' : 'ok';
                      detail = `${w} words${r.min_words ? ` · min ${r.min_words}` : ''}${r.max_words ? ` · max ${r.max_words}` : ''}`;
                    } else if (r.kind === 'keywords' && r.keywords.length) {
                      const missing = r.keywords.filter((k) => !hasWord(text, k));
                      state = missing.length ? 'bad' : 'ok';
                      detail = missing.length ? `missing: ${missing.join(', ')}` : 'all keywords used';
                    }
                    return (
                      <li key={r.id} className="text-xs flex gap-2" style={{ fontFamily: 'Inter', color: '#151515' }}>
                        <span style={{ color: state === 'ok' ? '#3E7C4F' : state === 'bad' ? '#C05050' : '#C5A46D' }}>{state === 'ok' ? '✓' : state === 'bad' ? '✗' : '•'}</span>
                        <span>{r.text} <span style={muted}>({detail})</span></span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {error && <p role="alert" className="mt-4 text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{error}</p>}

          <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
            <button onClick={() => go(idx - 1)} disabled={idx === 0} className="px-5 py-2.5 rounded-full text-sm font-semibold disabled:opacity-40"
              style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}>← Previous</button>
            <div className="flex items-center gap-3">
              {isAnswered(ans) && <button onClick={() => clearAnswer(q.id)} className="text-sm" style={muted}>Clear answer</button>}
              <button onClick={() => setSkipping({ reason: skips[q.id]?.reason ?? 'dont_know', note: skips[q.id]?.note ?? '' })}
                className="px-5 py-2.5 rounded-full text-sm font-semibold" style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}>
                {skips[q.id] && !isAnswered(ans) ? 'Skipped · change reason' : 'Skip'}
              </button>
              {idx < counts.total - 1 ? (
                <button onClick={() => go(idx + 1)} className="px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Next →</button>
              ) : (
                <button onClick={() => setConfirming(true)} className="px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Finish</button>
              )}
            </div>
          </div>
        </main>

        <aside className="lg:sticky lg:top-24 self-start">
          <div className="rounded-2xl p-5" style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}>
            <p className="text-xs font-bold mb-3" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>QUESTIONS</p>
            <div className="grid grid-cols-5 gap-2">
              {quiz.questions.map((x, i) => {
                const a = isAnswered(answers[x.id]);
                const s = !a && skips[x.id];
                return (
                  <button key={x.id} onClick={() => go(i)} aria-label={`Question ${i + 1}${a ? ', answered' : s ? ', skipped' : ''}`} aria-current={i === idx}
                    className="h-9 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: a ? '#7A263A' : s ? '#EFE3CC' : '#F5F1E8', color: a ? '#FFFDF9' : s ? '#7A263A' : '#68645F',
                      border: `2px solid ${i === idx ? '#C5A46D' : 'transparent'}`, fontFamily: 'DM Sans',
                    }}>{i + 1}</button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs" style={muted}>
              <p><span style={{ color: '#7A263A' }}>■</span> Answered ({counts.answered})</p>
              <p><span style={{ color: '#C5A46D' }}>■</span> Skipped ({counts.skipped})</p>
              <p><span style={{ color: '#C9C3B6' }}>■</span> Not yet answered ({counts.open})</p>
            </div>
            <p className="text-xs mt-4" style={muted}>Progress is saved automatically. You can go back to skipped questions any time.</p>
          </div>
        </aside>
      </div>

      {skipping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(21,21,21,0.45)' }} role="dialog" aria-modal="true" aria-label="Skip question">
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#FFFDF9' }}>
            <h2 className="text-lg font-bold mb-1" style={heading}>Skip this question?</h2>
            <p className="text-xs mb-4" style={muted}>Tell us why, so your results can show what to revise.{isAnswered(ans) ? ' This clears the answer you typed.' : ''}</p>
            <div className="space-y-2 mb-4">
              {SKIP_REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5 cursor-pointer"
                  style={{ background: skipping.reason === r.id ? '#F7EEEA' : '#F5F1E8', border: `1.5px solid ${skipping.reason === r.id ? '#7A263A' : '#E2DDD3'}` }}>
                  <input type="radio" name="skip" checked={skipping.reason === r.id} onChange={() => setSkipping({ ...skipping, reason: r.id })} style={{ accentColor: '#7A263A' }} />
                  <span className="text-sm" style={{ fontFamily: 'Inter', color: '#151515' }}>{r.label}</span>
                </label>
              ))}
            </div>
            {skipping.reason === 'other' && (
              <input value={skipping.note} onChange={(e) => setSkipping({ ...skipping, note: e.target.value })} maxLength={300} placeholder="Tell us more (optional)" autoFocus
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none mb-4" style={{ background: '#F5F1E8', border: '1.5px solid #E2DDD3', fontFamily: 'Inter' }} />
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setSkipping(null)} className="px-5 py-2 rounded-full text-sm font-semibold" style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}>Cancel</button>
              <button onClick={confirmSkip} className="px-5 py-2 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Skip question</button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(21,21,21,0.45)' }} role="dialog" aria-modal="true" aria-label="Submit quiz">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#FFFDF9' }}>
            <h2 className="text-lg font-bold mb-3" style={heading}>Submit your quiz?</h2>
            <ul className="text-sm space-y-1 mb-4" style={muted}>
              <li><b style={{ color: '#7A263A' }}>{counts.answered}</b> answered</li>
              <li><b style={{ color: '#C5A46D' }}>{counts.skipped}</b> skipped</li>
              <li><b style={{ color: counts.open ? '#C05050' : '#151515' }}>{counts.open}</b> not answered</li>
            </ul>
            {counts.open + counts.skipped > 0 && <p className="text-xs mb-4" style={muted}>Unanswered and skipped questions score 0.</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirming(false)} className="px-5 py-2 rounded-full text-sm font-semibold" style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}>Keep working</button>
              <button onClick={() => submit()} className="px-5 py-2 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(245,241,232,0.92)' }}>
          <div className="w-12 h-12 rounded-full mb-4 animate-spin-slow" style={{ border: '2px solid #E2DDD3', borderTopColor: '#C5A46D', borderRightColor: '#C5A46D' }} />
          <p className="text-sm" style={muted}>{strict ? 'The invigilator is checking your answers…' : 'Marking your answers…'}</p>
        </div>
      )}
    </div>
  );
}
