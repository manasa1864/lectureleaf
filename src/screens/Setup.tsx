import { useState } from 'react';
import Nav from '../components/Nav';
import type { JobSettings } from '../lib/api';

interface SetupProps {
  url: string;
  error?: string;
  onStart: (settings: JobSettings) => Promise<void> | void;
  onBack: () => void;
}

// ─── Reusable primitives ──────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative flex-shrink-0 transition-all"
      style={{
        width: 40,
        height: 24,
        borderRadius: 12,
        background: on ? '#7A263A' : '#E2DDD3',
      }}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
        style={{ background: '#F5F1E8', left: on ? 18 : 2 }}
      />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>
      {children}
    </p>
  );
}

function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5" style={{ borderBottom: '1px solid #EDE9E0' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#151515', fontFamily: 'DM Sans' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5 leading-snug" style={{ color: '#68645F', fontFamily: 'Inter' }}>{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 mb-6 ${className}`}
      style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}
    >
      {children}
    </div>
  );
}

// ─── Existing capture / output / PDF data ─────────────────────────────────────

const captureOptions = [
  {
    id: 'visuals',
    tag: 'Recommended',
    title: 'Important Visuals',
    desc: 'Capture meaningful slides, diagrams, formulas, code, and visual changes.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="7" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M2 14 L6 10 L10 13 L14 8 L20 14" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <line x1="5" y1="19" x2="17" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'slides',
    tag: '',
    title: 'Slides Only',
    desc: 'Focus on presentation slides and static educational content.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="5" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="5" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="10" y1="17" x2="12" y2="19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="7" y1="19" x2="15" y2="19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'scenes',
    tag: '',
    title: 'Scene Changes',
    desc: 'Capture significant visual changes throughout the lecture.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="4" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <rect x="12" y="4" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M10 7 L12 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1 1.5" />
        <rect x="2" y="13" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <rect x="12" y="13" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      </svg>
    ),
  },
  {
    id: 'custom',
    tag: '',
    title: 'Custom Interval',
    desc: 'Capture a frame at a chosen time interval (every 30s, 1m, 2m).',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M11 6 L11 11 L14 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const outputOptions = [
  { id: 'visual',   title: 'Visual Notes',   desc: 'Screenshots + timestamps',                   recommended: false },
  { id: 'detailed', title: 'Detailed Notes',  desc: 'Screenshots + timestamps + key points',       recommended: true  },
  { id: 'clean',    title: 'Clean Slides',    desc: 'Screenshots with minimal additional info',    recommended: false },
];

const pdfStyles = [
  { id: 'minimal',  title: 'Minimal',        desc: 'Frames and timestamps only' },
  { id: 'lecture',  title: 'Lecture Notes',  desc: 'Frames with key points' },
  { id: 'revision', title: 'Revision Sheet', desc: 'Dense grid with key terms' },
  { id: 'cornell',  title: 'Cornell-style',  desc: 'Cues, notes and summary' },
];

const contentTypeOptions = [
  { id: 'slides',   label: 'Slides'          },
  { id: 'diagrams', label: 'Diagrams'        },
  { id: 'formulas', label: 'Formulas'        },
  { id: 'code',     label: 'Code'            },
  { id: 'charts',   label: 'Charts'          },
  { id: 'speaker',  label: 'Speaker / Camera' },
];

const densityOptions = [
  { id: 'compact',  label: 'Compact',  desc: '6–8 pages per lecture' },
  { id: 'balanced', label: 'Balanced', desc: '10–16 pages per lecture', recommended: true },
  { id: 'detailed', label: 'Detailed', desc: '20+ pages per lecture'  },
];

const pageSizeOptions = ['A4', 'Letter', 'A5'];

// ─── PDF style mini-page mockups ─────────────────────────────────────────────

const BURG = '#7A263A';
const GOLD = '#C5A46D';
const LINE = '#E2DDD3';

function Bar({ w, c = LINE, h = 3 }: { w: string; c?: string; h?: number }) {
  return <div className="rounded-full" style={{ width: w, height: h, background: c }} />;
}

function Frame({ h = 28, label }: { h?: number; label?: string }) {
  return (
    <div className="rounded-sm relative overflow-hidden" style={{ height: h, background: '#E8E1D3', border: '1px solid #E2DDD3' }}>
      <svg viewBox="0 0 40 20" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d="M0 20 L10 11 L17 16 L27 6 L40 15 L40 20Z" fill="#D9CFBC" />
      </svg>
      {label && (
        <span className="absolute bottom-0.5 right-0.5 text-[5px] font-bold px-0.5 rounded-sm" style={{ background: BURG, color: '#FFFDF9' }}>
          {label}
        </span>
      )}
    </div>
  );
}

function PDFMockup({ id }: { id: string }) {
  if (id === 'minimal') {
    return (
      <div className="h-full p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between"><Bar w="40%" c={BURG} h={3} /><Bar w="10%" /></div>
        <Frame h={44} label="12:43" />
        <Bar w="70%" />
        <Bar w="45%" />
      </div>
    );
  }
  if (id === 'lecture') {
    return (
      <div className="h-full p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between pb-1" style={{ borderBottom: `1px solid ${LINE}` }}>
          <Bar w="38%" c={BURG} /><Bar w="10%" c={GOLD} />
        </div>
        <Frame h={30} label="12:43" />
        <Bar w="35%" c={BURG} h={2} />
        {[80, 65, 72].map((w, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="rounded-full shrink-0" style={{ width: 3, height: 3, background: BURG }} />
            <Bar w={`${w}%`} />
          </div>
        ))}
      </div>
    );
  }
  if (id === 'revision') {
    return (
      <div className="h-full p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between"><Bar w="45%" c={BURG} /><Bar w="18%" c={GOLD} /></div>
        <div className="grid grid-cols-2 gap-1">
          <Frame h={20} label="3" />
          <Frame h={20} label="7" />
          <Frame h={20} label="9" />
          <Frame h={20} label="12" />
        </div>
        <div className="rounded-sm p-1 flex flex-col gap-0.5" style={{ background: '#F3E9D3', border: `1px solid ${GOLD}` }}>
          <Bar w="30%" c={BURG} h={2} />
          <Bar w="85%" c={GOLD} h={2} />
        </div>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col">
      <div className="px-2 pt-2 pb-1"><Bar w="40%" c={BURG} /></div>
      <div className="flex flex-1 min-h-0">
        <div className="w-[28%] p-1.5 flex flex-col gap-1.5" style={{ borderRight: `1px solid ${BURG}`, borderTop: `1px solid ${LINE}` }}>
          <Bar w="90%" c={GOLD} h={2} />
          <Bar w="70%" c={GOLD} h={2} />
          <Bar w="80%" c={GOLD} h={2} />
        </div>
        <div className="flex-1 p-1.5 flex flex-col gap-1" style={{ borderTop: `1px solid ${LINE}` }}>
          <Frame h={26} />
          <Bar w="85%" />
          <Bar w="60%" />
        </div>
      </div>
      <div className="p-1.5 flex flex-col gap-1" style={{ borderTop: `1px solid ${BURG}`, background: '#F7EEEA' }}>
        <Bar w="75%" c={GOLD} h={2} />
        <Bar w="50%" c={GOLD} h={2} />
      </div>
    </div>
  );
}

// ─── PDF style card ───────────────────────────────────────────────────────────

function PDFStyleCard({
  style,
  selected,
  onClick,
}: {
  style: (typeof pdfStyles)[0];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-3 rounded-xl text-left transition-all w-full"
      style={{
        background: selected ? '#F7EEEA' : '#FFFDF9',
        border: `1.5px solid ${selected ? '#C5A46D' : '#E2DDD3'}`,
      }}
    >
      <div className="w-full h-36 rounded-lg mb-2 overflow-hidden" style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}>
        <PDFMockup id={style.id} />
      </div>
      <p className="text-xs font-semibold" style={{ color: selected ? '#7A263A' : '#151515', fontFamily: 'DM Sans' }}>
        {style.title}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: '#68645F', fontFamily: 'Inter' }}>{style.desc}</p>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Setup({ url, error, onStart, onBack }: SetupProps) {
  const [starting, setStarting] = useState(false);
  const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
  // ── Existing state ──
  const [selectedCapture, setSelectedCapture] = useState('visuals');
  const [selectedOutput, setSelectedOutput] = useState('detailed');
  const [selectedPDF, setSelectedPDF]         = useState('lecture');

  // ── Capture & Cleanup state ──
  const [smartCapture,    setSmartCapture]    = useState(true);
  const [sensitivity,     setSensitivity]     = useState(50);
  const [contentTypes,    setContentTypes]    = useState(['slides', 'diagrams', 'formulas', 'code', 'charts']);
  const [removeDupes,     setRemoveDupes]     = useState(true);
  const [mergeSimilar,    setMergeSimilar]    = useState(true);
  const [skipTransitions, setSkipTransitions] = useState(true);
  const [skipLowQuality,  setSkipLowQuality]  = useState(true);

  // ── Intelligent Organization state ──
  const [detectTopics,      setDetectTopics]      = useState(true);
  const [preferInformative, setPreferInformative] = useState(true);

  // ── Study PDF state ──
  const [includeTimestamps,    setIncludeTimestamps]    = useState(true);
  const [generateKeyPoints,    setGenerateKeyPoints]    = useState(true);
  const [includeTopicHeadings, setIncludeTopicHeadings] = useState(true);
  const [pageDensity,          setPageDensity]          = useState('balanced');

  // ── Advanced state ──
  const [showAdvanced,         setShowAdvanced]         = useState(false);
  const [minTimeBetween,       setMinTimeBetween]       = useState(30);
  const [dupeSensitivity,      setDupeSensitivity]      = useState(70);
  const [maxPages,             setMaxPages]             = useState('');
  const [pdfPageSize,          setPdfPageSize]          = useState('A4');

  const toggleContentType = (id: string) => {
    setContentTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const start = async () => {
    setStarting(true);
    try {
      await onStart({
        sensitivity,
        min_time_between: minTimeBetween,
        dupe_sensitivity: dupeSensitivity,
        remove_dupes: removeDupes,
        skip_transitions: skipTransitions,
        skip_low_quality: skipLowQuality,
        page_density: pageDensity,
        max_pages: parseInt(maxPages, 10) > 0 ? parseInt(maxPages, 10) : null,
        pdf_style: selectedPDF,
        pdf_page_size: pdfPageSize,
        include_timestamps: includeTimestamps,
        generate_key_points: generateKeyPoints,
        include_topic_headings: includeTopicHeadings,
        detect_topics: detectTopics,
      });
    } finally {
      setStarting(false);
    }
  };

  // ── Derived label for sensitivity slider ──
  const sensitivityLabel =
    sensitivity < 35 ? 'Fewer captures' : sensitivity > 65 ? 'More captures' : 'Balanced';

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      <Nav onGetStarted={onBack} />

      <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-8 text-sm transition-colors"
          style={{ color: '#68645F', fontFamily: 'Inter' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#7A263A')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#68645F')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        <h1 className="text-3xl font-bold mb-2" style={{ color: '#7A263A', fontFamily: 'DM Sans', letterSpacing: '-0.02em' }}>
          Let's turn this lecture into study material.
        </h1>
        <p className="mb-8" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          Configure how LectureLeaf captures and formats your notes.
        </p>

        {/* Video preview card */}
        <div
          className="flex gap-4 p-4 rounded-2xl mb-8"
          style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}
        >
          <div className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 relative" style={{ background: '#EDE9E0' }}>
            {videoId && (
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="font-bold text-base mb-0.5" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
              Your lecture
            </p>
            <p className="text-sm truncate" style={{ color: '#68645F', fontFamily: 'Inter' }}>{url}</p>
          </div>
        </div>

        {/* ── 1. Capture mode ──────────────────────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
            What should LectureLeaf capture?
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {captureOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedCapture(opt.id)}
                className="p-4 rounded-2xl text-left relative transition-all"
                style={{
                  background: selectedCapture === opt.id ? '#F7EEEA' : '#FFFDF9',
                  border: `1.5px solid ${selectedCapture === opt.id ? '#C5A46D' : '#E2DDD3'}`,
                }}
              >
                {opt.tag && (
                  <span
                    className="absolute top-2.5 right-2.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: '#C5A46D', color: '#151515', fontFamily: 'DM Sans' }}
                  >
                    {opt.tag}
                  </span>
                )}
                <div className="mb-3" style={{ color: selectedCapture === opt.id ? '#7A263A' : '#68645F' }}>
                  {opt.icon}
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: selectedCapture === opt.id ? '#7A263A' : '#151515', fontFamily: 'DM Sans' }}>
                  {opt.title}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                  {opt.desc}
                </p>
                {selectedCapture === opt.id && (
                  <div className="absolute bottom-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#7A263A' }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8.5 2.5" stroke="#F5F1E8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── 2. Capture & Cleanup ─────────────────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
            Capture &amp; Cleanup
          </h2>

          {/* Smart Capture + Sensitivity */}
          <Card>
            <SectionLabel>Capture</SectionLabel>

            <SettingRow
              label="Smart Capture"
              desc="Automatically detect meaningful visual moments — slides, diagrams, formulas, code, and charts."
            >
              <Toggle on={smartCapture} onToggle={() => setSmartCapture((v) => !v)} />
            </SettingRow>

            {/* Sensitivity slider */}
            <div className="py-3.5" style={{ borderBottom: '1px solid #EDE9E0' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
                    Capture Sensitivity
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                    Control how often LectureLeaf captures a new frame.
                  </p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: '#EFE3CC', color: '#7A263A', fontFamily: 'DM Sans' }}
                >
                  {sensitivityLabel}
                </span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #7A263A ${sensitivity}%, #E2DDD3 ${sensitivity}%)`,
                    outline: 'none',
                  }}
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>Fewer</span>
                  <span className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>More</span>
                </div>
              </div>
            </div>

            {/* Content types */}
            <div className="py-3.5">
              <p className="text-sm font-semibold mb-1" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Content Types</p>
              <p className="text-xs mb-3" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                Choose what kinds of visual content to capture.
              </p>
              <div className="flex flex-wrap gap-2">
                {contentTypeOptions.map((ct) => {
                  const active = contentTypes.includes(ct.id);
                  return (
                    <button
                      key={ct.id}
                      onClick={() => toggleContentType(ct.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        background: active ? '#F7EEEA' : 'transparent',
                        border: `1.5px solid ${active ? '#C5A46D' : '#E2DDD3'}`,
                        color: active ? '#7A263A' : '#68645F',
                        fontFamily: 'DM Sans',
                      }}
                    >
                      {active && (
                        <span className="mr-1" style={{ color: '#7A263A' }}>✓</span>
                      )}
                      {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Cleanup toggles */}
          <Card>
            <SectionLabel>Cleanup</SectionLabel>

            <SettingRow
              label="Remove duplicate frames"
              desc="Skip frames that are identical to a recent capture."
            >
              <Toggle on={removeDupes} onToggle={() => setRemoveDupes((v) => !v)} />
            </SettingRow>

            <SettingRow
              label="Merge similar frames"
              desc="When multiple nearly identical frames exist, keep only the most representative one."
            >
              <Toggle on={mergeSimilar} onToggle={() => setMergeSimilar((v) => !v)} />
            </SettingRow>

            <SettingRow
              label="Skip transition frames"
              desc="Ignore fades, black screens, animations, and blurry transitions."
            >
              <Toggle on={skipTransitions} onToggle={() => setSkipTransitions((v) => !v)} />
            </SettingRow>

            <SettingRow
              label="Skip low-quality captures"
              desc="Ignore frames that are blurry, dark, blank, or obstructed."
            >
              <Toggle on={skipLowQuality} onToggle={() => setSkipLowQuality((v) => !v)} />
            </SettingRow>
          </Card>

          {/* Intelligent Organization */}
          <Card>
            <SectionLabel>Intelligent Organization</SectionLabel>

            <SettingRow
              label="Detect topics"
              desc="Automatically divide the lecture into logical sections based on content."
            >
              <Toggle on={detectTopics} onToggle={() => setDetectTopics((v) => !v)} />
            </SettingRow>

            <SettingRow
              label="Prefer informative frames"
              desc="When similar frames exist, keep the one with diagrams, formulas, code, or a complete slide."
            >
              <Toggle on={preferInformative} onToggle={() => setPreferInformative((v) => !v)} />
            </SettingRow>
          </Card>
        </div>

        {/* ── 3. Output format ─────────────────────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
            How would you like your study pages?
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            {outputOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedOutput(opt.id)}
                className="p-4 rounded-2xl text-left relative transition-all"
                style={{
                  background: selectedOutput === opt.id ? '#F7EEEA' : '#FFFDF9',
                  border: `1.5px solid ${selectedOutput === opt.id ? '#C5A46D' : '#E2DDD3'}`,
                }}
              >
                {opt.recommended && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full mb-2 inline-block"
                    style={{ background: '#C5A46D', color: '#151515', fontFamily: 'DM Sans' }}
                  >
                    Recommended
                  </span>
                )}
                <p className="text-sm font-bold mb-1" style={{ color: selectedOutput === opt.id ? '#7A263A' : '#151515', fontFamily: 'DM Sans' }}>
                  {opt.title}
                </p>
                <p className="text-xs" style={{ color: '#68645F', fontFamily: 'Inter' }}>{opt.desc}</p>
                {selectedOutput === opt.id && (
                  <div className="absolute top-4 right-4 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#7A263A' }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8.5 2.5" stroke="#F5F1E8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── 4. Study PDF options ─────────────────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
            Study PDF
          </h2>

          <Card>
            <SectionLabel>Include in PDF</SectionLabel>

            <SettingRow label="Include timestamps" desc="Show the lecture timestamp below each captured frame.">
              <Toggle on={includeTimestamps} onToggle={() => setIncludeTimestamps((v) => !v)} />
            </SettingRow>

            <SettingRow label="Generate key points" desc="Add a short bullet-point summary below each frame.">
              <Toggle on={generateKeyPoints} onToggle={() => setGenerateKeyPoints((v) => !v)} />
            </SettingRow>

            <SettingRow label="Include topic headings" desc="Add a topic heading at the start of each lecture section.">
              <Toggle on={includeTopicHeadings} onToggle={() => setIncludeTopicHeadings((v) => !v)} />
            </SettingRow>
          </Card>

          {/* Page density */}
          <Card>
            <SectionLabel>Page Density</SectionLabel>
            <p className="text-xs mb-4" style={{ color: '#68645F', fontFamily: 'Inter' }}>
              Control how much content appears on each page.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {densityOptions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setPageDensity(d.id)}
                  className="p-3.5 rounded-xl text-left relative transition-all"
                  style={{
                    background: pageDensity === d.id ? '#F7EEEA' : 'transparent',
                    border: `1.5px solid ${pageDensity === d.id ? '#C5A46D' : '#E2DDD3'}`,
                  }}
                >
                  {d.recommended && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mb-1.5 inline-block"
                      style={{ background: '#C5A46D', color: '#151515', fontFamily: 'DM Sans' }}
                    >
                      Default
                    </span>
                  )}
                  <p className="text-sm font-bold" style={{ color: pageDensity === d.id ? '#7A263A' : '#151515', fontFamily: 'DM Sans' }}>
                    {d.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#68645F', fontFamily: 'Inter' }}>{d.desc}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ── 5. PDF style ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>PDF style</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {pdfStyles.map((s) => (
              <PDFStyleCard
                key={s.id}
                style={s}
                selected={selectedPDF === s.id}
                onClick={() => setSelectedPDF(s.id)}
              />
            ))}
          </div>
        </div>

        {/* ── 6. Advanced Settings ─────────────────────────────────────────── */}
        <div className="mb-10">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold transition-colors mb-4"
            style={{ color: '#68645F', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#7A263A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#68645F')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Advanced Settings
          </button>

          {showAdvanced && (
            <Card>
              <SectionLabel>Fine-tuning</SectionLabel>

              {/* Min time between captures */}
              <div className="py-3.5" style={{ borderBottom: '1px solid #EDE9E0' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
                      Minimum time between captures
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                      Prevent LectureLeaf from capturing too frequently.
                    </p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0 ml-4" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>
                    {minTimeBetween}s
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={minTimeBetween}
                  onChange={(e) => setMinTimeBetween(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #7A263A ${((minTimeBetween - 5) / 115) * 100}%, #E2DDD3 ${((minTimeBetween - 5) / 115) * 100}%)`,
                    outline: 'none',
                  }}
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>5s</span>
                  <span className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>2 min</span>
                </div>
              </div>

              {/* Duplicate sensitivity */}
              <div className="py-3.5" style={{ borderBottom: '1px solid #EDE9E0' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
                      Duplicate sensitivity
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#68645F', fontFamily: 'Inter' }}>
                      How similar two frames must be before one is removed.
                    </p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0 ml-4" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>
                    {dupeSensitivity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={99}
                  value={dupeSensitivity}
                  onChange={(e) => setDupeSensitivity(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #7A263A ${((dupeSensitivity - 50) / 49) * 100}%, #E2DDD3 ${((dupeSensitivity - 50) / 49) * 100}%)`,
                    outline: 'none',
                  }}
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>Loose</span>
                  <span className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>Strict</span>
                </div>
              </div>

              {/* Max pages */}
              <SettingRow
                label="Maximum number of pages"
                desc="Cap the total pages in your study PDF."
              >
                <input
                  type="number"
                  min={1}
                  max={200}
                  placeholder="None"
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value)}
                  className="w-20 px-2.5 py-1.5 rounded-lg text-sm text-right outline-none transition-all"
                  style={{
                    background: '#F5F1E8',
                    border: '1.5px solid #E2DDD3',
                    color: '#151515',
                    fontFamily: 'Inter',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#C5A46D')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#E2DDD3')}
                />
              </SettingRow>

              {/* PDF page size */}
              <div className="pt-3.5">
                <p className="text-sm font-semibold mb-3" style={{ color: '#151515', fontFamily: 'DM Sans' }}>PDF page size</p>
                <div className="flex gap-2">
                  {pageSizeOptions.map((ps) => (
                    <button
                      key={ps}
                      onClick={() => setPdfPageSize(ps)}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: pdfPageSize === ps ? '#F7EEEA' : 'transparent',
                        border: `1.5px solid ${pdfPageSize === ps ? '#C5A46D' : '#E2DDD3'}`,
                        color: pdfPageSize === ps ? '#7A263A' : '#68645F',
                        fontFamily: 'DM Sans',
                      }}
                    >
                      {ps}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── Start button ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-sm" role={error ? 'alert' : undefined} style={{ color: error ? '#C05050' : '#C5A46D', fontFamily: 'Inter' }}>
            {error || 'Estimated time: 2–4 minutes'}
          </p>
          <button
            onClick={start}
            disabled={starting}
            className="px-8 py-3.5 rounded-full text-base font-semibold transition-all disabled:opacity-60"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            {starting ? 'Starting…' : 'Start Processing →'}
          </button>
        </div>
      </div>

      {/* Slider thumb styling */}
      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #7A263A;
          border: 2.5px solid #F5F1E8;
          box-shadow: 0 1px 4px rgba(122,38,58,0.25);
          cursor: pointer;
        }
        input[type='range']::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #7A263A;
          border: 2.5px solid #F5F1E8;
          box-shadow: 0 1px 4px rgba(122,38,58,0.25);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
