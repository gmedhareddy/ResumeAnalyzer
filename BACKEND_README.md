# ResumeAI — Flask Backend

This adds a minimal Flask backend to the existing static ResumeAI frontend.
**No HTML, CSS, JS, images, or folder structure were changed.** The backend
only serves the existing files and adds secure `/api/*` endpoints for AI
calls, so API keys never reach the browser.

## What was added (nothing else touched)

```
resumeai-static-fixed/
├── app.py              ← NEW: Flask server
├── requirements.txt    ← NEW
├── .env.example         ← NEW
├── BACKEND_README.md    ← NEW (this file)
├── index.html            (unchanged)
├── app.js                (unchanged)
├── style.css              (unchanged)
├── portfolio-data.js      (unchanged)
├── portfolio-v1/           (unchanged)
└── portfolio-v2/           (unchanged)
```

> Note: The current `app.js` performs resume scoring locally in the browser
> (`analyzeResume()`), so there were no direct AI-provider calls in the
> frontend to "move." The endpoints below are ready to use as-is — call
> them from `app.js` with `fetch("/api/...")` whenever you want to swap in
> real AI-generated results instead of, or alongside, the local analyzer.
> Because nothing currently calls these routes, the app keeps working
> exactly as it did before.

## Endpoints

All endpoints are `POST`, accept/return JSON, and read API keys only from
environment variables on the server.

| Endpoint | Body | Description |
|---|---|---|
| `POST /api/analyze-resume` | `{ "text": "<resume text>" }` | Returns ATS score, strengths, weaknesses, missing skills, predicted roles |
| `POST /api/chat` | `{ "message": "...", "history": [...] }` | Career-assistant chat reply |
| `POST /api/generate-roadmap` | `{ "targetRole": "...", "currentSkills": [...] }` | Returns a learning roadmap |
| `POST /api/project-suggestions` | `{ "skills": [...], "targetRole": "..." }` | Returns portfolio project ideas |
| `GET /healthz` | — | Health check + which providers are configured |

Example frontend call (add wherever you want AI-backed results):

```js
const res = await fetch('/api/analyze-resume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: resumeText })
});
const data = await res.json();
```

## Run locally

```bash
cd resumeai-static-fixed
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# then edit .env and add at least one of:
#   CLAUDE_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY

python app.py
```

Visit `http://localhost:5000` — the existing frontend loads exactly as
before, now served by Flask.

## Deployment

### Render
1. Push the repo to GitHub.
2. New → Web Service → connect the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Add environment variables (`CLAUDE_API_KEY`, etc.) in the Render dashboard.

### Railway
1. New Project → Deploy from GitHub repo.
2. Railway auto-detects Python. Set the start command to `gunicorn app:app`
   (Settings → Deploy).
3. Add environment variables under Variables.

### Azure App Service
1. `az webapp up --runtime PYTHON:3.11 --name <app-name>` (or use the portal
   to create a Python 3.11 Web App and deploy via GitHub Actions/Zip Deploy).
2. Set `Startup Command` to: `gunicorn --bind=0.0.0.0 --timeout 600 app:app`
3. Add environment variables under Configuration → Application settings.

### PythonAnywhere
1. Upload the project (or `git clone` it) into your PythonAnywhere account.
2. Create a virtualenv and `pip install -r requirements.txt` inside it.
3. Web tab → Add a new web app → Manual configuration → Python 3.11.
4. Point the WSGI file to import `app` from `app.py` (`from app import app as application`).
5. Set environment variables in the WSGI config file or the Web tab's
   "Environment variables" section.

## Security notes

- API keys are read via `os.environ` / `python-dotenv` on the server only.
- `.env` is never sent to the browser and should be added to `.gitignore`.
- `flask-cors` is scoped to `/api/*` only.
- All AI endpoints validate input and wrap provider calls in error handling,
  returning clean JSON errors (never raw stack traces) to the client.

## GitHub commit instructions

```bash
git init                      # skip if already a repo
echo ".env" >> .gitignore
echo "venv/" >> .gitignore
echo "__pycache__/" >> .gitignore

git add .
git commit -m "Add Flask backend with secure AI API endpoints"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Never commit your real `.env` file — only `.env.example` should be in
version control.
