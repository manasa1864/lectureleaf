import { useState } from 'react';

interface EditProps {
  onBack: () => void;
  onSave: () => void;
}

const frames = [
  { time: '03:12', topic: 'Introduction', desc: 'Course overview and objectives', img: 'photo-1434030216411-0b793f4b4173', included: true },
  { time: '08:45', topic: 'Network Models', desc: 'Why layered architectures exist', img: 'photo-1488190211105-8b0e65b80b4e', included: true },
  { time: '12:43', topic: 'OSI Model', desc: '7 layers with roles explained', img: 'photo-1516321318423-f06f85e504b3', included: true },
  { time: '18:21', topic: 'TCP vs UDP', desc: 'Reliable vs connectionless transport', img: 'photo-1522202176988-66273c2fd55f', included: true },
  { time: '24:09', topic: 'IP Addressing', desc: 'IPv4, subnets, and CIDR notation', img: 'photo-1451187580459-43490279c0fa', included: false },
  { time: '27:09', topic: 'Three-Way Handshake', desc: 'SYN → SYN-ACK → ACK sequence', img: 'photo-1558494949-ef010cbdcc31', included: true },
  { time: '33:55', topic: 'Routing Protocols', desc: 'RIP, OSPF, BGP overview', img: 'photo-1544197150-b99a580bb7a8', included: true },
  { time: '41:18', topic: 'DNS Resolution', desc: 'How domain names resolve to IPs', img: 'photo-1573164713714-d95e436ab8d6', included: true },
];

const allTopics = ['Introduction', 'Network Models', 'OSI Model', 'TCP vs UDP', 'IP Addressing', 'Transport Layer', 'Application Layer', 'Summary'];

