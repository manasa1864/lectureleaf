import { useState } from 'react';
import Logo from '../components/Logo';
import type { Attempt, QResult, SkipReason } from '../lib/api';

interface QuizResultsProps {
  attempt: Attempt;
  title: string | null;
  onRetake: () => void;
  onPractice: () => void;
  onNewQuiz: () => void;
  onOpenLecture: () => void;
  onQuizzes: () => void;
}

const heading = { color: '#151515', fontFamily: 'DM Sans' } as const;
const muted = { color: '#68645F', fontFamily: 'Inter' } as const;
const card = { background: '#FFFDF9', border: '1.5px solid #E2DDD3' } as const;

const SKIP_LABEL: Record<SkipReason, string> = {
  dont_know: "Didn't know the answer",
  unclear_topic: 'Topic unclear',
  no_formula: "Didn't know the formula",
  unclear_question: 'Question was unclear',
  out_of_time: 'Running out of time',
  other: 'Other',
};
const SKIP_TIP: Record<SkipReason, string> = {
  dont_know: 'Re-read the pages listed above, then try to recall them without looking.',
  unclear_topic: 'Go back to those pages and explain the topic aloud in your own words; look up a second explanation if it still feels fuzzy.',
  no_formula: 'Make a formula sheet from the pages above and practise using each formula once.',
  unclear_question: 'Re-read the question slowly and underline what it asks; check the source page for the wording used.',
  out_of_time: 'Practise with a time limit and answer the quick questions first; come back to the long ones.',
  other: '',
};
const TYPE_LABEL: Record<string, string> = { mcq: 'MCQ', msq: 'MSQ', fill: 'Fill in the blank', short: 'Short answer', long: 'Long answer', numerical: 'Numerical' };
const STATUS: Record<QResult['status'], { label: string; bg: string; fg: string }> = {
  correct: { label: 'Correct', bg: '#E8F3EA', fg: '#2F6B3F' },
  partial: { label: 'Partly correct', bg: '#EFE3CC', fg: '#7A5A1A' },
  wrong: { label: 'Incorrect', bg: '#FEF5F5', fg: '#C05050' },
  skipped: { label: 'Skipped', bg: '#EFE3CC', fg: '#7A263A' },
  unanswered: { label: 'Not answered', bg: '#EDE9E0', fg: '#68645F' },
};

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('\n') : v || '');
const dur = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
const verdict = (p: number) =>
  p >= 90 ? 'Outstanding' : p >= 75 ? 'Strong work' : p >= 60 ? 'Good, with room to grow' : p >= 40 ? 'Getting there' : 'Time to revise';

