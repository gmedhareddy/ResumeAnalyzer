# ResumeAI — Plain HTML/CSS/JS (no build step)

This is a pure HTML/CSS/JS version of the ResumeAI project — no
Tailwind, no React, no Next.js, no npm install, no build tool of any
kind. Open `index.html` directly, or serve the folder with any static
file server, and it runs.

This was converted from a React/Next.js version specifically because
Tailwind's `@tailwind`/`@apply` syntax was triggering CSS-language-server
warnings in VS Code. Plain CSS has no such issue — there's no build
tool here for anything to misconfigure.

## What's in this folder

```
index.html          ← ResumeAI landing + auth + dashboard shell (single file, 3 "pages")
style.css            ← plain CSS for the above (deep blue/cyan theme)
app.js               ← plain JS: session state, toasts, OTP auth flow, sidebar nav

portfolio-data.js    ← shared sample resume data, used by both portfolio templates below

portfolio-v1/        ← Portfolio Generator, "App Shell" style (tabs, teal→violet)
  index.html
  style.css
  app.js

portfolio-v2/        ← Portfolio Generator, "Editorial" style (scroll + side rail, amber→coral)
  index.html
  style.css
  app.js
```

## Running it

No install needed. Two options:

**Option A — just open the file**
Double-click `index.html` (or `portfolio-v1/index.html`, etc.) and it
opens in your browser. This works for everything except the portfolio
templates' relative `<script src="../portfolio-data.js">` reference in
some browsers' stricter `file://` security settings — if that script
fails to load (page looks unstyled with no resume data), use Option B
instead.

**Option B — serve it locally (recommended, avoids `file://` quirks)**
From this folder:
```bash
python3 -m http.server 8000
```
or, if you have Node:
```bash
npx serve .
```
Then visit `http://localhost:8000/`.

In VS Code specifically: install the **"Live Server"** extension, then
right-click `index.html` → "Open with Live Server". This is the
easiest way to run it directly from the editor.

## What each page does

