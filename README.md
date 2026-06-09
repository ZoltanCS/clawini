# Gemini Chat

Egy egyszerű, intuitív, mobilra optimalizált chatbot a Gemini Flash Lite modellel, OpenRouter API-n keresztül. **Most már valós adatbázissal és autentikációval!**

## ✨ Új Funkciók

- 🔐 **Bejelentkezés** - Email/jelszó vagy Google OAuth
- 💾 **Valós adatbázis** - Supabase PostgreSQL adatbázis
- 🖼️ **Kép feltöltés** - Küldj képeket a chatben
- ⚙️ **Beállítások** - Téma, nyelv, értesítések kezelése
- 🔄 **Realtime** - Élő üzenetek és chat előzmények
- 📱 **Mobile-first** - Telefonra optimalizált

## 🚀 Gyors Deploy (Vercel)

1. **Kattints a Deploy gombra:**
   
   Vagy manuálisan:
   
   ```bash
   # 1. Forkold vagy klónozd a repót
   git clone <repo-url>
   cd chatbot-app
   
   # 2. Pushold GitHub-ra
   git push origin main
   
   # 3. Importáld Vercel-be
   # A Vercel automatikusan kérni fogja a környezeti változókat
   ```

2. **A Vercel bekéri ezeket az adatokat:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
   - `OPENROUTER_API_KEY`

   Lásd: [SETUP.md](./SETUP.md)

## 📋 Előkészületek

### 1. Supabase Fiók
- Regisztrálj: https://supabase.com
- Hozz létre egy új projektet
- Futtasd le a `supabase/schema.sql` fájlt az SQL Editorban

### 2. OpenRouter API Kulcs
- Regisztrálj: https://openrouter.ai
- Szerezz API kulcsot a https://openrouter.ai/keys oldalon
- Ingyenes kreditek járnak regisztráció után!

### 3. Google OAuth (opcionális)
- Google Cloud Console: https://console.cloud.google.com
- Hozz létre OAuth 2.0 credentials-t
- Konfiguráld a Supabase Authentication → Providers → Google részben

## 💻 Fejlesztés

```bash
# 1. Függőségek telepítése
npm install

# 2. Környezeti változók másolása
cp .env.example .env.local

# 3. Töltsd ki a .env.local fájlt:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# OPENROUTER_API_KEY=your-openrouter-key

# 4. Fejlesztői szerver indítása
npm run dev

# 5. Nyisd meg: http://localhost:3000
```

## 🗄️ Adatbázis Séma

A `supabase/schema.sql` fájl tartalmazza:
- `chats` tábla - beszélgetések
- `messages` tábla - üzenetek
- `profiles` tábla - felhasználói beállítások
- Storage bucket - képek tárolása
- Row Level Security (RLS) szabályok

## 🎨 UI Elemek

- **Gemini-stílusú design** - Világos, minimalista felület
- **Bal oldali sidebar** - Chat előzmények, beállítások
- **Középső terület** - Üzenetek
- **Alsó input** - Kép feltöltéssel
- **Beállítások modal** - Téma, nyelv, fiók kezelés

## 🔒 Biztonság

- **Row Level Security (RLS)** - Minden felhasználó csak a saját adatait látja
- **Auth middleware** - Védett API végpontok
- **Secure storage** - Képek csak a feltöltő által elérhetőek

## 📝 API Endpoints

- `POST /api/chat` - Üzenet küldés az OpenRouter-nek
- `GET /auth/callback` - OAuth callback kezelés

## 🛠️ Technológiák

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (Email + OAuth)
- **Storage:** Supabase Storage
- **AI:** OpenRouter API (Google Gemini Flash Lite)
- **Deploy:** Vercel

## 📱 Reszponzív

- **Mobil:** 100% optimalizált, érintésbarát UI
- **Tablet:** Adaptív layout
- **Desktop:** Teljes funkcionalitás, széles nézet

## 🤝 Támogatás

Ha bármi probléma adódik:
1. Ellenőrizd a környezeti változókat
2. Nézd meg a Supabase Logs-ot
3. Ellenőrizd az OpenRouter API kulcsot

## 📄 Licence

MIT License - szabadon használható és módosítható!

---

**Készült ❤️-vel Magyarországon**
