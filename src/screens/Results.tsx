import { useState } from 'react';
import Logo from '../components/Logo';
import { api, type Job } from '../lib/api';

interface ResultsProps {
  job: Job | null;
  onPreview: () => void;
  onEdit: () => void;
  onBack: () => void;
}

const demoFrames = [
  { time: '03:12', topic: 'Introduction', desc: 'Course overview and objectives', img: 'photo-1434030216411-0b793f4b4173', keep: true },
  { time: '08:45', topic: 'Network Models', desc: 'Why layered architectures exist', img: 'photo-1488190211105-8b0e65b80b4e', keep: true },
  { time: '12:43', topic: 'OSI Model', desc: '7 layers with roles explained', img: 'photo-1516321318423-f06f85e504b3', keep: true },
  { time: '18:21', topic: 'TCP vs UDP', desc: 'Reliable vs connectionless transport', img: 'photo-1522202176988-66273c2fd55f', keep: true },
  { time: '24:09', topic: 'IP Addressing', desc: 'IPv4, subnets, and CIDR notation', img: 'photo-1451187580459-43490279c0fa', keep: true },
  { time: '27:09', topic: 'Three-Way Handshake', desc: 'SYN → SYN-ACK → ACK sequence', img: 'photo-1558494949-ef010cbdcc31', keep: true },
  { time: '33:55', topic: 'Routing Protocols', desc: 'RIP, OSPF, BGP overview', img: 'photo-1544197150-b99a580bb7a8', keep: true },
  { time: '41:18', topic: 'DNS Resolution', desc: 'How domain names resolve to IPs', img: 'photo-1573164713714-d95e436ab8d6', keep: true },
  { time: '47:32', topic: 'HTTP/HTTPS', desc: 'Request-response model, TLS', img: 'photo-1432888498266-38ffec3eaf0a', keep: true },
  { time: '54:01', topic: 'Firewalls', desc: 'Packet filtering, stateful inspection', img: 'photo-1563986768609-322da13575f3', keep: true },
  { time: '01:02:44', topic: 'VPN Tunneling', desc: 'Encryption and tunneling protocols', img: 'photo-1516321318423-f06f85e504b3', keep: true },
  { time: '01:14:08', topic: 'Summary', desc: 'Review of all key concepts covered', img: 'photo-1434030216411-0b793f4b4173', keep: true },
];

const topics = [
  { num: '01', name: 'Introduction', count: 2, range: '0:00 – 8:44', img: 'photo-1434030216411-0b793f4b4173' },
  { num: '02', name: 'Network Models', count: 3, range: '8:45 – 18:20', img: 'photo-1488190211105-8b0e65b80b4e' },
  { num: '03', name: 'OSI Model', count: 5, range: '18:21 – 33:54', img: 'photo-1516321318423-f06f85e504b3' },
  { num: '04', name: 'TCP/IP', count: 8, range: '33:55 – 47:31', img: 'photo-1558494949-ef010cbdcc31' },
  { num: '05', name: 'Transport Layer', count: 6, range: '47:32 – 54:00', img: 'photo-1522202176988-66273c2fd55f' },
  { num: '06', name: 'Application Layer', count: 4, range: '54:01 – 1:02:43', img: 'photo-1432888498266-38ffec3eaf0a' },
  { num: '07', name: 'Security Basics', count: 5, range: '1:02:44 – 1:14:07', img: 'photo-1563986768609-322da13575f3' },
  { num: '08', name: 'Summary', count: 2, range: '1:14:08 – 1:24:07', img: 'photo-1544197150-b99a580bb7a8' },
];

