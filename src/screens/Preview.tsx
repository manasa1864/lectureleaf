import { useState } from 'react';
import Logo from '../components/Logo';

interface PreviewProps {
  onBack: () => void;
  onEdit: () => void;
}

const pages = [
  {
    section: '03 — OSI Model',
    time: '12:43',
    img: 'photo-1516321318423-f06f85e504b3',
    points: [
      'The OSI model consists of seven distinct layers',
      'Each layer performs a specific network function',
      'Data moves through layers during communication',
      'Physical layer handles bit-level transmission',
    ],
    page: 12,
  },
  {
    section: '04 — TCP vs UDP',
    time: '18:21',
    img: 'photo-1522202176988-66273c2fd55f',
    points: [
      'TCP provides reliable, connection-oriented delivery',
      'UDP is faster but offers no delivery guarantees',
      'TCP uses three-way handshake to establish connections',
      'UDP suited for real-time applications like video streaming',
    ],
    page: 15,
  },
  {
    section: '04 — Three-Way Handshake',
    time: '27:09',
    img: 'photo-1558494949-ef010cbdcc31',
    points: [
      'SYN: Client initiates connection request',
      'SYN-ACK: Server acknowledges and responds',
      'ACK: Client confirms, connection established',
      'Used to synchronize sequence numbers between peers',
    ],
    page: 18,
  },
];

export default function Preview({ onBack, onEdit }: PreviewProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(100);

  const page = pages[currentPage];

  return (
    <div style={{ background: '#EDE9E0', minHeight: '100vh' }}>
      {/* Controls bar */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-6 h-14 gap-4"
        style={{ background: 'rgba(245,241,232,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2DDD3' }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: '#68645F', fontFamily: 'Inter' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#7A263A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#68645F')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to results
          </button>
          <span className="text-sm font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans' }}>Study Pages</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Zoom */}
          <div className="hidden md:flex items-center gap-2">
            <button onClick={() => setZoom(Math.max(60, zoom - 10))} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#FFFDF9', color: '#68645F', border: '1px solid #E2DDD3' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            </button>
            <span className="text-xs w-10 text-center" style={{ color: '#68645F', fontFamily: 'Inter' }}>{zoom}%</span>
            <button onClick={() => setZoom(Math.min(150, zoom + 10))} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#FFFDF9', color: '#68645F', border: '1px solid #E2DDD3' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            </button>
          </div>

          <button
            onClick={onEdit}
            className="text-sm font-medium px-4 py-1.5 rounded-full transition-all"
            style={{ background: '#FFFDF9', color: '#151515', border: '1px solid #E2DDD3', fontFamily: 'DM Sans' }}
          >
            Edit
          </button>
          <button
            className="text-sm font-medium px-4 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 2 L6.5 8.5 M4 6.5 L6.5 9 L9 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="1.5" y1="11" x2="11.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      <div className="flex gap-0 min-h-[calc(100vh-56px)]">
        {/* Page thumbnails sidebar */}
        <div
          className="hidden md:flex flex-col gap-3 p-4 overflow-y-auto"
          style={{ width: 160, background: '#EDE9E0', borderRight: '1px solid #E2DDD3', minHeight: 'calc(100vh - 56px)' }}
        >
          {pages.map((p, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className="rounded-xl overflow-hidden transition-all text-left"
              style={{
                border: `2px solid ${currentPage === i ? '#7A263A' : 'transparent'}`,
                boxShadow: currentPage === i ? '0 2px 8px rgba(122,38,58,0.15)' : 'none',
              }}
            >
              <div className="p-2 rounded-xl" style={{ background: '#F5F1E8' }}>
                <div className="h-3 w-16 rounded mb-1" style={{ background: '#E2DDD3' }} />
                <img
                  src={`https://images.unsplash.com/${p.img}?w=200&h=120&fit=crop&auto=format`}
                  alt={p.section}
                  className="w-full h-14 object-cover rounded-lg mb-1"
                />
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded" style={{ background: '#E2DDD3' }} />
                  <div className="h-1.5 w-10 rounded" style={{ background: '#E2DDD3' }} />
                </div>
                <p className="text-[9px] text-right mt-1" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>pg. {p.page}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Main page view */}
        <div className="flex-1 flex items-start justify-center p-8 md:p-12">
          <div
            className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: '#F5F1E8',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              border: '1px solid #E2DDD3',
            }}
          >
            {/* PDF Header */}
            <div
              className="px-8 pt-8 pb-5 flex items-center justify-between"
              style={{ borderBottom: '1.5px solid #E2DDD3' }}
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#C5A46D', fontFamily: 'DM Sans' }}>LectureLeaf</p>
                <p className="text-xs" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>Computer Networks — OSI Model</p>
              </div>
              <p className="text-xs" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>Page {page.page}</p>
            </div>

            {/* Section heading */}
            <div className="px-8 pt-7 pb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-1 h-6 rounded-full" style={{ background: '#C5A46D' }} />
                <h2 className="text-xl font-bold" style={{ color: '#7A263A', fontFamily: 'DM Sans', letterSpacing: '-0.01em' }}>
                  {page.section}
                </h2>
              </div>
              <span className="text-sm ml-7" style={{ color: '#C5A46D', fontFamily: 'Inter', fontWeight: 500 }}>
                {page.time}
              </span>
            </div>

            {/* Captured frame */}
            <div className="px-8 mb-6">
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2DDD3' }}>
                <img
                  src={`https://images.unsplash.com/${page.img}?w=800&h=450&fit=crop&auto=format`}
                  alt={page.section}
                  className="w-full object-cover"
                  style={{ maxHeight: 280 }}
                />
              </div>
            </div>

            {/* Key points */}
            <div className="px-8 pb-8">
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#7A263A', fontFamily: 'DM Sans' }}
              >
                Key points
              </p>
              <div className="space-y-3">
                {page.points.map((point, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#C5A46D' }} />
                    <p className="text-sm leading-relaxed" style={{ color: '#151515', fontFamily: 'Inter' }}>{point}</p>
                  </div>
                ))}
              </div>

              {/* Notes lines */}
              <div className="mt-8 space-y-2">
                <p className="text-xs mb-3" style={{ color: '#C5A46D', fontFamily: 'DM Sans', fontWeight: 600 }}>My notes</p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-px" style={{ background: '#E2DDD3' }} />
                ))}
              </div>
            </div>

            {/* PDF footer */}
            <div
              className="px-8 py-4 flex items-center justify-between"
              style={{ borderTop: '1px solid #E2DDD3', background: '#FFFDF9' }}
            >
              <Logo size="xs" />
              <p className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>Computer Networks — {page.time}</p>
              <p className="text-[10px]" style={{ color: '#C5A46D', fontFamily: 'Inter' }}>{page.page}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Page navigation */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg" style={{ background: '#F5F1E8', border: '1px solid #E2DDD3' }}>
        <button
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
          style={{ background: currentPage > 0 ? '#7A263A' : '#FFFDF9', color: currentPage > 0 ? '#FFFDF9' : '#C5A46D' }}
          disabled={currentPage === 0}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-sm font-medium" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
          Page {currentPage + 1} of {pages.length}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
          style={{ background: currentPage < pages.length - 1 ? '#7A263A' : '#FFFDF9', color: currentPage < pages.length - 1 ? '#FFFDF9' : '#C5A46D' }}
          disabled={currentPage === pages.length - 1}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
