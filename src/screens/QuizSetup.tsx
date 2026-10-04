import { useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';
import { api, type NumericalFormat, type QType, type QuizConfigIn } from '../lib/api';

interface QuizSetupProps {
  lecture: { id: string; title: string | null };
  onBack: () => void;
  onReady: (quizId: string) => void;
  onQuizzes?: () => void;
}

const TYPES: { id: QType; label: string; desc: string }[] = [
  { id: 'mcq', label: 'MCQ', desc: 'One correct option' },
  { id: 'msq', label: 'MSQ', desc: 'Several correct options' },
  { id: 'fill', label: 'Fill in the blanks', desc: 'Complete the sentence' },
  { id: 'short', label: 'Short answer', desc: 'A few sentences' },
  { id: 'long', label: 'Long answer', desc: 'A developed explanation' },
  { id: 'numerical', label: 'Numericals', desc: 'Calculations' },
];

const RULE_CHIPS = [
  'Minimum 50 words',
  'No more than 150 words',
  'Show all working and formulas',
  'Use an introduction and a conclusion',
  'Include an example',
  'Use bullet points',
];

const card = { background: '#FFFDF9', border: '1.5px solid #E2DDD3' } as const;
const heading = { color: '#151515', fontFamily: 'DM Sans' } as const;
const muted = { color: '#68645F', fontFamily: 'Inter' } as const;

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6 mb-5" style={card}>
      <h2 className="text-base font-bold mb-1" style={heading}>
        <span style={{ color: '#C5A46D' }}>{String(n).padStart(2, '0')}</span>&nbsp;&nbsp;{title}
      </h2>
      {hint && <p className="text-xs mb-4" style={muted}>{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-xl flex-wrap" style={{ background: '#F5F1E8', border: '1px solid #E2DDD3' }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: value === o.id ? '#FFFDF9' : 'transparent',
            color: value === o.id ? '#7A263A' : '#68645F',
            border: value === o.id ? '1px solid #E2DDD3' : '1px solid transparent',
            fontFamily: 'DM Sans',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Shrinks a photo of notes so the upload stays small. */
async function compress(file: File): Promise<{ name: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`${file.name} isn't an image the browser can read.`));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { name: file.name.slice(0, 100), data: canvas.toDataURL('image/jpeg', 0.85) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function QuizSetup({ lecture, onBack, onReady, onQuizzes }: QuizSetupProps) {
  const [assign, setAssign] = useState<'random' | 'choose'>('random');
  const [n, setN] = useState(10);
  const [picked, setPicked] = useState<QType[]>(TYPES.map((t) => t.id));
  const [counts, setCounts] = useState<Record<QType, number>>({ mcq: 3, msq: 1, fill: 2, short: 2, long: 1, numerical: 1 });
  const [numFmt, setNumFmt] = useState<NumericalFormat | 'random'>('random');
  const [difficulty, setDifficulty] = useState<QuizConfigIn['difficulty']>('mixed');
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const [minutesTouched, setMinutesTouched] = useState(false);
  const [notes, setNotes] = useState('');
  // Each photo is read as soon as it is added; the text stays editable so mistakes can be fixed before the quiz is written.
  const [photos, setPhotos] = useState<{ id: number; name: string; thumb: string; text: string; state: 'reading' | 'done' | 'error'; note?: string; reader?: 'gemini' | 'openrouter' | 'local' }[]>([]);
  const photoId = useRef(0);
  const [strict, setStrict] = useState(false);
  const [rules, setRules] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'form' | 'writing'>('form');
  const [written, setWritten] = useState<{ done: number; total: number } | null>(null);
  const [waited, setWaited] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // must be reset here: React (StrictMode) mounts, unmounts and remounts once in development
    return () => { alive.current = false; };
  }, []);

  const chosenTypes = assign === 'random' ? picked : (Object.keys(counts) as QType[]).filter((t) => counts[t] > 0);
  const total = assign === 'random' ? n : chosenTypes.reduce((s, t) => s + counts[t], 0);
  const hasNumerical = chosenTypes.includes('numerical');

  // A sensible default time limit follows the number of questions until the user sets their own.
  useEffect(() => {
    if (!minutesTouched) setMinutes(Math.max(5, Math.round(total * 1.5)));
  }, [total, minutesTouched]);

  const toggleType = (t: QType) =>
    setPicked((p) => (p.includes(t) ? (p.length > 1 ? p.filter((x) => x !== t) : p) : [...p, t]));

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    const room = 4 - photos.length;
    for (const file of Array.from(files).slice(0, room)) {
      const id = ++photoId.current;
      try {
        const img = await compress(file);
        setPhotos((cur) => [...cur, { id, name: img.name, thumb: img.data, text: '', state: 'reading' }]);
        const [res] = await api.readPhotos([img]);
        setPhotos((cur) => cur.map((p) => (p.id !== id ? p : {
          ...p, text: res.text, state: 'done', reader: res.reader,
          note: res.chars < 20 ? 'Very little text could be read. Retake the photo in better light, or type your notes in the box above.' : undefined,
        })));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not read that image';
        setPhotos((cur) => (cur.some((p) => p.id === id) ? cur.map((p) => (p.id === id ? { ...p, state: 'error', note: msg } : p)) : cur));
        if (!photos.some((p) => p.id === id)) setError(msg);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const problem =
    total < 1 ? 'Choose at least one question.' :
    total > 40 ? 'A quiz can have at most 40 questions.' :
    strict && !rules.trim() ? 'Strict mode needs at least one rule for your answers.' :
    timed && (!minutes || minutes < 1) ? 'Enter a time limit in minutes.' :
    photos.some((p) => p.state === 'reading') ? 'Still reading your photos…' : '';

  const start = async () => {
    if (problem) return setError(problem);
    setError('');
    setWritten(null);
    setWaited(0);
    setPhase('writing');
    const config: QuizConfigIn = {
      n: total,
      types: chosenTypes,
      counts: assign === 'choose' ? Object.fromEntries(chosenTypes.map((t) => [t, counts[t]])) : null,
      numerical_format: numFmt,
      difficulty,
      time_limit_min: timed ? Math.round(minutes) : null,
      strict,
      conditions: strict ? rules.trim() : '',
      // Photos were already read and checked by the student, so their text goes in with the typed notes.
      notes_text: [notes.trim(), ...photos.filter((p) => p.text.trim()).map((p, i) => `[Photo ${i + 1}] ${p.text.trim()}`)].filter(Boolean).join('\n\n'),
      images: [],
    };
    try {
      const { id } = await api.createQuiz(lecture.id, config);
      let failures = 0;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!alive.current) return;
        let q;
        try {
          q = await api.getQuiz(id);
          failures = 0;
        } catch (e) {
          if (++failures < 5) continue; // a failed check or two is usually a network blip: keep waiting
          throw e;
        }
        if (q.progress) setWritten(q.progress);
        if (q.status === 'ready') return onReady(id);
        if (q.status === 'error') throw new Error(q.error || 'The quiz could not be written.');
      }
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : 'Could not create the quiz');
      setPhase('form');
    }
  };

  useEffect(() => {
    if (phase !== 'writing') return;
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  if (phase === 'writing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F5F1E8' }}>
        <div className="w-16 h-16 rounded-full mb-8 animate-spin-slow" style={{ border: '2px solid #E2DDD3', borderTopColor: '#C5A46D', borderRightColor: '#C5A46D' }} />
        <h1 className="text-2xl font-bold mb-2" style={{ ...heading, color: '#7A263A', letterSpacing: '-0.02em' }}>Writing your questions…</h1>
        <p className="text-sm max-w-sm" style={muted}>
          Reading your lecture{notes.trim() || photos.length ? ' and your notes' : ''} and building {total} {total === 1 ? 'question' : 'questions'}.
          {strict ? ' Your rules are being set up for the invigilator.' : ''}
        </p>
        {written && written.total > 0 && (
          <div className="mt-6 w-64">
            <div className="h-1.5 rounded-full" style={{ background: '#E2DDD3' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(written.done / written.total) * 100}%`, background: 'linear-gradient(to right, #C5A46D, #7A263A)' }} />
            </div>
            <p className="text-xs mt-2" style={muted}>{written.done} of {written.total} questions written</p>
          </div>
        )}
        <p className="text-xs mt-6 max-w-xs" style={muted}>
          {waited < 25 ? `${waited}s` : `${waited}s · The AI service limits how fast it can write. If it's busy this can take up to a minute; your quiz will appear as soon as it's ready.`}
        </p>
        {waited >= 60 && onQuizzes && (
          <button onClick={onQuizzes} className="mt-5 px-5 py-2 rounded-full text-sm font-semibold"
            style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}>
            Taking long? Check My quizzes
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 h-16"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <button onClick={onBack} className="flex items-center gap-2 text-sm" style={muted}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back
        </button>
        <Logo size="sm" />
        <span className="w-12" />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-1" style={{ ...heading, color: '#7A263A', letterSpacing: '-0.02em' }}>Build your quiz</h1>
        <p className="mb-8 text-sm" style={muted}>From: <b style={{ color: '#151515' }}>{lecture.title || 'Untitled lecture'}</b></p>

        <Section n={1} title="Questions" hint="Pick how many and which kinds, or set the number of each kind yourself.">
          <Seg value={assign} onChange={setAssign} options={[{ id: 'random', label: 'Mix randomly' }, { id: 'choose', label: "I'll choose each type" }]} />

          {assign === 'random' ? (
            <div className="mt-5">
              <div className="flex items-center gap-4 mb-5">
                <input type="range" min={3} max={30} value={n} onChange={(e) => setN(+e.target.value)} className="flex-1" aria-label="Number of questions" style={{ accentColor: '#7A263A' }} />
                <span className="text-2xl font-bold w-12 text-right" style={{ ...heading, color: '#7A263A' }}>{n}</span>
              </div>
              <p className="text-xs mb-2" style={muted}>Types are assigned randomly from the ones you keep ticked:</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => {
                  const on = picked.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleType(t.id)}
                      title={t.desc}
                      className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={{
                        background: on ? '#F7EEEA' : 'transparent', color: on ? '#7A263A' : '#68645F',
                        border: `1.5px solid ${on ? '#C5A46D' : '#E2DDD3'}`, fontFamily: 'DM Sans',
                      }}
                    >
                      {on ? '✓ ' : ''}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              {TYPES.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#F5F1E8', border: '1px solid #E2DDD3' }}>
                  <div>
                    <p className="text-sm font-semibold" style={heading}>{t.label}</p>
                    <p className="text-xs" style={muted}>{t.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`Fewer ${t.label}`} onClick={() => setCounts((c) => ({ ...c, [t.id]: Math.max(0, c[t.id] - 1) }))}
                      className="w-7 h-7 rounded-full text-lg leading-none" style={{ background: '#FFFDF9', border: '1px solid #E2DDD3', color: '#7A263A' }}>−</button>
                    <span className="w-5 text-center text-sm font-bold" style={heading}>{counts[t.id]}</span>
                    <button type="button" aria-label={`More ${t.label}`} onClick={() => setCounts((c) => ({ ...c, [t.id]: Math.min(15, c[t.id] + 1) }))}
                      className="w-7 h-7 rounded-full text-lg leading-none" style={{ background: '#FFFDF9', border: '1px solid #E2DDD3', color: '#7A263A' }}>+</button>
                  </div>
                </div>
              ))}
              <p className="sm:col-span-2 text-sm" style={muted}>Total: <b style={{ color: '#7A263A' }}>{total}</b> {total === 1 ? 'question' : 'questions'}</p>
            </div>
          )}
        </Section>

        {hasNumerical && (
          <Section n={2} title="How should numericals be answered?" hint="Applies to every numerical question.">
            <Seg value={numFmt} onChange={setNumFmt} options={[
              { id: 'mcq', label: 'Multiple choice' }, { id: 'answer', label: 'Type the answer' },
              { id: 'working', label: 'Full working' }, { id: 'random', label: 'Mix' },
            ]} />
            <p className="text-xs mt-3" style={muted}>
              {numFmt === 'mcq' && 'Pick the right value from four options.'}
              {numFmt === 'answer' && 'Type only the final number. Small rounding differences are accepted.'}
              {numFmt === 'working' && 'Write the whole solution. Marks are given for the method (60%) and the final answer (40%).'}
              {numFmt === 'random' && 'Each numerical randomly uses one of the three formats.'}
            </p>
          </Section>
        )}

        <Section n={hasNumerical ? 3 : 2} title="Difficulty">
          <Seg value={difficulty} onChange={setDifficulty} options={[
            { id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' }, { id: 'mixed', label: 'Mixed' },
          ]} />
        </Section>

        <Section n={hasNumerical ? 4 : 3} title="Time limit" hint="Optional. The quiz is submitted automatically when time runs out.">
          <div className="flex items-center gap-4 flex-wrap">
            <Seg value={timed ? 'on' : 'off'} onChange={(v) => setTimed(v === 'on')} options={[{ id: 'off', label: 'No limit' }, { id: 'on', label: 'Set a limit' }]} />
            {timed && (
              <label className="flex items-center gap-2 text-sm" style={muted}>
                <input type="number" min={1} max={300} value={minutes}
                  onChange={(e) => { setMinutesTouched(true); setMinutes(+e.target.value); }}
                  className="w-20 px-3 py-1.5 rounded-lg outline-none" style={{ background: '#F5F1E8', border: '1.5px solid #E2DDD3', color: '#151515' }} aria-label="Minutes" />
                minutes
              </label>
            )}
          </div>
        </Section>

        <Section n={hasNumerical ? 5 : 4} title="Add your own notes" hint="Optional. Questions are written from the lecture and from what you add here: type or paste notes, or upload photos of handwritten or printed notes (up to 4).">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={20000}
            placeholder="Paste or type your notes…" className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y"
            style={{ background: '#F5F1E8', border: '1.5px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' }} />
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
            <button type="button" disabled={photos.length >= 4} onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}>
              + Add photos of notes
            </button>
          </div>
          {photos.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs" style={muted}>Check what was read from each photo and correct any mistakes. This text is what your questions will be written from.</p>
              {photos.map((p) => (
                <div key={p.id} className="rounded-xl p-3 flex gap-3" style={{ background: '#F5F1E8', border: '1px solid #E2DDD3' }}>
                  <div className="relative flex-shrink-0">
                    <img src={p.thumb} alt={p.name} className="h-16 w-16 object-cover rounded-lg" style={{ border: '1px solid #E2DDD3' }} />
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs leading-none" style={{ background: '#7A263A', color: '#FFFDF9' }}>×</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    {p.state === 'reading' ? (
                      <p className="text-xs animate-progress-pulse" style={muted}>Reading text from {p.name}…</p>
                    ) : (
                      <>
                        <textarea value={p.text} rows={4} maxLength={6000} aria-label={`Text read from ${p.name}`}
                          onChange={(e) => setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))}
                          placeholder="Nothing was read. Type this page's notes here."
                          className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-y"
                          style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' }} />
                        {p.note && <p className="text-xs mt-1" style={{ color: p.state === 'error' ? '#C05050' : '#7A5A1A', fontFamily: 'Inter' }}>{p.note}</p>}
                        {p.reader === 'gemini' && <p className="text-xs mt-1" style={muted}>Read by Gemini</p>}
                        {p.reader === 'openrouter' && <p className="text-xs mt-1" style={muted}>Read by an OpenRouter vision model</p>}
                        {p.reader === 'local' && (
                          <p className="text-xs mt-1" style={muted}>
                            Read with basic OCR, which struggles with handwriting. For better results the server owner can add a free Gemini key (<a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#7A263A', textDecoration: 'underline' }}>get one here</a>; see the README).
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section n={hasNumerical ? 6 : 5} title="Mode">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { id: false, name: 'Normal', desc: 'Answer and get marked on correctness.' },
              { id: true, name: 'Strict', desc: 'You set the rules your answers must follow. The AI marks like an invigilator: it reads each of your answers against your rules and cuts marks, with a reason, for every rule that is not followed.' },
            ].map((m) => (
              <button key={m.name} type="button" onClick={() => setStrict(m.id)} className="text-left rounded-xl p-4 transition-all"
                style={{ background: strict === m.id ? '#F7EEEA' : '#F5F1E8', border: `1.5px solid ${strict === m.id ? '#C5A46D' : '#E2DDD3'}` }}>
                <p className="text-sm font-bold mb-1" style={{ ...heading, color: strict === m.id ? '#7A263A' : '#151515' }}>{m.name} mode</p>
                <p className="text-xs" style={muted}>{m.desc}</p>
              </button>
            ))}
          </div>

          {strict && (
            <div className="mt-5">
              <label htmlFor="rules" className="block text-sm font-semibold mb-1" style={heading}>Your rules for every written answer</label>
              <p className="text-xs mb-2" style={muted}>
                One rule per line, in your own words: length, keywords that must appear, showing working, the structure of the answer, including an example, anything you want held to. The AI invigilator checks each written answer against every rule and decides how much a broken rule costs (up to 25% of that question's marks per rule, at most 60% per question). Rules apply to short answers, long answers and numericals with full working.
              </p>
              <textarea id="rules" value={rules} onChange={(e) => setRules(e.target.value)} rows={4} maxLength={1500}
                placeholder={'Minimum 60 words\nMust mention: cache, tag, index\nShow all steps of a calculation\nStart with a definition, end with a one-line conclusion'}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y"
                style={{ background: '#F5F1E8', border: '1.5px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' }} />
              <div className="flex flex-wrap gap-2 mt-2">
                {RULE_CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => setRules((r) => (r.includes(c) ? r : (r.trim() ? r.trim() + '\n' : '') + c))}
                    className="px-3 py-1 rounded-full text-xs" style={{ background: '#FFFDF9', color: '#7A263A', border: '1px solid #E2DDD3', fontFamily: 'Inter' }}>
                    + {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p role={error ? 'alert' : undefined} className="text-sm" style={{ color: error ? '#C05050' : '#68645F', fontFamily: 'Inter' }}>
            {error || `${total} ${total === 1 ? 'question' : 'questions'} · ${difficulty} · ${timed ? `${minutes} min` : 'no time limit'} · ${strict ? 'strict' : 'normal'} mode`}
          </p>
          <button onClick={start} disabled={!!problem}
            className="px-8 py-3.5 rounded-full text-base font-semibold transition-all disabled:opacity-50"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}>
            Generate quiz →
          </button>
        </div>
      </div>
    </div>
  );
}