export default function Results({ job, onPreview, onEdit, onBack }: ResultsProps) {
  const frames = job
    ? job.frames.map((f) => ({
        index: f.index,
        time: f.time,
        topic: f.heading || `Moment ${f.index}`,
        points: f.key_points?.length ? f.key_points : [`Captured at ${f.time}`],
        src: f.url ?? '',
      }))
    : demoFrames.map((f, i) => ({ index: i + 1, time: f.time, topic: f.topic, points: [f.desc], src: `https://images.unsplash.com/${f.img}?w=400&h=240&fit=crop&auto=format` }));
  const hasTopics = !job || job.frames.some((f) => f.heading);
  const liveTopics = frames.map((f, i) => ({
    num: String(i + 1).padStart(2, '0'),
    name: f.topic,
    range: `${f.time} – ${frames[i + 1]?.time ?? 'end'}`,
    count: 1,
    src: f.src,
  }));
  const topicRows = job ? liveTopics : topics.map((t) => ({ ...t, src: `https://images.unsplash.com/${t.img}?w=112&h=80&fit=crop&auto=format` }));
  const [pdfError, setPdfError] = useState('');

  const downloadPdf = async () => {
    setPdfError('');
    setDownloading(true);
    try {
      // Frames were removed since the PDF was built, so rebuild it first.
      const { url } = dirty ? await api.rebuildPdf(job!.id) : await api.getPdfUrl(job!.id);
      setDirty(false);
      window.open(url, '_blank');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Could not get the PDF');
    } finally {
      setDownloading(false);
    }
  };

  const [kept, setKept] = useState(() =>
    job ? job.frames.flatMap((f, i) => (f.included === false ? [] : [i])) : frames.map((_, i) => i),
  );
  const [dirty, setDirty] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'frames' | 'topics'>('frames');

  const toggleKeep = (i: number) => {
    const nowKept = !kept.includes(i);
    setKept((prev) => (nowKept ? [...prev, i] : prev.filter((x) => x !== i)));
    if (!job) return;
    setPdfError('');
    api
      .updateFrame(job.id, frames[i].index, { included: nowKept })
      .then(() => setDirty(true))
      .catch((err) => {
        // Put the toggle back if it couldn't be saved.
        setKept((prev) => (nowKept ? prev.filter((x) => x !== i) : [...prev, i]));
        setPdfError(err instanceof Error ? err.message : 'Could not save that change');
      });
  };

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 h-16"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm"
          style={{ color: '#68645F', fontFamily: 'Inter' }}
        >
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
            className="text-sm font-medium px-4 py-2 rounded-full transition-all"
            style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans' }}
          >
            Preview
          </button>
          <button
            onClick={downloadPdf}
            disabled={!job?.has_pdf || downloading || kept.length === 0}
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
          <p style={{ color: '#68645F', fontFamily: 'Inter' }}>
            We found {kept.length} useful visual moments from this lecture.
          </p>
          {job?.summary && (
            <p className="mt-4 text-sm leading-relaxed max-w-2xl" style={{ color: '#151515', fontFamily: 'Inter' }}>{job.summary}</p>
          )}
          {job?.warning && (
            <p className="mt-4 text-xs p-3 rounded-lg max-w-2xl" style={{ background: '#F7EEEA', border: '1px solid #C5A46D', color: '#7A263A', fontFamily: 'Inter' }}>
              {job.warning}
            </p>
          )}
          {pdfError && (
            <p role="alert" className="mt-4 text-sm" style={{ color: '#C05050', fontFamily: 'Inter' }}>{pdfError}</p>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { value: `${kept.length}`, label: 'Important frames', color: '#7A263A' },
            { value: '12', label: 'Topics identified', color: '#7A263A' },
            { value: job?.duration_s ? `${Math.round(job.duration_s / 60)}m` : '1h 24m', label: 'Lecture duration', color: '#7A263A' },
            { value: '6.8 MB', label: 'Estimated PDF size', color: '#7A263A' },
          ].filter((_, i) => !job || i === 0 || i === 2).map((stat, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl"
              style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}
            >
              <p className="text-3xl font-bold mb-1" style={{ color: stat.color, fontFamily: 'DM Sans' }}>{stat.value}</p>
              <p className="text-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: '#FFFDF9', border: '1px solid #E2DDD3' }}>
          {([['frames', 'Captured moments'], ['topics', 'Topic structure']] as const).filter(([id]) => id === 'frames' || hasTopics).map(([id, label]) => (
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

        {activeTab === 'frames' ? (
          <>
            <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Captured moments</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {frames.map((frame, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{
                    border: `1.5px solid ${kept.includes(i) ? '#E2DDD3' : '#EDE9E0'}`,
                    background: kept.includes(i) ? '#F5F1E8' : '#FFFDF9',
                    opacity: kept.includes(i) ? 1 : 0.5,
                  }}
                >
                  <div className="relative">
                    <img
                      src={frame.src}
                      alt={frame.topic}
                      className="w-full h-28 object-cover"
                    />
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: 'rgba(122,38,58,0.85)', color: '#C5A46D', fontFamily: 'Inter' }}>
                      {frame.time}
                    </div>
                    <button
                      onClick={() => toggleKeep(i)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all"
                      style={{ background: kept.includes(i) ? '#7A263A' : 'rgba(245,241,232,0.9)' }}
                    >
                      {kept.includes(i) ? (
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
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>{frame.topic}</span>
                    <ul className="mt-1 space-y-1">
                      {frame.points.map((pt, k) => (
                        <li key={k} className="text-xs leading-snug" style={{ color: '#68645F', fontFamily: 'Inter' }}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold mb-4" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Your lecture, organized.</h2>
            <div className="space-y-3">
              {topicRows.map((topic, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-2xl transition-all"
                  style={{ background: '#FFFDF9', border: '1.5px solid #E2DDD3' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#C5A46D')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E2DDD3')}
                >
                  <span className="text-sm font-bold w-8 flex-shrink-0" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>{topic.num}</span>
                  <div className="w-14 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={topic.src}
                      alt={topic.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: '#151515', fontFamily: 'DM Sans' }}>{topic.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>{topic.range}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>{topic.count}</p>
                    <p className="text-xs" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>pages</p>
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
