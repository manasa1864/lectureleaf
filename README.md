# LectureLeaf

Turn any YouTube lecture into **revision-ready study notes**, then **test yourself on them**.

Paste a lecture link and LectureLeaf watches it for you: it picks out the slides, diagrams and board work worth keeping, writes headings and key points from what the lecturer says, and builds a clean PDF. Everything you process is saved to a personal **library** where you can edit the notes by hand. From any saved lecture you can generate a **quiz** (several question types, timed, with an optional strict mode where an AI invigilator marks your answers against rules you set) that is built from the lecture and from your own notes.

## Demo video

[![Watch the LectureLeaf demo (about 8 minutes)](https://i.vimeocdn.com/filter/overlay?src0=https%3A%2F%2Fi.vimeocdn.com%2Fvideo%2F2208284143-a34c188dc74d230cac84aaefa7a0084bceff8a9346decfe641640d9abd712cb2-d_1280x720%3Fregion%3Dus&src1=http%3A%2F%2Ff.vimeocdn.com%2Fp%2Fimages%2Fcrawler_play.png)](https://vimeo.com/1232775707)

Click the picture to watch it on Vimeo: [vimeo.com/1232775707](https://vimeo.com/1232775707)

## Live demo

**Try it here: [lectureleaf-ffw93l78d-mg06.vercel.app](https://lectureleaf-ffw93l78d-mg06.vercel.app)**

Sign up with any email and password, then paste a YouTube lecture link or upload a video file. Two things to know about the free hosting:

- The server sleeps when idle, so the first request after a quiet spell can take about a minute.
- YouTube blocks downloads from cloud servers, so a YouTube link can fail with "YouTube is temporarily blocking downloads". Use **Upload a video file** on the home page (up to 90 MB) when that happens. Notes, PDF, library and quizzes work the same either way.

---

## Contents

1. [What it does](#what-it-does)
2. [How it works](#how-it-works)
3. [What you need](#what-you-need)
4. [Run it (step by step)](#run-it-step-by-step)
5. [Deploy it (Vercel + a backend host)](#deploy-it-vercel--a-backend-host)
6. [Using the app](#using-the-app)
7. [Configuration reference](#configuration-reference)
8. [AI providers and fallbacks](#ai-providers-and-fallbacks)
9. [Quizzes in detail](#quizzes-in-detail)
10. [Command cheat sheet](#command-cheat-sheet)
11. [Troubleshooting](#troubleshooting)
12. [Project layout](#project-layout)
13. [Security notes](#security-notes)
14. [Known limitations](#known-limitations)

---

## What it does

| Feature | Details |
|---|---|
| **Lecture to PDF** | Paste a YouTube link. You get the key moments as images with timestamps, a heading and key points for each page, a summary and a contents page. |
| **Four PDF styles** | Minimal, Lecture Notes, Revision Sheet (2x2 grid) and Cornell-style (cues, notes, summary). A4, Letter or A5. |
| **Smart frame picking** | Keeps the sharpest, most complete frame of each slide (the one with the most text), merges repeats, and ignores a presenter on camera. |
| **Library** | Every finished lecture is saved. Open, rename, edit, preview, download or delete it. |
| **Manual editing** | Change any page's heading, key points and personal note, and switch pages on or off. The PDF is rebuilt with your edits. |
| **Quizzes** | MCQ, MSQ, fill in the blanks, short answer, long answer and numericals. Choose the mix or let it be random, set difficulty and a time limit, add your own notes (text or photos). |
| **Strict mode** | You write your own rules for your answers (length, keywords, showing working, structure, an example, anything you like). The **AI marks your written answers like an invigilator**: it reads each answer against your rules and cuts marks, with a reason, for every rule that is not followed. |
| **Skip with a reason** | Skipping a question asks why (didn't know the answer, topic unclear, didn't know the formula...) and the results turn that into revision advice. |
| **Accounts** | Email and password sign up and sign in. Each person only ever sees their own lectures and quizzes. |
| **Works without AI keys** | Offline fallbacks (local speech-to-text, local OCR, plain notes and basic quizzes) keep everything usable. Keys just make it faster and better. |

## How it works

```
YouTube link
   |
   v
yt-dlp downloads the video (picture only, 720p) and, separately, the audio
   |
   +--> frames: sample the video -> ignore always-moving regions (the presenter)
   |            -> group into "same content" segments -> pick the best frame in each
   |            (sharp, settled, most text via OCR) -> merge duplicates by look and by text
   |
   +--> speech: Groq Whisper  (or offline faster-whisper)  -> transcript
   |
   v
notes: an AI model (Groq, then OpenRouter) writes headings, key points and a summary,
       or plain extractive notes if no AI is available
   |
   v
PDF (ReportLab) + images stored in a private Supabase bucket; rows saved in Supabase
   |
   v
Library  ->  Edit  ->  Preview / Download  ->  Generate Quiz  ->  Take  ->  Results
```

**Stack:** React 19, Vite 8, TypeScript and Tailwind CSS v4 (frontend); FastAPI and Python (backend); Supabase for sign in, database and file storage; OpenCV, RapidOCR, yt-dlp, ffmpeg and faster-whisper for the video work.

## What you need

| Tool | Why | Check |
|---|---|---|
| **Node.js 22** and **pnpm** | the frontend | `node --version`, `pnpm --version` (install pnpm: `npm i -g pnpm`) |
| **Python 3.10 or newer** | the backend | `python --version` |
| **ffmpeg** on your PATH | audio extraction and transcription | `ffmpeg -version` ([download](https://ffmpeg.org/download.html); on Windows `winget install ffmpeg`) |
| A free **Supabase** project | accounts, database, file storage | [supabase.com](https://supabase.com) |

Optional, all with free tiers: a **Groq** key (fast transcription and notes), a **Gemini** key (reads handwriting), an **OpenRouter** key (backup AI). See [AI providers](#ai-providers-and-fallbacks).

## Run it (step by step)

The app is two programs that run side by side: the **frontend** (what you see) and the **backend** (the processing). Commands below are for Windows PowerShell; on macOS or Linux use `cp` instead of `copy` and `source .venv/bin/activate` instead of `.venv\Scripts\activate`.

### 1. Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It creates the tables (lectures, frames, profiles, settings, quizzes, attempts), security rules and a private storage bucket named `lectureleaf`. It is safe to run again, and you should run it again after pulling updates.
3. Open **Project Settings -> API** and copy the **Project URL**, the **anon** key and the **service_role** key. You need all three below.

### 2. Frontend

From the project folder:

```powershell
copy .env.example .env
```

Open `.env` and fill in:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon key>
VITE_API_URL=http://localhost:8000
```

Then install and start it:

```powershell
pnpm install
pnpm dev
```

The app opens at **http://localhost:8443** (the port comes from `PORT`; it defaults to 8443).

### 3. Backend

In a **second terminal**:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install --no-deps -r requirements-ocr.txt
copy .env.example .env
```

Open `backend/.env` and fill in at least:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service_role key>
```

Add `GROQ_API_KEY=...` too if you have one. Then start the server:

```powershell
uvicorn app.main:app --reload --port 8000
```

> The OCR package must be installed with `--no-deps` (the second `pip` line). Installed normally it pulls in a second copy of OpenCV that clashes with the one the backend uses.

### 4. Check it is healthy

Open **http://localhost:8000/api/health**. You want to see:

```json
{ "ok": true, "supabase_configured": true, "ffmpeg": true, "schema_up_to_date": true,
  "groq": { "status": "ok" }, "ai_available": true, "offline_transcription": true }
```

If something is `false` or says `invalid_key` / `not_set`, see [Troubleshooting](#troubleshooting).

### 5. Use it

Go to **http://localhost:8443**, create an account (you can sign in straight away, no email confirmation), paste a YouTube lecture link and press Generate.

After pulling new code: run `pip install -r requirements.txt` again, re-run `supabase/schema.sql`, and restart the backend.

## Deploy it (Vercel + a backend host)

### Why two places

**Vercel hosts the frontend only.** Vercel runs short-lived serverless functions: they time out after seconds to a few minutes, cannot keep background jobs running after a reply, have no `ffmpeg` and have a small size limit. The backend downloads videos, runs OpenCV, OCR and Whisper, and works on a lecture for minutes in the background, so it needs an **always-on container**. Everything persistent (accounts, lectures, images, PDFs) is already in Supabase, so the backend itself keeps nothing.

```
Browser ──> Vercel (the React app, static files)
Browser ──> Backend container (HTTPS API) ──> Supabase + AI providers + YouTube
```

### Before you start

- The code is on **GitHub** (Vercel and most hosts deploy from a repo). Check `git status` shows no `.env` file: they are git-ignored.
- You have run `supabase/schema.sql` in your Supabase project.
- You have your Supabase **URL**, **anon** key and **service_role** key, and ideally a **Groq** key.

### Part 1: deploy the backend (do this first)

Any host that runs Docker containers works (Render, Railway, Fly.io, Google Cloud Run, a VPS). Steps for **Render**:

1. [render.com](https://render.com) -> **New** -> **Web Service** -> connect your GitHub repo.
2. **Language:** Docker. **Root Directory:** `backend` (it contains the `Dockerfile`).
3. **Instance type:** pick one with **at least 2 GB of RAM** (video, OCR and offline Whisper need memory; set `LOCAL_WHISPER_MODEL=base` if you must go smaller) that is **always on**. Free plans with 512 MB, or plans that spin down when idle, will fail or kill running jobs.
4. **Environment variables** (the same names as `backend/.env`):

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key |
   | `GROQ_API_KEY` | your Groq key (optional but recommended) |
   | `OPENROUTER_API_KEY`, `GEMINI_API_KEY` | optional backups |
   | `CORS_ORIGINS` | leave for now; you set it in Part 3 |
   | `YTDLP_COOKIES_B64` | optional, see the YouTube note below |

5. **Health Check Path:** `/api/healthz`.
6. Deploy. When it is live, open `https://YOUR-BACKEND/api/health` and check `ok`, `supabase_configured`, `ffmpeg` and `schema_up_to_date` are all `true`. Keep that URL: it becomes `VITE_API_URL`.

Plain Docker on any machine: `docker build -t lectureleaf-backend backend` then `docker run -d -p 8000:8000 --env-file backend/.env lectureleaf-backend`. The container listens on `$PORT` (default 8000), runs a **single worker on purpose** (jobs run on in-process threads) and checks itself at `/api/healthz`.

### Part 2: deploy the frontend on Vercel

1. Push the repo to GitHub.
2. [vercel.com](https://vercel.com) -> **Add New...** -> **Project** -> import the repo.
3. Settings (the repo's `vercel.json` already sets these, so they should be pre-filled):
   - **Framework Preset:** Vite
   - **Root Directory:** `./` (the project root, not `backend`)
   - **Install Command:** `pnpm install --frozen-lockfile`, **Build Command:** `pnpm build`, **Output Directory:** `dist`
4. **Environment Variables** (add them for Production and Preview):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | the **anon** key (never the service_role key) |
   | `VITE_API_URL` | your backend URL from Part 1, starting with `https://`, no trailing slash |

5. **Deploy.** Vercel gives you an address like `https://your-project.vercel.app`.

`VITE_` variables are baked into the site when it is built, so after changing one you must **redeploy** (Deployments -> the latest -> Redeploy).

### Part 3: let the frontend talk to the backend

Back on the backend host, set:

```
CORS_ORIGINS=https://your-project.vercel.app
```

Add your custom domain too if you have one (comma-separated). To also allow Vercel's preview deployments set `CORS_ORIGIN_REGEX=https://.*\.vercel\.app`. Redeploy or restart the backend.

### Part 4: check it end to end

1. Open your Vercel address, create an account and sign in.
2. Process a **short** lecture (a few minutes long) first.
3. Open the library, preview the PDF, then generate a small quiz.

If something fails see [Troubleshooting](#troubleshooting). Optional extras: add a custom domain in Vercel -> Settings -> Domains; in Supabase -> Authentication -> URL Configuration set the Site URL to your Vercel address.

### No budget? Free hosting (lite mode)

A free host's 512 MB of memory is too small for everything, but **only OCR (reading slide text) is that hungry**. In my test the whole lecture job peaked at about **175 MB** in lite mode (and 550 to 600 MB with OCR on). So on a free plan, run the backend in *lite mode* by adding these environment variables:

| Variable | Value | What it does |
|---|---|---|
| `OCR_ENABLED` | `false` | skip reading slide text (~400 MB saved). Frames are still chosen, by sharpness and look, but not by how much text they hold |
| `LOCAL_WHISPER_MODEL` | `off` | no offline speech-to-text fallback (needs 500 MB+), so a `GROQ_API_KEY` is needed for transcripts |
| `VIDEO_MAX_HEIGHT` | `360` | smaller downloads and frames |
| `MAX_CONCURRENT_JOBS` | `1` | one lecture at a time |
| `MAX_DOWNLOAD_MB` | `300` | stay inside the small disk |
| `MAX_UPLOAD_MB` | `90` (default) | largest video a user can upload instead of a YouTube link; hosts in front of the server often cap request bodies near 100 MB |

On Render, choose the **Free** instance type and add those variables (everything else in Part 1 stays the same). What to expect on a free plan: the service **sleeps after about 15 minutes without visitors** and takes around a minute to wake, it has a **very slow CPU** (0.1), and **YouTube may block downloads** (see below), so treat it as a demo rather than something to rely on. Quizzes, the library and editing run fine in lite mode. For the full-quality experience, run it on your own computer or on a paid 2 GB host.

### Things to know before deploying

- **YouTube often blocks cloud servers.** Downloads that work on your laptop can fail from a hosting provider with "YouTube is temporarily blocking downloads from our server". It is the biggest deployment risk. Things that help: redeploy now and then to get the newest `yt-dlp`; give the backend your YouTube cookies (`YTDLP_COOKIES_B64`: export `cookies.txt` from a logged-in browser, then in PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt"))` and paste the result); or route downloads through a proxy (`YTDLP_PROXY`). Cookies carry your logged-in session: use a throwaway account, never commit them, and note that automated downloading may go against YouTube's terms. Even so, a hosted copy can still be blocked.
- **Cost:** Vercel Hobby, Supabase and the Groq, OpenRouter and Gemini free tiers cost nothing. The always-on backend is the one real cost (check your host's current pricing). Supabase's free storage is limited, and every lecture stores its images and PDF, so delete lectures you no longer need.
- **Search engines:** the site tells search engines not to index it (`.figma/make/site.json` sets `robots.index` to `false`). Change that if you want it public in search results.
- **One backend instance:** jobs and the queue live in that process's memory, so do not scale it to several instances. If it restarts mid-job, that job is marked failed and can be retried.
- **Data stays in Supabase**, so redeploying either part never loses lectures, quizzes or accounts.

## Using the app

1. **Sign up / sign in.** The whole app sits behind the login.
2. **Paste a lecture** on the home page and choose how it should be captured and formatted (capture sensitivity, minimum gap between captures, duplicate strictness, page density or maximum pages, PDF style and size, timestamps, key points, topic headings).
3. **Wait for processing.** A progress screen shows the steps. Length varies a lot with the video and your machine, so there is no fixed estimate.
4. **Results.** See the captured moments and the summary. Tick or untick pages, rename the lecture, preview, edit or download the PDF. The lecture is saved to your library automatically.
5. **Library.** Every saved lecture, newest first. **View PDF**, **Edit**, **Download**, **Quiz**, rename (pencil) and **Delete** (asks first).
6. **Edit.** Change a page's heading, key points (one per line) and your own note, or leave a page out of the PDF. Edits are saved as you go and the PDF is rebuilt the next time you view or download it, even in a later session.
7. **Generate Quiz** (top of the home page, the library and a lecture's results page): choose a lecture, set the quiz up, take it, review it. **My quizzes** keeps every quiz and its scores, and lets you retake or review.

## Configuration reference

Frontend (`.env`, in the project root):

| Variable | Meaning |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | the **anon** key (safe in a browser) |
| `VITE_API_URL` | where the backend runs, default `http://localhost:8000` |

Backend (`backend/.env`):

| Variable | Default | Meaning |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | required | the **service_role** key lives only here |
| `STORAGE_BUCKET` | `lectureleaf` | storage bucket name |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8443` | exact addresses the frontend is served from; in production, your Vercel address |
| `CORS_ORIGIN_REGEX` | none | also allow origins matching this pattern, e.g. `https://.*\.vercel\.app` for every Vercel preview |
| `GROQ_API_KEY` | none | fast transcription and notes, [console.groq.com/keys](https://console.groq.com/keys) |
| `GROQ_WHISPER_MODEL`, `GROQ_LLM_MODEL` | `whisper-large-v3-turbo`, `openai/gpt-oss-120b` | preferences only; the backend picks another available model if one is retired |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | none, `gemini-2.5-flash` | reads handwritten notes, [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_VISION_MODEL` | none | backup AI, [openrouter.ai/keys](https://openrouter.ai/keys) |
| `LOCAL_WHISPER_MODEL` | `auto` | offline transcription model: `tiny`, `base`, `small`, `medium`; `auto` = `small` up to 25 min, else `base`; `off` disables it (saves memory) |
| `OCR_ENABLED` | `true` | `false` skips reading slide text: lite mode for small hosts (see Deploy) |
| `LOCAL_ASR_MAX_MINUTES` | `90` | longest lecture transcribed offline |
| `VIDEO_MAX_HEIGHT` | `720` | download quality; higher = sharper slide text, bigger download |
| `OCR_BUDGET_S` | `240` | most seconds per lecture spent reading text off frames |
| `MAX_LECTURE_MINUTES` | `180` | longest lecture accepted |
| `MAX_JOB_MINUTES` | `45` | time budget for one lecture |
| `MAX_CONCURRENT_JOBS` | `2` | lectures processed at once |
| `MAX_ACTIVE_JOBS_PER_USER` | `2` | lectures (and quizzes) one person can have running at once |
| `YTDLP_COOKIES_FILE`, `YTDLP_COOKIES_B64`, `YTDLP_PROXY` | none | for when YouTube blocks downloads: cookies as a file or as base64 (easier on a host), or a proxy |

`.env` files are git-ignored. Never put the `service_role` key, or any AI key, in the frontend `.env`.

## AI providers and fallbacks

Anything that needs an AI model (writing notes, writing quizzes, marking written answers) tries providers in this order and moves on automatically:

1. **Groq**: fastest. If a model is rate limited the next Groq model is tried straight away (each model has its own limit).
2. **OpenRouter**: used when Groq is rate limited, too small for the request, down, or has no working key. It prefers well-known free models and avoids slow ones.
3. **Offline fallbacks**: plain notes picked from the transcript, basic quizzes, keyword marking. Always available.

Other services:

| Job | Used, in order |
|---|---|
| Speech to text | Groq Whisper, then offline `faster-whisper` on your CPU (translates Hindi-English and other languages to English) |
| Photos of notes | Gemini, then an OpenRouter vision model, then the built-in OCR (RapidOCR). You can always correct the text before a quiz is written |
| Reading slide text from the video | RapidOCR, always local |

Good to know:

- **Groq free tier** allows about **8,000 tokens per minute per model**. A second key from the *same* Groq account shares that limit, so it does not help. OpenRouter and the other Groq models do.
- **OpenRouter `:free` models** cost nothing but have small daily limits and get busy; adding credit removes most of that. OpenRouter cannot transcribe audio.
- **Gemini and free-tier privacy:** Google may use content sent on the free tier to improve its products, so do not upload private notes.
- `GET /api/health` shows the state of every provider.

## Quizzes in detail

- **Setup:** how many questions; types mixed randomly or counted per type; difficulty (easy, medium, hard, mixed); optional time limit (auto-submits at zero); your own notes as text and up to 4 photos (read automatically, shown in an editable box so you can fix mistakes); normal or strict mode.
- **Numericals** can be answered by **multiple choice**, by **typing the answer**, or by **writing the full working** (60% of the marks for the method, 40% for the final answer), or a mix. Answers are checked with real arithmetic, so `2^10` and `1,024` both work and small rounding differences are accepted.
- **Taking a quiz:** timer, question navigator, skip with a reason, progress saved automatically (a refresh resumes where you stopped), answers stay on the server until you submit.
- **Marking:** MCQ, MSQ (partial credit, wrong picks cancel right ones), fill in the blanks (small typos accepted) and numericals are marked exactly in code. Short and long answers are marked by the AI against a rubric made when the question was written, with keyword marking as the fallback.
- **Strict mode (the AI as invigilator):** you write your own rules, one per line, in plain language. When you submit, the AI reads each written answer against every rule, decides whether the rule applies, whether it was followed and, if not, how badly it was broken, and cuts marks accordingly. A broken rule costs up to **25%** of that question's marks (the AI picks how much), and **never more than 60%** in total per question. Rules apply to short answers, long answers and numericals answered with full working. Results show, for each answer, every rule with a tick or a cross, the marks cut and the reason, so you can learn from it. Word counts and required keywords are *counted by software* and given to the AI as facts it must respect, because AI models miscount; they are also shown live as you type. If no AI is available, only those counted rules are enforced and the rest are shown as "could not be checked".
- **Results:** score, what to revise by lecture page, why you skipped, breakdown by question type, and a full review (your answer, the correct one, marking, feedback, the page it came from). **Retake**, or **practise what I missed** to get a new quiz of just the questions you missed or skipped.

## Command cheat sheet

| Where | Command | What it does |
|---|---|---|
| project root | `pnpm install` | install frontend packages |
| project root | `pnpm dev` | start the frontend at http://localhost:8443 |
| project root | `pnpm build` | production build into `dist/` |
| project root | `pnpm preview` | serve the production build |
| project root | `pnpm format` | format the code |
| project root | `pnpm exec tsc --noEmit` | type-check the frontend |
| `backend/` | `python -m venv .venv` | create the Python environment (once) |
| `backend/` | `.venv\Scripts\activate` | activate it (every new terminal) |
| `backend/` | `pip install -r requirements.txt` | install backend packages |
| `backend/` | `pip install --no-deps -r requirements-ocr.txt` | install the OCR package |
| `backend/` | `uvicorn app.main:app --reload --port 8000` | start the backend |
| `backend/` | `pip install -U yt-dlp` | update the YouTube downloader (do this if downloads start failing) |
| browser | http://localhost:8000/api/health | check Supabase, ffmpeg, schema and every AI provider |
| browser | http://localhost:8000/api/healthz | instant liveness check (used by hosting platforms) |
| `backend/` | `docker build -t lectureleaf-backend .` | build the backend container |

## Troubleshooting

| Problem | What to do |
|---|---|
| **"Cannot reach the LectureLeaf server"** | The backend isn't running, or `VITE_API_URL` is wrong. Start it and check http://localhost:8000/api/health. |
| **Browser console shows CORS errors** | Add the address the frontend is served from (for example `http://localhost:8443`) to `CORS_ORIGINS` in `backend/.env` and restart the backend. |
| **Health says `schema_up_to_date: false`** or quiz pages say the database setup is missing | Run the latest `supabase/schema.sql` in the Supabase SQL Editor. |
| **Groq `invalid_key`** | The key is mistyped or revoked. Create a new one at console.groq.com/keys. A key left in your Windows environment variables does **not** override `backend/.env` (the file wins). The app still works without Groq, using the offline fallbacks and OpenRouter if set. |
| **Notes have no key points** | No AI provider was available, so plain notes were used (a notice says so on the Results page). Fix the key, or add an OpenRouter key as a backup. |
| **YouTube download fails with "blocking" / 403 / sign-in** | YouTube blocks some networks, especially cloud servers. Run `pip install -U yt-dlp`, wait and retry. Persistent: export cookies from a logged-in browser to `cookies.txt` and set `YTDLP_COOKIES_FILE`, and/or set `YTDLP_PROXY`. Never commit `cookies.txt` (it is git-ignored). |
| **First lecture without Groq is slow** | The offline Whisper model (about 250 MB for `small`) downloads on first use, then transcription runs on your CPU. |
| **`ffmpeg` not found** | Install it and make sure `ffmpeg -version` works in a new terminal. Without it audio can't be transcribed. |
| **Lecture processing is slow** | Reading slide text is the slow part on a laptop CPU (handwriting-heavy videos most of all). `OCR_BUDGET_S` caps it; `VIDEO_MAX_HEIGHT=480` makes downloads and frames lighter. |
| **A quiz is slow to write** | The free AI tiers are rate limited. The app switches models and providers automatically; adding an OpenRouter key or Groq's paid tier makes it steadier. |
| **Quiz photos read badly** | Use a flat page, even light and dark ink, or add a Gemini key. You can also fix the text in the box under each photo. |
| **"Email not confirmed"** | Sign in again: the app confirms older unconfirmed accounts automatically. |
| **Deployed site: "built without a server address"** | `VITE_API_URL` wasn't set when Vercel built the site. Add it in Vercel -> Settings -> Environment Variables, then **redeploy**. |
| **Deployed site: CORS error, or requests blocked** | The backend doesn't know your Vercel address. Set `CORS_ORIGINS` (and `VITE_API_URL` must start with `https://`: browsers block a secure site from calling plain `http://`). |
| **Deployed backend: jobs die or the service restarts** | Too little memory or a plan that sleeps. Use an always-on instance with 2 GB or more. |
| **Deployed: YouTube blocking downloads** | See "Things to know before deploying" above: cookies, a proxy, or an updated `yt-dlp`. |
| **Port already in use** | Set another port, for example `$env:PORT=9000; pnpm dev` (and add it to `CORS_ORIGINS`), or use `--port` for uvicorn. |

## Project layout

```
LectureLeaf/
├── README.md
├── package.json, vite.config.ts, tsconfig.json   frontend tooling (Vite, TypeScript)
├── vercel.json, .vercelignore                    Vercel build settings (frontend only)
├── .env.example                                  frontend settings template
├── supabase/schema.sql                           the whole database + storage setup
├── src/                                          the React app
│   ├── App.tsx                                   screen routing and shared state
│   ├── screens/                                  Landing, Login, Setup, Processing, Results, Edit, Preview, Library,
│   │                                             QuizSetup, QuizTake, QuizResults, Quizzes
│   ├── components/                               Nav, Logo, ErrorBoundary
│   └── lib/                                      api.ts (backend client), supabase.ts, download.ts
└── backend/
    ├── Dockerfile, .dockerignore                 container for hosting the backend
    ├── requirements.txt, requirements-ocr.txt, .env.example
    └── app/
        ├── main.py            API routes, startup checks, health
        ├── pipeline.py        lecture -> frames + notes + PDF
        ├── vision.py          choosing the frames (motion masking, best frame, duplicate merging)
        ├── ocr.py             reading text off frames (RapidOCR)
        ├── media.py           yt-dlp downloads, audio extraction
        ├── notes.py           transcription (Groq) and AI notes
        ├── notes_local.py     offline notes
        ├── local_asr.py       offline transcription (faster-whisper)
        ├── pdf.py             the four PDF styles
        ├── llm.py             one entry point for AI: Groq, then OpenRouter
        ├── groq.py, openrouter.py, gemini.py    provider clients
        ├── quiz_api.py        quiz endpoints
        ├── quiz_gen.py        writing and checking questions
        ├── quiz_grade.py      marking, and the strict-mode AI invigilator
        ├── quiz_schemas.py, schemas.py          request models
        ├── auth.py, db.py, config.py, errors.py, pool.py
```

The frontend is a Vite + React + Tailwind CSS v4 project (the Tailwind plugin is configured in `vite.config.ts`, there is no Tailwind or PostCSS config file; global CSS, fonts and theme go in `src/index.css`). It was scaffolded in Figma Make, which is why the dev server defaults to port 8443 and `vite.config.ts` contains Figma Make plugins.

## Security notes

- The **service_role** key and every AI key are **server-only**: they live in `backend/.env`, which is git-ignored. Only the Supabase URL and **anon** key go in the frontend.
- Each signed-in person only sees their own data: the database has row-level security and every backend route checks ownership.
- Quiz questions are sent to the browser **without** their answers, accepted answers, rubrics or explanations; those are revealed only after you submit.
- Lecture images and PDFs are in a **private** bucket and served through short-lived signed links or through the backend.
- Sign up creates already-confirmed accounts, so email addresses are **not verified**. That is fine for a personal project; add email verification before opening it to the public.
- If you ever use a `cookies.txt` for YouTube, keep it on your own machine only: it holds a logged-in session. It is git-ignored.

## Known limitations

- Frame picking works best on slide, screen and whiteboard lectures. Talking-head videos produce few useful frames.
- A whiteboard that is never erased gives one page with the finished board.
- Real handwriting in photos is hard for any OCR; Gemini helps a lot, and you can always correct the text.
- PDFs use built-in fonts that only cover Latin characters; other scripts in titles show as `?`.
- Hosted backends are often blocked by YouTube (see [Deploy](#deploy-it-vercel--a-backend-host)); it works most reliably when run on your own machine or network.
- Only YouTube links are accepted, up to `MAX_LECTURE_MINUTES` (180). Live streams and premieres are refused until they finish.
- Some Setup-page toggles (the "content types" chips) are not used by the backend yet.
- Offline-mode quizzes are basic: fill in the blank, multiple choice, short and long answer only.
- The repository has no automated test suite yet; use the health endpoint and try a short lecture to check a setup.
