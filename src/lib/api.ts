import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000';

/** A lecture in the library list. */
export interface LectureCard {
  id: string;
  url: string;
  title: string | null;
  duration_s: number | null;
  created_at: string;
  thumbnail: string | null;
  frame_count: number;
}

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

export interface FramePatch {
  included?: boolean;
  note?: string;
  heading?: string;
  key_points?: string[];
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function fetchBlob(path: string): Promise<Blob> {
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
  } catch {
    throw new Error('Cannot reach the LectureLeaf server. Is the backend running?');
  }
  if (res.status === 401) await supabase.auth.signOut();
  if (!res.ok) throw new Error(res.status === 409 ? 'The PDF is not ready yet.' : `Could not load the PDF (${res.status})`);
  return res.blob();
}

export const api = {
  signUp: (email: string, password: string) =>
    request<{ ok: boolean }>('/api/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  createJob: (url: string, settings: JobSettings) =>
    request<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify({ url, settings }) }),
  listLectures: () => request<LectureCard[]>('/api/jobs?status=done'),
  renameJob: (id: string, title: string) =>
    request<{ ok: boolean; title: string }>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteJob: (id: string) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  updateFrame: (id: string, index: number, patch: FramePatch) =>
    request<{ ok: boolean }>(`/api/jobs/${id}/frames/${index}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  rebuildPdf: (id: string) => request<{ url: string }>(`/api/jobs/${id}/rebuild`, { method: 'POST' }),
  getPdfBlob: (id: string) => fetchBlob(`/api/jobs/${id}/pdf/file`),
  getPdfUrl: (id: string) => request<{ url: string }>(`/api/jobs/${id}/pdf`),
};
