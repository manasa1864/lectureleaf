import { useState, type FormEvent } from 'react';
import Logo from '../components/Logo';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { api } from '../lib/api';

type Mode = 'signin' | 'signup';

const inputStyle = {
  background: '#FFFDF9',
  border: '1.5px solid #E2DDD3',
  color: '#151515',
  fontFamily: 'Inter',
};

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        let { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error && /not confirmed/i.test(error.message)) {
          // Account made before confirmation was switched off: confirm it, then sign in again.
          await api.signUp(email, password);
          ({ error } = await supabase.auth.signInWithPassword({ email, password }));
        }
        if (error) throw error;
      } else {
        // The backend creates an already-confirmed account, so signing in works straight away.
        await api.signUp(email, password);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const focus = (e: React.FocusEvent<HTMLInputElement>) => (e.currentTarget.style.borderColor = '#C5A46D');
  const blur = (e: React.FocusEvent<HTMLInputElement>) => (e.currentTarget.style.borderColor = '#E2DDD3');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#F5F1E8' }}>
      <div className="mb-8">
        <Logo size="md" />
      </div>

      <div
        className="w-full max-w-sm p-7 rounded-2xl animate-fade-in-up"
        style={{ background: '#FFFDF9', border: '1px solid #E2DDD3', boxShadow: '0 2px 18px rgba(21,21,21,0.06)' }}
      >
        <h1 className="text-2xl mb-1" style={{ color: '#151515', fontFamily: 'DM Serif Display, serif' }}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm mb-6" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          {mode === 'signin'
            ? 'Sign in to turn lectures into study pages.'
            : 'Start turning lectures into pages worth revising.'}
        </p>

        {!supabaseConfigured && (
          <p
            className="text-xs p-3 rounded-lg mb-4"
            style={{ background: '#F7EEEA', border: '1px solid #C5A46D', color: '#7A263A', fontFamily: 'Inter' }}
          >
            Supabase isn't configured yet. Copy <b>.env.example</b> to <b>.env</b>, add your project URL and anon key, then restart the dev server.
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold mb-1.5" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={focus}
              onBlur={blur}
              placeholder="you@gmail.com"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold mb-1.5" style={{ color: '#151515', fontFamily: 'DM Sans' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={focus}
              onBlur={blur}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs" style={{ color: '#C05050', fontFamily: 'Inter' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans', letterSpacing: '-0.01em' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#641E30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7A263A')}
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-center mt-6" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="font-semibold"
            style={{ color: '#7A263A', fontFamily: 'DM Sans' }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>

      <p className="text-xs mt-8" style={{ color: '#68645F', fontFamily: 'Inter' }}>© 2026 LectureLeaf</p>
    </div>
  );
}
