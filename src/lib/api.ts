import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000';

export interface JobFrame {
  index: number;
  seconds: number;
  time: string;
  path: string;
  url?: string;
  included?: boolean;
  note?: string | null;
  heading?: string | null;
  key_points?: string[];
}

export interface Job {
  id: string;
  url: string;
  title: string | null;
  duration_s: number | null;
  status: 'queued' | 'processing' | 'done' | 'error';
  progress: number;
  step: number;
  error: string | null;
  warning: string | null;
  summary: string | null;
  frames: JobFrame[];
  has_pdf: boolean;
}

export interface JobSettings {
  sensitivity: number;
  min_time_between: number;
  dupe_sensitivity: number;
  remove_dupes: boolean;
  skip_transitions: boolean;
  skip_low_quality: boolean;
  page_density: string;
  max_pages: number | null;
  pdf_style: string;
  pdf_page_size: string;
  include_timestamps: boolean;
  generate_key_points: boolean;
  include_topic_headings: boolean;
  detect_topics: boolean;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the LectureLeaf server. Is the backend running?');
  }
  if (res.status === 401) {
    // The session is no longer valid: send the user back to the login page.
    await supabase.auth.signOut();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : res.status === 429 ? 'Too many requests. Please wait a moment.' : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signUp: (email: string, password: string) =>
    request<{ ok: boolean }>('/api/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  createJob: (url: string, settings: JobSettings) =>
    request<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify({ url, settings }) }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  updateFrame: (id: string, index: number, patch: { included?: boolean; note?: string }) =>
    request<{ ok: boolean }>(`/api/jobs/${id}/frames/${index}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  rebuildPdf: (id: string) => request<{ url: string }>(`/api/jobs/${id}/rebuild`, { method: 'POST' }),
  getPdfUrl: (id: string) => request<{ url: string }>(`/api/jobs/${id}/pdf`),
};
