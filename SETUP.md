# Running LectureLeaf

## 1. Supabase (once)
1. Dashboard -> **SQL Editor** -> run `supabase/schema.sql` (creates the `jobs` table and a private `lectureleaf` storage bucket).
2. Dashboard -> **Authentication -> Providers -> Email**. Turn "Confirm email" off while developing if you want to sign in right after signing up.
3. Dashboard -> **Project Settings -> API**: copy the Project URL, the `anon` key and the `service_role` key.

## 2. Frontend
```
copy .env.example .env      # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
pnpm install
pnpm dev
```

## 3. Backend (needs Python 3.10+)
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install --no-deps -r requirements-ocr.txt   # text reading for smarter frame selection
copy .env.example .env      # fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
```

### Smarter frame selection (OCR)
With RapidOCR installed, the backend reads the text on each frame, so it keeps the frame with the most information (for example a slide after all its bullets have appeared) and merges frames showing the same text. It works offline; the models ship with the package. Without it, frames are still chosen, just without text-awareness. Expect roughly 5x real time on a laptop CPU (a 15-minute lecture takes about a minute). `VIDEO_MAX_HEIGHT` (default 720) sets the download quality.

### Transcription and notes (optional but recommended)
Get a free key at https://console.groq.com/keys and set `GROQ_API_KEY` in `backend/.env`. With it, each PDF gets a summary, a contents page, topic headings and key points per page. Without it you still get frames and timestamps, and the Results page shows a notice. This also needs `ffmpeg` on the PATH (`ffmpeg -version` to check).

### If YouTube blocks downloads
This is common on cloud servers. Export cookies from a logged-in browser to a `cookies.txt` file and set `YTDLP_COOKIES_FILE`, and/or set `YTDLP_PROXY`. Keep `yt-dlp` current: `pip install -U yt-dlp`.

### Limits (all in `backend/.env`)
`MAX_LECTURE_MINUTES` (180), `MAX_JOB_MINUTES` (45), `MAX_CONCURRENT_JOBS` (2), `MAX_ACTIVE_JOBS_PER_USER` (2).
Check `http://localhost:8000/api/health` to see whether Supabase, ffmpeg and Groq are configured.

The `service_role` key goes only in `backend/.env`. Never put it in the frontend `.env`.
