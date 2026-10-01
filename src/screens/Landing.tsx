import { useRef, useState } from 'react';
import Logo from '../components/Logo';
import Nav from '../components/Nav';

interface LandingProps {
  onGenerate: (url: string) => void;
  email?: string;
  onSignOut?: () => void;
}

// ─── Feature icons (burgundy line icons) ──────────────────────────────────────

function IconScene() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="3" width="16" height="12" rx="2" stroke="#7A263A" strokeWidth="1.4" />
      <path d="M1 11 L5 8 L8 10.5 L12 6.5 L17 10" stroke="#7A263A" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function IconDuplicate() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="#7A263A" strokeWidth="1.4" />
      <rect x="7" y="7" width="10" height="10" rx="1.5" stroke="#7A263A" strokeWidth="1.4" />
      <line x1="9" y1="4.5" x2="13" y2="8.5" stroke="#C5A46D" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="#7A263A" strokeWidth="1.4" />
      <path d="M9 5 L9 9 L12 11.5" stroke="#7A263A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconOrg() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="2" y1="4" x2="16" y2="4" stroke="#7A263A" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="9" x2="11" y2="9" stroke="#7A263A" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="14" x2="13" y2="14" stroke="#7A263A" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="15" cy="9" r="1.5" fill="#C5A46D" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 13 L11 5 L14 8 L6 16 L2 16 Z" stroke="#7A263A" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <line x1="9" y1="7" x2="12" y2="10" stroke="#7A263A" strokeWidth="1.2" />
    </svg>
  );
}
function IconPDF() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="1" width="14" height="16" rx="2" stroke="#7A263A" strokeWidth="1.4" />
      <line x1="5" y1="6" x2="13" y2="6" stroke="#7A263A" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="9" x2="10" y2="9" stroke="#C5A46D" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 12 L9 15 M7 13.5 L9 15 L11 13.5" stroke="#7A263A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Hero transformation visual ───────────────────────────────────────────────

