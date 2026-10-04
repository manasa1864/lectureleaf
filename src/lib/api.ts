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

/* ───────────── quizzes ───────────── */

export type QType = 'mcq' | 'msq' | 'short' | 'long' | 'numerical' | 'fill';
export type NumericalFormat = 'mcq' | 'answer' | 'working';
export type SkipReason = 'dont_know' | 'unclear_topic' | 'no_formula' | 'unclear_question' | 'out_of_time' | 'other';

export interface QuizConfigIn {
  n: number;
  types: QType[];
  counts: Partial<Record<QType, number>> | null;
  numerical_format: NumericalFormat | 'random';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  time_limit_min: number | null;
  strict: boolean;
  conditions: string;
  notes_text: string;
  images: { name: string; data: string }[];
}

export interface QuizQuestion {
  id: string;
  type: QType;
  difficulty: 'easy' | 'medium' | 'hard';
  text: string;
  marks: number;
  options?: string[];
  numerical_format?: NumericalFormat;
  unit?: string;
}

export interface Rule {
  id: string;
  text: string;
  kind: 'length' | 'keywords' | 'working' | 'structure' | 'other';
  min_words: number | null;
  max_words: number | null;
  keywords: string[];
}

export interface Quiz {
  id: string;
  job_id: string;
  title: string | null;
  status: 'generating' | 'ready' | 'error';
  error: string | null;
  warning: string | null;
  created_at: string;
  config: { difficulty: string | null; time_limit_min: number | null; strict: boolean; numerical_format: string | null; n: number };
  rules: Rule[];
  progress?: { done: number; total: number } | null;
  questions: QuizQuestion[];
}

export interface AttemptSummary {
  id: string;
  submitted_at: string;
  score: number;
  max_score: number;
  percent: number;
  mode: string;
}

export interface QuizListItem {
  id: string;
  job_id: string;
  title: string | null;
  status: string;
  error: string | null;
  created_at: string;
  n_questions: number;
  strict: boolean;
  difficulty: string | null;
  time_limit_min: number | null;
  attempts: AttemptSummary[];
  in_progress: string | null;
}

export type Answer = number | number[] | string;
export type Skips = Record<string, { reason: SkipReason; note: string }>;

export interface QResult {
  id: string;
  type: QType;
  text: string;
  options?: string[] | null;
  marks: number;
  awarded: number;
  status: 'correct' | 'partial' | 'wrong' | 'skipped' | 'unanswered';
  your_answer: string | string[];
  correct_answer: string | string[];
  explanation: string;
  feedback: string;
  graded_by: 'auto' | 'ai' | 'keyword';
  deductions: { rule: string; marks: number; reason: string }[];
  rubric: { point: string; marks: number; awarded: number; comment: string }[] | null;
  skip: { reason: SkipReason; note: string } | null;
  source: { page: number; time: string; heading: string } | null;
}

export interface QuizResults {
  questions: QResult[];
  score: number;
  max_score: number;
  percent: number;
  by_type: Record<string, { awarded: number; marks: number; count: number }>;
  by_page: { page: number | null; time: string; heading: string; awarded: number; marks: number; skipped: number; missed: number }[];
  skip_reasons: Partial<Record<SkipReason, number>>;
  revise: { page: number | null; time: string; heading: string; awarded: number; marks: number; skipped: number; missed: number }[];
  counts: Record<'correct' | 'partial' | 'wrong' | 'skipped' | 'unanswered', number>;
  strict: { on: boolean; rules: Rule[]; marks_deducted: number };
  ai_graded: boolean;
  keyword_graded: boolean;
  time_limit_s: number | null;
}

export interface Attempt {
  id: string;
  quiz_id: string;
  status: 'in_progress' | 'submitted';
  started_at: string;
  answers: Record<string, Answer>;
  skips: Skips;
  server_now: string;
  results?: QuizResults;
  score?: number;
  max_score?: number;
  percent?: number;
  time_taken_s?: number;
  over_time?: boolean;
  submitted_at?: string;
}

export const api = {
  readPhotos: (images: { name: string; data: string }[]) =>
    request<{ name: string; text: string; chars: number; reader: 'gemini' | 'openrouter' | 'local' }[]>('/api/ocr', { method: 'POST', body: JSON.stringify({ images }) }),
  createQuiz: (job_id: string, config: QuizConfigIn) =>
    request<{ id: string }>('/api/quizzes', { method: 'POST', body: JSON.stringify({ job_id, config }) }),
  getQuiz: (id: string) => request<Quiz>(`/api/quizzes/${id}`),
  listQuizzes: () => request<QuizListItem[]>('/api/quizzes'),
  deleteQuiz: (id: string) => request<void>(`/api/quizzes/${id}`, { method: 'DELETE' }),
  deriveQuiz: (id: string, attempt_id: string, which: 'missed' | 'skipped' | 'missed_or_skipped') =>
    request<{ id: string }>(`/api/quizzes/${id}/derive`, { method: 'POST', body: JSON.stringify({ attempt_id, which }) }),
  startAttempt: (quizId: string) => request<Attempt>(`/api/quizzes/${quizId}/attempts`, { method: 'POST' }),
  saveAttempt: (id: string, body: { answers: Record<string, Answer>; skips: Skips }) =>
    request<{ ok: boolean }>(`/api/attempts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  submitAttempt: (id: string, body: { answers: Record<string, Answer>; skips: Skips; time_taken_s: number }) =>
    request<Attempt>(`/api/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify(body) }),
  getAttempt: (id: string) => request<Attempt>(`/api/attempts/${id}`),
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
