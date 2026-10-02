import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Landing from './screens/Landing';
import Login from './screens/Login';
import Setup from './screens/Setup';
import Processing from './screens/Processing';
import Results from './screens/Results';
import Preview from './screens/Preview';
import Edit from './screens/Edit';
import Library from './screens/Library';
import { supabase } from './lib/supabase';
import { api, type FramePatch, type Job, type JobSettings } from './lib/api';

type Screen = 'landing' | 'setup' | 'processing' | 'results' | 'preview' | 'edit' | 'library';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('landing');
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [pdfStale, setPdfStale] = useState(false); // frames were changed after the PDF was built
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
      setPdfStale(false);
      setScreen('processing');
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start processing');
    }
  };

  const onProcessingDone = useCallback((j: Job) => {
    setJob(j);
    setScreen('results');
  }, []);

  /** Open a lecture from the library. Throws if it can't be loaded, so the library can show why. */
  const openLecture = async (id: string) => {
    const j = await api.getJob(id);
    if (j.status !== 'done') throw new Error('This lecture is not finished processing.');
    setJob(j);
    setPdfStale(false); // the server rebuilds an out-of-date PDF itself
    setScreen('results');
  };

  /** Open a lecture's PDF straight from the library. */
  const viewLecture = async (id: string) => {
    await openLecture(id);
    setScreen('preview');
  };

  const renameLecture = async (title: string) => {
    if (!job) return;
    const res = await api.renameJob(job.id, title);
    setJob((j) => (j ? { ...j, title: res.title } : j));
    setPdfStale(true);
  };

  const deleteLecture = async () => {
    if (!job) return;
    await api.deleteJob(job.id);
    setJob(null);
    setJobId(null);
    setScreen('library');
  };

  /** Save a change to one frame. Updates the screen immediately and puts it back if saving fails. */
  const updateFrame = async (index: number, patch: FramePatch) => {
    if (!job) return;
    const before = job.frames.find((f) => f.index === index);
    if (!before) return;
    const apply = (p: FramePatch) =>
      setJob((j) => (j ? { ...j, frames: j.frames.map((f) => (f.index === index ? { ...f, ...p } : f)) } : j));
    apply(patch);
    try {
      await api.updateFrame(job.id, index, patch);
      setPdfStale(true);
    } catch (err) {
      apply({
        included: before.included,
        note: before.note ?? undefined,
        heading: before.heading ?? undefined,
        key_points: before.key_points,
      });
      throw err;
    }
  };

  /** The current PDF. If frames were edited since it was built, rebuild it first. */
  const getPdf = async (): Promise<Blob> => {
    if (!job) throw new Error('No lecture is open.');
    if (pdfStale) {
      await api.rebuildPdf(job.id);
      setPdfStale(false);
    }
    return api.getPdfBlob(job.id);
  };

  if (!authReady) return <div style={{ background: '#F5F1E8', minHeight: '100vh' }} />;
  if (!session) return <Login />;

  const signOut = () => supabase.auth.signOut();
  const email = session.user.email ?? '';

  return (
    <>
      {screen === 'landing' && (
        <Landing
          email={email}
          onSignOut={signOut}
          onLibrary={() => setScreen('library')}
          onGenerate={(u) => {
            setUrl(u);
            setScreen('setup');
          }}
        />
      )}
      {screen === 'library' && (
        <Library email={email} onOpen={openLecture} onView={viewLecture} onNew={() => setScreen('landing')} onSignOut={signOut} />
      )}
      {screen === 'setup' && (
        <Setup
          url={url}
          error={startError}
          onStart={startJob}
          onLibrary={() => setScreen('library')}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'processing' && jobId && (
        <Processing jobId={jobId} url={url} onComplete={onProcessingDone} onFail={() => setScreen('setup')} />
      )}
      {screen === 'results' && job && (
        <Results
          job={job}
          onUpdateFrame={updateFrame}
          onGetPdf={getPdf}
          onRename={renameLecture}
          onDelete={deleteLecture}
          onLibrary={() => setScreen('library')}
          onPreview={() => setScreen('preview')}
          onEdit={() => setScreen('edit')}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'preview' && job && (
        <Preview
          job={job}
          onGetPdf={getPdf}
          onBack={() => setScreen('results')}
          onEdit={() => setScreen('edit')}
        />
      )}
      {screen === 'edit' && job && (
        <Edit
          job={job}
          onUpdateFrame={updateFrame}
          onBack={() => setScreen('results')}
          onSave={() => setScreen('results')}
        />
      )}
    </>
  );
}
