import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Landing from './screens/Landing';
import Login from './screens/Login';
import Setup from './screens/Setup';
import Processing from './screens/Processing';
import Results from './screens/Results';
import Preview from './screens/Preview';
import Edit from './screens/Edit';
import { supabase } from './lib/supabase';
import { api, type Job, type JobSettings } from './lib/api';

type Screen = 'landing' | 'setup' | 'processing' | 'results' | 'preview' | 'edit';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('landing');
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setScreen('landing');
        setJobId(null);
        setJob(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const startJob = async (settings: JobSettings) => {
    setStartError('');
    try {
      const { id } = await api.createJob(url, settings);
      setJobId(id);
      setJob(null);
      setScreen('processing');
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start processing');
    }
  };

  if (!authReady) return <div style={{ background: '#F5F1E8', minHeight: '100vh' }} />;
  if (!session) return <Login />;

  const signOut = () => supabase.auth.signOut();

  return (
    <>
      {screen === 'landing' && (
        <Landing
          email={session.user.email ?? ''}
          onSignOut={signOut}
          onGenerate={(u) => {
            setUrl(u);
            setScreen('setup');
          }}
        />
      )}
      {screen === 'setup' && (
        <Setup
          url={url}
          error={startError}
          onStart={startJob}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'processing' && jobId && (
        <Processing
          jobId={jobId}
          url={url}
          onComplete={(j) => {
            setJob(j);
            setScreen('results');
          }}
          onFail={() => setScreen('setup')}
        />
      )}
      {screen === 'results' && (
        <Results
          job={job}
          onPreview={() => setScreen('preview')}
          onEdit={() => setScreen('edit')}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'preview' && (
        <Preview
          onBack={() => setScreen('results')}
          onEdit={() => setScreen('edit')}
        />
      )}
      {screen === 'edit' && (
        <Edit
          onBack={() => setScreen('results')}
          onSave={() => setScreen('results')}
        />
      )}
    </>
  );
}