export default function Edit({ onBack, onSave }: EditProps) {
  const [frames_, setFrames] = useState(frames);
  const [selected, setSelected] = useState(2);
  const [editingDesc, setEditingDesc] = useState(false);

  const frame = frames_[selected];

  const toggleIncluded = (i: number) => {
    setFrames((prev) => prev.map((f, idx) => idx === i ? { ...f, included: !f.included } : f));
  };

  const updateDesc = (desc: string) => {
    setFrames((prev) => prev.map((f, idx) => idx === selected ? { ...f, desc } : f));
  };

  const updateTopic = (topic: string) => {
    setFrames((prev) => prev.map((f, idx) => idx === selected ? { ...f, topic } : f));
  };

  const removeFrame = (i: number) => {
    if (frames_.length <= 1) return;
    const newFrames = frames_.filter((_, idx) => idx !== i);
    setFrames(newFrames);
    setSelected(Math.min(selected, newFrames.length - 1));
  };

  return (
    <div style={{ background: '#F5F1E8', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 h-14"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm"
          style={{ color: '#68645F', fontFamily: 'Inter' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to results
        </button>
        <h1 className="text-sm font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>Review your study pages</h1>
        <div className="flex items-center gap-2">
          <button
            className="text-sm font-medium px-4 py-1.5 rounded-full"
            style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}
          >
            Download PDF
          </button>
          <button
            onClick={onSave}
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
        <div
          className="w-52 flex-shrink-0 overflow-y-auto p-3 space-y-2"
          style={{ background: '#FFFDF9', borderRight: '1px solid #E2DDD3' }}
        >
          <p className="text-xs font-bold uppercase tracking-wide px-1 mb-3" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>
            {frames_.filter((f) => f.included).length} frames included
          </p>
          {frames_.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className="w-full text-left rounded-xl overflow-hidden transition-all"
              style={{
                border: `1.5px solid ${selected === i ? '#7A263A' : 'transparent'}`,
                opacity: f.included ? 1 : 0.5,
              }}
            >
              <div className="relative">
                <img
                  src={`https://images.unsplash.com/${f.img}?w=200&h=120&fit=crop&auto=format`}
                  alt={f.topic}
                  className="w-full h-14 object-cover"
                />
                <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold px-1 rounded" style={{ background: 'rgba(122,38,58,0.8)', color: '#C5A46D', fontFamily: 'Inter' }}>
                  {f.time}
                </span>
                {!f.included && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(245,241,232,0.5)' }}>
                    <span className="text-[9px] font-bold" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Excluded</span>
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5" style={{ background: selected === i ? '#F7EEEA' : '#F5F1E8' }}>
                <p className="text-[11px] font-semibold truncate" style={{ color: selected === i ? '#7A263A' : '#151515', fontFamily: 'DM Sans' }}>{f.topic}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Main preview */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          <div className="w-full max-w-md">
            <div className="rounded-2xl overflow-hidden shadow-xl" style={{ border: '1.5px solid #E2DDD3', background: '#F5F1E8' }}>
              <img
                src={`https://images.unsplash.com/${frame.img}?w=800&h=450&fit=crop&auto=format`}
                alt={frame.topic}
                className="w-full object-cover"
                style={{ height: 260 }}
              />
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>{frame.time}</span>
                  <div className="w-1 h-1 rounded-full" style={{ background: '#E2DDD3' }} />
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EFE3CC', color: '#7A263A', fontFamily: 'DM Sans', fontWeight: 600 }}>{frame.topic}</span>
                </div>
                <p className="text-sm" style={{ color: '#68645F', fontFamily: 'Inter' }}>{frame.desc}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — details */}
        <div
          className="w-64 flex-shrink-0 overflow-y-auto p-5"
          style={{ background: '#FFFDF9', borderLeft: '1px solid #E2DDD3' }}
        >
          <h3 className="text-sm font-bold mb-5" style={{ color: '#151515', fontFamily: 'DM Sans' }}>Frame details</h3>

          {/* Timestamp */}
          <div className="mb-4">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Timestamp</p>
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#F5F1E8', border: '1px solid #E2DDD3', color: '#C5A46D', fontFamily: 'Inter', fontWeight: 500 }}>
              {frame.time}
            </div>
          </div>

          {/* Topic */}
          <div className="mb-4">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Topic</p>
            <select
              value={frame.topic}
              onChange={(e) => updateTopic(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: '#F5F1E8', border: '1px solid #E2DDD3', color: '#151515', fontFamily: 'Inter' }}
            >
              {allTopics.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Description */}
          <div className="mb-5">
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Description</p>
            {editingDesc ? (
              <textarea
                value={frame.desc}
                onChange={(e) => updateDesc(e.target.value)}
                onBlur={() => setEditingDesc(false)}
                autoFocus
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{ background: '#F5F1E8', border: '1.5px solid #C5A46D', color: '#151515', fontFamily: 'Inter' }}
              />
            ) : (
              <div
                onClick={() => setEditingDesc(true)}
                className="px-3 py-2 rounded-xl text-sm cursor-text transition-all"
                style={{ background: '#F5F1E8', border: '1px solid #E2DDD3', color: '#151515', fontFamily: 'Inter', minHeight: 60 }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#C5A46D')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E2DDD3')}
              >
                {frame.desc}
              </div>
            )}
          </div>

          {/* Include toggle */}
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs font-semibold" style={{ color: '#68645F', fontFamily: 'DM Sans' }}>Include in PDF</p>
            <button
              onClick={() => toggleIncluded(selected)}
              className="w-10 h-6 rounded-full transition-all relative"
              style={{ background: frame.included ? '#7A263A' : '#E2DDD3' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{ background: '#F5F1E8', left: frame.included ? '50%' : '2px' }}
              />
            </button>
          </div>

          <div className="space-y-2">
            <button
              className="w-full px-3 py-2 rounded-xl text-sm font-medium text-left transition-all"
              style={{ background: '#F5F1E8', border: '1px solid #E2DDD3', color: '#68645F', fontFamily: 'DM Sans' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#C5A46D')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E2DDD3')}
            >
              ↑↓ Reorder frame
            </button>
            <button
              onClick={() => removeFrame(selected)}
              className="w-full px-3 py-2 rounded-xl text-sm font-medium text-left transition-all"
              style={{ background: '#FEF5F5', border: '1px solid #F5D5D5', color: '#C05050', fontFamily: 'DM Sans' }}
            >
              × Remove frame
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