export default function QuizResults({ attempt, title, onRetake, onPractice, onNewQuiz, onOpenLecture, onQuizzes }: QuizResultsProps) {
  const r = attempt.results!;
  const [filter, setFilter] = useState<'all' | 'wrong' | 'skipped' | 'correct'>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const shown = r.questions.filter((q) =>
    filter === 'all' ? true :
    filter === 'correct' ? q.status === 'correct' :
    filter === 'skipped' ? q.status === 'skipped' || q.status === 'unanswered' :
    q.status === 'wrong' || q.status === 'partial');
  const missed = r.counts.wrong + r.counts.partial + r.counts.skipped + r.counts.unanswered;
  const skipEntries = Object.entries(r.skip_reasons) as [SkipReason, number][];
  const circ = 2 * Math.PI * 52;

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 h-16"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}>
        <button onClick={onQuizzes} className="text-sm" style={muted}>← My quizzes</button>
        <Logo size="sm" />
        <button onClick={onNewQuiz} className="text-sm font-semibold px-4 py-2 rounded-full" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>New quiz</button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row items-center gap-8 mb-6" style={card}>
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" role="img" aria-label={`Score ${r.percent} percent`}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="#E2DDD3" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="#7A263A" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(r.percent, 100) / 100)} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold" style={{ ...heading, color: '#7A263A' }}>{Math.round(r.percent)}%</span>
              <span className="text-xs" style={muted}>{r.score} / {r.max_score}</span>
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold mb-1" style={{ ...heading, color: '#7A263A', letterSpacing: '-0.02em' }}>{verdict(r.percent)}</h1>
            <p className="text-sm mb-4" style={muted}>{title || 'Quiz'}</p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              {(['correct', 'partial', 'wrong', 'skipped', 'unanswered'] as const).filter((k) => r.counts[k] > 0).map((k) => (
                <span key={k} className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: STATUS[k].bg, color: STATUS[k].fg, fontFamily: 'DM Sans' }}>
                  {r.counts[k]} {STATUS[k].label.toLowerCase()}
                </span>
              ))}
              {attempt.time_taken_s != null && <span className="text-xs px-3 py-1 rounded-full" style={{ background: '#F5F1E8', color: '#68645F', fontFamily: 'DM Sans' }}>⏱ {dur(attempt.time_taken_s)}{r.time_limit_s ? ` of ${dur(r.time_limit_s)}` : ''}</span>}
              {r.strict.on && <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>STRICT MODE</span>}
            </div>
          </div>
        </div>

        {attempt.over_time && <p className="text-xs p-3 rounded-lg mb-4" style={{ background: '#FEF5F5', border: '1px solid #F5D5D5', color: '#C05050', fontFamily: 'Inter' }}>This attempt finished after the time limit.</p>}
        {r.keyword_graded && <p className="text-xs p-3 rounded-lg mb-4" style={{ background: '#F7EEEA', border: '1px solid #C5A46D', color: '#7A263A', fontFamily: 'Inter' }}>The AI marker wasn't available for some written answers, so they were marked by keyword matching. Treat those scores as approximate.</p>}
        {r.strict.on && (
          <div className="rounded-2xl p-5 mb-6" style={card}>
            <h2 className="text-sm font-bold mb-1" style={heading}>Invigilator report</h2>
            <p className="text-xs mb-3" style={muted}>
              {(r.strict.answers_checked ?? 0) === 0
                ? 'No written answers were checked against your rules.'
                : `${r.strict.ai_invigilator ? 'The AI invigilator' : 'The invigilator (word limits and keywords only, because the AI was not available)'} checked ${r.strict.answers_checked} ${r.strict.answers_checked === 1 ? 'answer' : 'answers'} against your rules. `}
              {r.strict.marks_deducted > 0 ? `${r.strict.marks_deducted} marks were cut for broken rules.` : (r.strict.answers_checked ?? 0) > 0 ? 'No marks were cut: every rule was followed.' : ''}
            </p>
            <ul className="text-xs space-y-1" style={{ fontFamily: 'Inter', color: '#151515' }}>
              {r.strict.rules.map((rule) => <li key={rule.id}>• {rule.text}</li>)}
            </ul>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <div className="rounded-2xl p-5" style={card}>
            <h2 className="text-sm font-bold mb-3" style={heading}>What to revise</h2>
            {r.revise.length === 0 ? (
              <p className="text-sm" style={muted}>Nothing stands out. You scored 60% or more on every part of the lecture.</p>
            ) : (
              <ul className="space-y-3">
                {r.revise.map((p, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={heading}>{p.heading || `Page ${p.page}`}</p>
                      <p className="text-xs" style={muted}>{p.page ? `Page ${p.page} · ${p.time}` : 'From your notes'} · {p.missed} missed, {p.skipped} skipped</p>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: '#C05050', fontFamily: 'DM Sans' }}>{Math.round((p.awarded / p.marks) * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={onOpenLecture} className="mt-4 text-xs font-semibold px-4 py-2 rounded-full" style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}>Open the lecture notes</button>
          </div>

          <div className="rounded-2xl p-5" style={card}>
            <h2 className="text-sm font-bold mb-3" style={heading}>By question type</h2>
            <div className="space-y-3">
              {Object.entries(r.by_type).map(([t, b]) => {
                const pct = b.marks ? (b.awarded / b.marks) * 100 : 0;
                return (
                  <div key={t}>
                    <div className="flex justify-between text-xs mb-1" style={muted}><span>{TYPE_LABEL[t] ?? t} ({b.count})</span><span>{Math.round(pct)}%</span></div>
                    <div className="h-2 rounded-full" style={{ background: '#E2DDD3' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#7A263A' }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {skipEntries.length > 0 && (
          <div className="rounded-2xl p-5 mb-6" style={card}>
            <h2 className="text-sm font-bold mb-3" style={heading}>Why you skipped</h2>
            <ul className="space-y-3">
              {skipEntries.map(([reason, n]) => (
                <li key={reason}>
                  <p className="text-sm" style={{ fontFamily: 'Inter', color: '#151515' }}><b style={{ color: '#7A263A' }}>{n}×</b> {SKIP_LABEL[reason]}</p>
                  {SKIP_TIP[reason] && <p className="text-xs mt-0.5" style={muted}>{SKIP_TIP[reason]}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-8">
          <button onClick={onRetake} className="px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}>Retake this quiz</button>
          <button onClick={onPractice} disabled={missed === 0} className="px-6 py-2.5 rounded-full text-sm font-semibold disabled:opacity-50" style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}>
            Practise what I missed ({missed})
          </button>
        </div>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-bold" style={heading}>Review every question</h2>
          <div className="inline-flex p-1 rounded-xl" style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}>
            {([['all', 'All'], ['wrong', 'Missed'], ['skipped', 'Skipped'], ['correct', 'Correct']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{ background: filter === id ? '#F5F1E8' : 'transparent', color: filter === id ? '#7A263A' : '#68645F', fontFamily: 'DM Sans' }}>{label}</button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {shown.length === 0 && <p className="text-sm" style={muted}>No questions in this view.</p>}
          {shown.map((q) => {
            const idx = r.questions.indexOf(q) + 1;
            const st = STATUS[q.status];
            const expanded = open[q.id] ?? (q.status !== 'correct');
            return (
              <div key={q.id} className="rounded-2xl overflow-hidden" style={card}>
                <button onClick={() => setOpen((o) => ({ ...o, [q.id]: !expanded }))} aria-expanded={expanded} className="w-full text-left flex items-start gap-3 p-5">
                  <span className="text-xs font-bold mt-0.5" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>{idx}</span>
                  <span className="flex-1 text-sm font-semibold whitespace-pre-line" style={heading}>{q.text}</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: st.bg, color: st.fg, fontFamily: 'DM Sans' }}>{st.label} · {q.awarded}/{q.marks}</span>
                </button>
                {expanded && (
                  <div className="px-5 pb-5 pl-11 space-y-3 text-sm" style={{ fontFamily: 'Inter' }}>
                    <p className="text-xs" style={muted}>{TYPE_LABEL[q.type]}{q.source ? ` · Page ${q.source.page} (${q.source.time}) ${q.source.heading}` : ''}</p>
                    {q.status === 'skipped' && q.skip && (
                      <p className="text-xs" style={{ color: '#7A263A' }}>You skipped this: {SKIP_LABEL[q.skip.reason]}{q.skip.note ? ` ("${q.skip.note}")` : ''}.</p>
                    )}
                    {q.status !== 'skipped' && q.status !== 'unanswered' && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: '#68645F' }}>Your answer</p>
                        <p className="whitespace-pre-line rounded-lg p-3" style={{ background: '#F5F1E8', color: '#151515' }}>{asText(q.your_answer) || '—'}</p>
                      </div>
                    )}
                    {q.status !== 'correct' && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: '#68645F' }}>{q.type === 'short' || q.type === 'long' ? 'Model answer' : 'Correct answer'}</p>
                        <p className="whitespace-pre-line rounded-lg p-3" style={{ background: '#E8F3EA', color: '#151515' }}>{asText(q.correct_answer)}</p>
                      </div>
                    )}
                    {q.feedback && <p style={{ color: '#151515' }}><b>Feedback:</b> {q.feedback}</p>}
                    {q.rubric && q.rubric.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: '#68645F' }}>Marking</p>
                        <ul className="space-y-1">
                          {q.rubric.map((p, i) => (
                            <li key={i} className="flex gap-2 text-xs">
                              <span className="font-bold flex-shrink-0" style={{ color: p.awarded >= p.marks - 0.01 ? '#2F6B3F' : p.awarded > 0 ? '#7A5A1A' : '#C05050' }}>{p.awarded}/{p.marks}</span>
                              <span style={{ color: '#151515' }}>{p.point}{p.comment ? <span style={muted}> — {p.comment}</span> : null}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {q.rule_checks && q.rule_checks.length > 0 && (
                      <div className="rounded-lg p-3" style={{ background: q.deductions.length ? '#FEF5F5' : '#F5F1E8', border: `1px solid ${q.deductions.length ? '#F5D5D5' : '#E2DDD3'}` }}>
                        <p className="text-xs font-bold mb-1.5" style={{ color: q.deductions.length ? '#C05050' : '#68645F', fontFamily: 'DM Sans' }}>
                          Invigilator{q.deductions.length ? `: marks cut for broken rules` : `: every rule followed`}
                        </p>
                        <ul className="space-y-1 text-xs" style={{ color: '#151515' }}>
                          {q.rule_checks.map((c, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="flex-shrink-0" style={{ color: c.status === 'followed' ? '#2F6B3F' : c.status === 'broken' ? '#C05050' : '#9A948B' }}>
                                {c.status === 'followed' ? '✓' : c.status === 'broken' ? '✗' : '–'}
                              </span>
                              <span>
                                {c.rule}
                                {c.status === 'broken' && c.marks > 0 ? <b style={{ color: '#C05050' }}> −{c.marks}</b> : null}
                                {c.status === 'not_applicable' ? <span style={muted}> (did not apply to this question)</span> : null}
                                {c.status === 'unchecked' ? <span style={muted}> (could not be checked)</span> : null}
                                {c.note && c.status !== 'not_applicable' ? <span style={muted}> · {c.note}</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {q.explanation && <p className="text-xs" style={muted}><b>Why:</b> {q.explanation}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
