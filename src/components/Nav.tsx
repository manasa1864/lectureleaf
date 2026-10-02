import Logo from './Logo';

interface NavProps {
  onGetStarted: () => void;
  email?: string;
  onSignOut?: () => void;
  onLibrary?: () => void;
  transparent?: boolean;
}

export default function Nav({ onGetStarted, email, onSignOut, onLibrary, transparent = false }: NavProps) {
  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 h-16"
      style={{
        background: transparent ? 'transparent' : 'rgba(245,241,232,0.94)',
        backdropFilter: transparent ? 'none' : 'blur(14px)',
        borderBottom: transparent ? 'none' : '1px solid #E2DDD3',
      }}
    >
      <Logo size="sm" />

      <div className="hidden md:flex items-center gap-8">
        {['How it works', 'Features', 'About'].map((link) => (
          <a
            key={link}
            href="#"
            className="text-sm transition-colors"
            style={{ color: '#68645F', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#151515')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#68645F')}
          >
            {link}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-4">
      {onLibrary && (
        <button
          onClick={onLibrary}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all"
          style={{ background: '#FFFDF9', color: '#7A263A', border: '1.5px solid #C5A46D', fontFamily: 'DM Sans', fontWeight: 600 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F7EEEA')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFDF9')}
        >
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2.5" width="4.5" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="8" y="2.5" width="4.5" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 4 L16.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          My Library
        </button>
      )}
      {onSignOut && (
        <button
          onClick={onSignOut}
          title={email}
          className="text-sm transition-colors"
          style={{ color: '#68645F', fontFamily: 'Inter', fontWeight: 500 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#151515')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#68645F')}
        >
          Sign out
        </button>
      )}
      <button
        onClick={onGetStarted}
        className="text-sm px-5 py-2 rounded-lg transition-all"
        style={{
          background: '#7A263A',
          color: '#FFFDF9',
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 600,
          letterSpacing: '-0.01em',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
      >
        Get Started
      </button>
      </div>
    </nav>
  );
}
