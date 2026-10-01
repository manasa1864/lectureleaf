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
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createJob: (url: string, settings: JobSettings) =>
    request<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify({ url, settings }) }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  getPdfUrl: (id: string) => request<{ url: string }>(`/api/jobs/${id}/pdf`),
};
