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

### Offline fallback (works without any API key)
If `GROQ_API_KEY` is missing, rejected or Groq is down, the backend transcribes the audio itself with a local Whisper model (installed by `requirements.txt` as `faster-whisper`; the model downloads the first time it's used, about 250 MB for `small`). Speech in other languages, including Hindi-English mixes, is translated to English. Headings, key points and the summary are then picked from the transcript instead of written by an AI model, so they're plainer but still useful, and Results shows a notice saying so. Model choice: `LOCAL_WHISPER_MODEL` (`auto` = `small` up to 25 minutes, `base` beyond; `tiny`, `base`, `small`, `medium`). It runs on the CPU at roughly real-time speed for `small`.

### Transcription and notes (optional but recommended)
Get a free key at https://console.groq.com/keys and set `GROQ_API_KEY` in `backend/.env`. With it, each PDF gets a summary, a contents page, topic headings and key points per page. Without it you still get frames and timestamps, and the Results page shows a notice. This also needs `ffmpeg` on the PATH (`ffmpeg -version` to check).

### If YouTube blocks downloads
This is common on cloud servers. Export cookies from a logged-in browser to a `cookies.txt` file and set `YTDLP_COOKIES_FILE`, and/or set `YTDLP_PROXY`. Keep `yt-dlp` current: `pip install -U yt-dlp`.

### Limits (all in `backend/.env`)
`MAX_LECTURE_MINUTES` (180), `MAX_JOB_MINUTES` (45), `MAX_CONCURRENT_JOBS` (2), `MAX_ACTIVE_JOBS_PER_USER` (2).
Check `http://localhost:8000/api/health`: it shows whether Supabase is configured, ffmpeg is found, the Groq key works (`groq.status`: `ok`, `invalid_key`, `not_set`...) and whether offline transcription is available.

### Quizzes
Quizzes need the quiz tables: **re-run `supabase/schema.sql`** in the Supabase SQL Editor (it is safe to run again). `/api/health` shows `schema_up_to_date: true` once it's done.

- **Where:** the **Generate Quiz** button (home page, library, or a lecture's results page) -> choose a lecture -> set up the quiz -> take it -> review. Past quizzes and scores are under **My quizzes**.
- **Answers stay on the server** until you submit. Progress is saved as you go, so a refresh resumes where you stopped.
- **Marking:** MCQ, MSQ, fill-in-the-blank and numericals are marked exactly in code; short/long answers and numerical working are marked by the AI against a rubric. Strict mode checks your own rules: word limits and keywords exactly, structure and working with the AI.
- **Groq limits:** the free tier allows about 8,000 tokens per minute *per model*. The backend keeps requests small, splits big ones, and switches to another available Groq model when one is busy. A second key from the *same* Groq account shares the same limits, so it doesn't help. If every model is busy it falls back to a basic offline quiz (fill in the blank, multiple choice, short and long answer). Upgrading to Groq's Dev tier raises the limits.
- **Photos of notes** are read with the local OCR (RapidOCR), so install `requirements-ocr.txt` as described above. Printed or neat handwriting works best.

### Handwritten notes (optional): Gemini API key
The built-in OCR reads printed text well but struggles with real handwriting. A vision model is far better, so you can add a Google **Gemini** key:

1. Get a key (free tier available, no card needed): **https://aistudio.google.com/apikey** (sign in with a Google account, click "Create API key").
2. Put it in `backend/.env` as `GEMINI_API_KEY=...` (the line is already there, empty). Never put it in the frontend `.env`.
3. Restart the backend. `http://localhost:8000/api/health` should show `"gemini": {"status": "ok", ...}`.

Photos of notes are then read by Gemini first, and by the built-in OCR if Gemini fails or isn't set. You can always correct the text before the quiz is written. The free tier has daily limits, and Google may use free-tier content to improve its products, so don't upload anything private. `GEMINI_MODEL` can pick a different model; the backend falls back to another Gemini model automatically if the configured one is retired.

### Backup AI: OpenRouter API key (optional)
OpenRouter is a second AI provider that takes over automatically when Groq is rate limited, over its token limit, down, or has no working key. It then writes the notes, writes and marks quizzes, and (with a vision model) reads photos of notes. It cannot transcribe audio, so transcription still uses Groq or the offline Whisper model.

1. Create an account and a key: **https://openrouter.ai/keys** ("Create Key").
2. Put it in `backend/.env` as `OPENROUTER_API_KEY=...` (the line is already there, empty). Never put it in the frontend `.env`.
3. Restart the backend. `http://localhost:8000/api/health` should show `"openrouter": {"status": "ok", ...}` and `"ai_available": true`.

Models whose name ends in `:free` cost nothing but have small daily request limits; add credit on openrouter.ai for more. Model names change often, so `OPENROUTER_MODEL` / `OPENROUTER_VISION_MODEL` are only preferences: the backend lists what is available and picks the best match. Order used for AI work: Groq, then OpenRouter, then the offline fallbacks.

The `service_role` key goes only in `backend/.env`. Never put it in the frontend `.env`.