- **`/` (index.html)** — Landing page. Click "Get Started Free" or
  "Sign In" to go to the auth flow (shown/hidden as a `<div>` on the
  same page, not a separate URL — open `index.html` and watch the page
  switch).
  - **Auth**: enter any name/email, click "Send OTP" — the 6-digit code
    is generated in your browser and shown directly on screen (no real
    email is sent; there's no backend here to send one). Enter that
    code and you're taken to the dashboard.
  - **Dashboard**: sidebar with all 13 nav items. Upload a real PDF,
    DOCX, or TXT resume and the full analysis engine runs:
    - **Real text extraction**: PDF.js for PDFs, Mammoth.js for DOCX,
      native FileReader for TXT (loaded from CDN — see "Internet
      access required" below)
    - **Real local analysis** (no AI API, no backend, runs entirely in
      your browser): name/email/phone extraction, keyword-based
      technical/soft-skill/tool/framework detection, ATS scoring,
      resume-strength scoring, skill-gap analysis vs. 10 job roles,
      problem detection, AI-suggestion-style rewrites, career roadmap,
      learning resources, YouTube recommendations, project
      recommendations, certificate recommendations, and an
      auto-generated portfolio preview
    - All 16 tabs populate with real data extracted from your actual
      resume — nothing here is hardcoded sample output once you
      upload a file
    - **Download buttons**: "Download HTML" (portfolio tab) and
      "Full Analysis Report" (download tab) generate and download
      real files built from your data, client-side, no server involved
- **`/portfolio-v1/`** — Auto-generated portfolio website, "app shell"
  style: tabbed nav (About/CV/Projects), glass cards, teal→violet.
  (Uses its own separate sample data in `portfolio-data.js` — not
  wired to the dashboard's live analysis yet.)
- **`/portfolio-v2/`** — Same data, "editorial" style: single
  continuous scroll page with a side-rail nav that highlights the
  active section as you scroll, amber→coral, serif body copy.

## If upload still doesn't do anything

If clicking "Choose File" or dropping a file does nothing at all (no
toast, no reaction whatsoever), open your browser's DevTools (press
F12) → Console tab, and look for red error text. The most likely
cause: this page loads PDF.js and Mammoth.js from
`cdnjs.cloudflare.com` in the `<head>`. If that domain is slow,
blocked by a firewall/ad-blocker, or you're offline, those scripts
could previously interfere with the rest of the page loading
correctly in some setups.

This version loads those two scripts with `defer`, which prevents
them from blocking the rest of the page even if they never load — and
I added a global error handler that shows a red toast with the actual
error message if anything else throws, instead of failing silently.
If you still see nothing at all (not even an error toast) when
clicking buttons, that's a strong signal `app.js` itself isn't
loading — check the Console for a 404 or network error on `app.js`,
and double-check you're serving the folder (Live Server /
`python3 -m http.server`) rather than opening `index.html` directly
via `file://`, since some browsers restrict local script loading
under `file://` more strictly than `http://`.

## Internet access required for full PDF/DOCX parsing

The resume parser loads PDF.js and Mammoth.js from a CDN
(`cdnjs.cloudflare.com`) via `<script>` tags in `index.html`. This
needs an internet connection. If you're fully offline:
- **TXT files** still work (no external library needed)
- **PDF/DOCX files** will fail to extract text, and the engine falls
  back to analyzing a placeholder string — you'll see "Could not
  extract text — showing sample analysis" and a mostly-empty result
- To work fully offline, you'd need to download `pdf.min.js` +
  `pdf.worker.min.js` (PDF.js) and `mammoth.browser.min.js` and
  reference them as local files instead of the CDN URLs in
  `index.html`'s `<head>`

Both portfolio templates render from `portfolio-data.js` — edit the
`samplePortfolio` object in that file to preview with different data.

## Notes on what's faithful vs. simplified

- **Faithful**: all landing page copy, the OTP-based auth flow
  (including the "demo mode" on-screen OTP display), the dashboard
  sidebar's full 13-item nav structure, both portfolio template
  designs, and — new — the **complete local analysis engine**: name
  extraction (including the email-prefix-to-name heuristic for emails
  like "gmedharavireddy" → "G. Medha Reddy"), keyword-based skill/tool/
  framework detection, ATS scoring formula, resume-strength scoring,
  the 10-role job-matching logic, problem detection rules, the
  roadmap template, resource/YouTube recommendation lists, project
  recommendation lists, certificate recommendations, and the
  downloadable portfolio HTML generator — all ported line-for-line
  from the original prototype's logic.
- **New in this version**: the visual theme (deep blue/cyan for the
  main app, replacing the original prototype's violet/green) — this
  was an intentional restyle, not an accident.
- **No backend, no AI API**: exactly like the original prototype, this
  is rule-based/heuristic analysis (keyword matching, regex, scoring
  formulas) — not a Claude/GPT API call. It's fast and free, but it's
  pattern-matching, not language understanding. A resume that doesn't
  use the exact keywords this engine looks for will score lower than
  its actual quality might deserve, and the "suggestions" are template
  text filled in with your detected skills, not bespoke AI-written
  advice.
- **Portfolio generator templates (v1/v2) are separate from the
  dashboard's live analysis** — they currently render from their own
  static sample data in `portfolio-data.js`, not from whatever resume
  you uploaded in the main app. Wiring the dashboard's extracted data
  into those templates is a reasonable next step if you want it.

## Verification

Every file in this folder was tested before delivery:
- HTML parsed and checked for unclosed/mismatched tags
- CSS checked for balanced braces
- JS checked for syntax errors (`node -c`)
- The full auth flow (landing → register → OTP → dashboard → sidebar
  nav click → logout) was run end-to-end against a real local HTTP
  server using a real DOM (jsdom), simulating actual clicks and
  reading the resulting page state.
- The analysis engine (`analyzeResume()`) was tested in isolation
  against realistic sample resume text and checked against concrete
  assertions (correct name/email extraction, sensible ATS score range,
  correct skill detection, job roles sorted by confidence, etc.) — all
  passed.
- The full pipeline — login → upload a resume → wait for analysis →
  check every one of the 16 tabs renders real extracted data → click
  through tab navigation via tab bar, sidebar, and feature cards →
  trigger both file downloads — was run end-to-end with a real DOM
  and a real (text) file upload. All checks passed.
- Both portfolio templates were rendered the same way and checked for
  correct content (name, experience, projects, skills, certifications)
  and, for v1, correct tab-switching behavior on click.

One thing I could **not** test in this environment: actually parsing a
real binary PDF or DOCX file, since that requires loading PDF.js/
Mammoth.js from a CDN my sandbox can't reach, and there's no headless
browser here for a true file-picker interaction either. I tested the
identical downstream pipeline (parsing → analysis → rendering) using
plain text instead, which exercises everything except the PDF.js/
Mammoth extraction step itself — that step is a straight, unmodified
port of the original prototype's working code, so it should behave the
same way it did there. If you hit an issue specifically with a PDF or
DOCX upload, that's the one piece I'd want to know about first.
