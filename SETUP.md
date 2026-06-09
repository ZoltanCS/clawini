# Gemini Chat - Vercel + Supabase Setup

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/gemini-chat&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,OPENROUTER_API_KEY)

## Environment Variables

A Vercel deploy során automatikusan kéri a következő környezeti változókat:

### 1. `NEXT_PUBLIC_SUPABASE_URL`
- **Honnan szerezd:** Supabase Dashboard → Settings → API → Project URL
- **Formátum:** `https://xxxxxx.supabase.co`

### 2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Honnan szerezd:** Supabase Dashboard → Settings → API → Project API keys → `anon/public`
- **Formátum:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 3. `OPENROUTER_API_KEY`
- **Honnan szerezd:** https://openrouter.ai/keys
- **Ingyenes kreditek:** Regisztráció után kapsz ingyen krediteket

## Supabase Beállítás

### 1. Projekt létrehozása
1. Menj a https://supabase.com-ra
2. Kattints "New Project"
3. Adj nevet a projektnek
4. Válassz jelszót a database-hez
5. Válassz régiót (ajánlott: `Central EU`)
6. Kattints "Create new project"

### 2. Database séma létrehozása
1. Menj a SQL Editor-ba
2. Másold be a `supabase/schema.sql` tartalmát
3. Futtasd le

### 3. Storage bucket létrehozása
1. Menj a Storage menübe
2. Kattints "New bucket"
3. Név: `chat-images`
4. Public bucket: ✅ Kipipálva
5. Kattints "Create bucket"

### 4. Authentication beállítás
1. Menj az Authentication menübe
2. Kattints az "Providers" fülre
3. Google OAuth beállítása:
   - Enabled: ✅
   - Client ID: Google Cloud Console-ból
   - Client Secret: Google Cloud Console-ból
   - Authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`

## Google OAuth Setup (opcionális)

1. Menj a https://console.cloud.google.com-ra
2. Hozz létre egy új projektet
3. API & Services → Credentials → Create Credentials → OAuth client ID
4. Application type: Web application
5. Authorized redirect URIs:
   - `https://your-project.supabase.co/auth/v1/callback`
6. Másold ki a Client ID-t és Client Secret-et
7. Illeszd be a Supabase Google Provider beállításaiba

## Fejlesztés

```bash
# Függőségek telepítése
npm install

# Környezeti változók beállítása
cp .env.example .env.local
# Töltsd ki a .env.local fájlt

# Fejlesztői szerver
npm run dev
```

## Funkciók

- ✅ **Bejelentkezés** - Email/jelszó és Google OAuth
- ✅ **Chat előzmények** - Valós adatbázisban tárolva
- ✅ **Kép feltöltés** - Képek küldése a chatben
- ✅ **Beállítások** - Téma, nyelv, értesítések
- ✅ **Realtime** - Élő üzenetek
- ✅ **Mobile-first** - Telefonra optimalizált

## Támogatott modellek

Alapértelmezetten: `google/gemini-3.1-flash-lite`

Más modellekhez módosítsd az `app/api/chat/route.ts` fájlt.
