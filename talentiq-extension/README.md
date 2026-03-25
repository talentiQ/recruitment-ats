# Talent IQ — CV Importer Chrome Extension

Adds a "Add to Talent IQ" button next to CV attachments in Gmail.
One click extracts the candidate, parses the CV, and lets you add them
directly to a job pipeline or the resume bank — without leaving Gmail.

---

## Setup (5 steps)

### 1. Download PDF.js and Mammoth.js libraries

You need two client-side parsing libraries. Download them into the `lib/` folder:

**pdf.min.js + pdf.worker.min.js**
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js

**mammoth.browser.min.js**
https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js

Save all three files into the `lib/` folder inside this extension directory.

### 2. Add your Supabase credentials

Open `sidebar.js` and update lines 5–6:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE'
```

Find these in: Supabase Dashboard → Settings → API

### 3. Add icons

Add PNG icons (any solid color, square):
- `icons/icon16.png`  — 16×16px
- `icons/icon48.png`  — 48×48px
- `icons/icon128.png` — 128×128px

You can use any simple icon or generate them at https://favicon.io

### 4. Add is_resume_bank column to candidates table

Run this in your Supabase SQL editor:

```sql
alter table candidates
  add column if not exists is_resume_bank boolean default false,
  add column if not exists source text default 'direct';
```

### 5. Load the extension in Chrome

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this folder (`talentiq-extension/`)
5. Extension is now active on Gmail ✓

---

## How it works

1. Open Gmail and find an email with a CV (PDF or Word) attached
2. A blue **"Add to Talent IQ"** button appears next to the attachment
3. Click it → sidebar opens → CV is parsed automatically
4. Review and edit the pre-filled candidate details
5. Choose destination:
   - **Specific job** → select from your open jobs → candidate added at `sourced` stage
   - **Resume bank** → saved without a job link for future use
6. Click submit → done ✓

---

## File structure

```
talentiq-extension/
├── manifest.json        — Extension config
├── content.js           — Injects button into Gmail, handles attachment fetch
├── sidebar.css          — Styles for the Gmail-injected button
├── sidebar.html         — The sidebar panel UI
├── sidebar.js           — CV parsing + form logic + Supabase submission
├── background.js        — Service worker (minimal)
├── lib/
│   ├── pdf.min.js           — PDF text extraction (download separately)
│   ├── pdf.worker.min.js    — PDF.js worker (download separately)
│   └── mammoth.browser.min.js — DOCX text extraction (download separately)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Supabase RLS note

The extension uses your `SUPABASE_ANON_KEY` which is subject to RLS.
Make sure your `candidates` table allows inserts from authenticated or anon users
as appropriate for your setup. If recruiters are logged in via Talent IQ,
their session token should be used instead of anon key for proper RLS.

To use the logged-in user's token, store it in `chrome.storage.local` after
login in your main app, and retrieve it in `sidebar.js` via:

```js
chrome.storage.local.get('supabase_token', ({ supabase_token }) => {
  // use supabase_token as Authorization header
})
```

---

## Known limitations

- Gmail's attachment download URLs require the user to be logged into Gmail in the same Chrome profile (which they always will be)
- CV parsing accuracy is ~70–80% for well-formatted PDFs; scanned image PDFs won't parse (no OCR)
- For scanned CVs, the form will open empty and the recruiter fills it manually