function HeroVisual() {
  return (
    <div className="relative w-full max-w-lg mx-auto" style={{ minHeight: 340 }}>

      {/* Stage labels row */}
      <div className="flex items-start justify-between mb-3 px-1">
        {[
          { n: '01', label: 'VIDEO' },
          { n: '02', label: 'CAPTURED' },
          { n: '03', label: 'STUDY PAGE' },
        ].map((s) => (
          <div key={s.n} className="flex items-center gap-1">
            <span className="text-[10px] font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>{s.n}</span>
            <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: '#7A263A', fontFamily: 'DM Sans', opacity: 0.7 }}>— {s.label}</span>
          </div>
        ))}
      </div>

      {/* Thin connecting line behind the cards */}
      <div className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: 80, zIndex: 0 }}>
        <div className="flex-1 h-px" style={{ background: '#E2DDD3', marginLeft: 80 }} />
        <div className="flex-1 h-px" style={{ background: '#E2DDD3', marginRight: 80 }} />
      </div>

      {/* Three panels */}
      <div className="flex items-start gap-3 relative z-10">

        {/* 01 — Video card */}
        <div
          className="flex-1 rounded-xl overflow-hidden"
          style={{
            background: '#FFFDF9',
            border: '1px solid #E2DDD3',
            boxShadow: '0 2px 12px rgba(21,21,21,0.06)',
          }}
        >
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=220&fit=crop&auto=format"
              alt="Educational lecture"
              className="w-full h-24 object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(21,21,21,0.25)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,253,249,0.95)' }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 1.5L10.5 6L2.5 10.5V1.5Z" fill="#7A263A" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: 'rgba(21,21,21,0.75)', color: '#C5A46D', fontFamily: 'Inter' }}>
              1:24:07
            </div>
          </div>
          <div className="px-2.5 py-2">
            <p className="text-[10px] font-bold truncate leading-tight" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Computer Networks</p>
            <p className="text-[9px] mt-0.5" style={{ color: '#68645F', fontFamily: 'Inter' }}>OSI Model</p>
          </div>
        </div>

        {/* 02 — Captured frames */}
        <div className="flex-1 flex flex-col gap-2">
          {[
            { img: 'photo-1434030216411-0b793f4b4173', time: '08:45', label: 'Slide' },
            { img: 'photo-1488190211105-8b0e65b80b4e', time: '18:21', label: 'Diagram' },
            { img: 'photo-1522202176988-66273c2fd55f', time: '27:09', label: 'Code' },
          ].map((f, i) => (
            <div
              key={i}
              className="relative rounded-lg overflow-hidden animate-leaf-float"
              style={{
                border: '1px solid #E2DDD3',
                animationDelay: `${i * 180}ms`,
                boxShadow: '0 1px 6px rgba(21,21,21,0.05)',
              }}
            >
              <img
                src={`https://images.unsplash.com/${f.img}?w=200&h=110&fit=crop&auto=format`}
                alt={f.label}
                className="w-full h-14 object-cover"
              />
              <div className="flex items-center justify-between px-2 py-1" style={{ background: '#FFFDF9' }}>
                <span className="text-[8px] font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>{f.label}</span>
                <span className="text-[8px]" style={{ color: '#68645F', fontFamily: 'Inter' }}>{f.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 03 — Study page */}
        <div
          className="flex-1 rounded-xl overflow-hidden"
          style={{
            background: '#FFFDF9',
            border: '1px solid #E2DDD3',
            boxShadow: '0 2px 12px rgba(21,21,21,0.07)',
          }}
        >
          <div className="px-2.5 pt-2.5 pb-1.5" style={{ borderBottom: '1px solid #E2DDD3' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>03 — OSI Model</span>
              <span className="text-[8px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>pg. 12</span>
            </div>
            <span className="text-[9px]" style={{ color: '#7A263A', fontFamily: 'Inter', fontWeight: 600 }}>12:43</span>
          </div>
          <div className="h-16 overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=280&h=140&fit=crop&auto=format"
              alt="Study content"
              className="w-full h-full object-cover"
              style={{ opacity: 0.85 }}
            />
          </div>
          <div className="px-2.5 py-2">
            <p className="text-[8px] font-bold mb-1 uppercase tracking-wide" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Key points</p>
            {['7 distinct layers', 'Each layer: one job', 'Data flows down'].map((pt, i) => (
              <div key={i} className="flex items-start gap-1 mb-0.5">
                <span style={{ color: '#7A263A', fontSize: 7, marginTop: 2, flexShrink: 0 }}>•</span>
                <p className="text-[7.5px] leading-tight" style={{ color: '#68645F', fontFamily: 'Inter' }}>{pt}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const features = [
  { Icon: IconScene,     title: 'Smart Scene Detection',  desc: 'Detects meaningful visual changes rather than capturing every frame.' },
  { Icon: IconDuplicate, title: 'Duplicate Removal',       desc: 'Eliminates nearly identical screenshots so your notes stay clean.' },
  { Icon: IconClock,     title: 'Timestamped Frames',      desc: 'Every captured frame retains its original lecture timestamp.' },
  { Icon: IconOrg,       title: 'Topic Organization',      desc: 'Groups visual content into logical lecture sections automatically.' },
  { Icon: IconEdit,      title: 'Editable Results',        desc: 'Review, remove, or reorder captured frames before exporting.' },
  { Icon: IconPDF,       title: 'PDF Export',              desc: 'Generate a clean, printable study document ready for revision.' },
];

const steps = [
  { num: '01', title: 'Paste',    desc: 'Add your YouTube lecture link. LectureLeaf handles the rest.' },
  { num: '02', title: 'Capture',  desc: 'Intelligent detection captures slides, diagrams, formulas, and code — nothing redundant.' },
  { num: '03', title: 'Organize', desc: 'Frames are arranged chronologically into clean, readable sections.' },
  { num: '04', title: 'Revise',   desc: 'Export a polished PDF and open your notebook to the first page.' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function Landing({ onGenerate, email, onSignOut }: LandingProps) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Needs a link first: with an empty field, bring the user to the input instead.
  const go = () => {
    if (url.trim()) return onGenerate(url.trim());
    window.scrollTo({ top: 0, behavior: 'smooth' });
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <Nav onGetStarted={go} email={email} onSignOut={onSignOut} />

      {/* ── Hero ── */}
      <section className="px-6 md:px-10 pt-16 pb-24 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">

          {/* Left — text + input */}
          <div className="animate-fade-in-up">

            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
              style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#7A263A', display: 'inline-block' }} />
              <span className="text-xs font-semibold" style={{ color: '#151515', fontFamily: 'DM Sans', letterSpacing: '-0.01em' }}>
                From lecture to revision
              </span>
            </div>

            {/* Headline — serif */}
            <h1
              className="leading-tight mb-5"
              style={{
                fontFamily: 'DM Serif Display, serif',
                fontSize: 'clamp(2.2rem, 4.5vw, 3.2rem)',
                color: '#151515',
                letterSpacing: '-0.01em',
                fontWeight: 400,
              }}
            >
              Turn lectures into<br />
              <em style={{ color: '#7A263A', fontStyle: 'italic' }}>pages worth revising.</em>
            </h1>

            {/* Description */}
            <p
              className="text-base leading-relaxed mb-8"
              style={{ color: '#68645F', fontFamily: 'Inter', maxWidth: 460 }}
            >
              Paste an educational YouTube lecture and LectureLeaf finds the important visual moments, organizes them, and turns them into revision-ready study pages.
            </p>

            {/* URL input */}
            <div
              className="flex items-center gap-2 p-2 rounded-xl mb-3"
              style={{
                background: '#FFFDF9',
                border: '1px solid #E2DDD3',
                boxShadow: '0 2px 14px rgba(21,21,21,0.06)',
              }}
            >
              <div className="flex items-center gap-2.5 flex-1 px-3">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
                  <rect x="1" y="3.5" width="16" height="11" rx="2" stroke="#7A263A" strokeWidth="1.4" fill="none" />
                  <path d="M7 6.5L12.5 9L7 11.5V6.5Z" fill="#7A263A" />
                </svg>
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a YouTube lecture link..."
                  className="flex-1 outline-none bg-transparent text-sm"
                  style={{ color: '#151515', fontFamily: 'Inter' }}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                />
              </div>
              <button
                onClick={go}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0"
                style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans', letterSpacing: '-0.01em' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
              >
                Generate Study Notes
              </button>
            </div>

            <p className="text-sm" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>
              No manual screenshots. No endless scrubbing.
            </p>
          </div>

          {/* Right — transformation visual */}
          <div className="animate-fade-in-up delay-200">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="px-6 md:px-10 py-20"
        style={{ background: '#FFFDF9', borderTop: '1px solid #E2DDD3', borderBottom: '1px solid #E2DDD3' }}
      >
        <div className="max-w-5xl mx-auto">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: '#7A263A', fontFamily: 'DM Sans' }}
          >
            How it works
          </p>
          <h2
            className="mb-14"
            style={{
              fontFamily: 'DM Serif Display, serif',
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              color: '#151515',
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}
          >
            From lecture to revision,<br />automatically.
          </h2>

          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="relative z-10">
                  <p
                    className="text-2xl font-bold mb-4"
                    style={{ color: '#7A263A', fontFamily: 'DM Serif Display, serif', fontWeight: 400 }}
                  >
                    {step.num}
                  </p>
                  <h3
                    className="text-base font-bold mb-2"
                    style={{ color: '#151515', fontFamily: 'DM Sans' }}
                  >
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
        <p
          className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: '#7A263A', fontFamily: 'DM Sans' }}
        >
          Features
        </p>
        <h2
          className="mb-12"
          style={{
            fontFamily: 'DM Serif Display, serif',
            fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
            color: '#151515',
            fontWeight: 400,
            letterSpacing: '-0.01em',
          }}
        >
          Built for how students actually study.
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
          {features.map(({ Icon, title, desc }, i) => (
            <div
              key={i}
              className="p-6 rounded-xl transition-all"
              style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#7A263A';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(122,38,58,0.07)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#E2DDD3';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: '#F5F1E8' }}>
                <Icon />
              </div>
              <h3 className="font-bold text-sm mb-2" style={{ color: '#151515', fontFamily: 'DM Sans' }}>{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#68645F', fontFamily: 'Inter' }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className="px-6 md:px-10 py-16">
        <div
          className="max-w-3xl mx-auto rounded-2xl p-12 text-center relative overflow-hidden"
          style={{ background: '#151515' }}
        >
          {/* Gold divider accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-px" style={{ background: '#C5A46D' }} />

          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>
            Get started free
          </p>
          <h2
            className="mb-4"
            style={{
              fontFamily: 'DM Serif Display, serif',
              fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
              color: '#FFFDF9',
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}
          >
            Your next study session starts here.
          </h2>
          <p className="text-sm mb-8 mx-auto max-w-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>
            Paste a lecture. Get a beautifully organized study document. In minutes.
          </p>
          <button
            onClick={go}
            className="px-8 py-3.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans', letterSpacing: '-0.01em' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            Generate Study Notes
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7 H11 M8 4 L11 7 L8 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 md:px-10 py-8" style={{ borderTop: '1px solid #E2DDD3' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="xs" />
          <p className="text-xs" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>
            Turn lectures into pages worth revising.
          </p>
          <p className="text-xs" style={{ color: '#68645F', fontFamily: 'Inter' }}>© 2026 LectureLeaf</p>
        </div>
      </footer>
    </div>
  );
}
