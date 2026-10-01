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
copy .env.example .env      # fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
```

The `service_role` key goes only in `backend/.env`. Never put it in the frontend `.env`.
