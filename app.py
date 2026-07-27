"""
ResumeAI - Flask Backend
=========================
Serves the existing static frontend (unchanged) and exposes secure
server-side API endpoints that call AI providers (Claude / OpenAI / Gemini).

API keys are read from environment variables only. They are never sent to,
or exposed in, the browser/frontend.

Run locally:
    python app.py
"""

import os
import json
import logging

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests

# ─────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────

load_dotenv()  # loads variables from a local .env file if present

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)

# CORS is enabled for the /api/* routes. Since the frontend is served by
# this same Flask app, this is mainly useful if you ever host the frontend
# separately (e.g. a different domain) from the backend.
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("resumeai-backend")

# ─────────────────────────────────────────────────────────────
# API keys (server-side only — never exposed to the browser)
# ─────────────────────────────────────────────────────────────

CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Which provider to use by default. Falls back automatically to whichever
# key is actually configured if the preferred one is missing.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "claude").lower()

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")


class AIProviderError(Exception):
    """Raised when no AI provider is configured or a provider call fails."""


# ─────────────────────────────────────────────────────────────
# Unified AI call helper
# ─────────────────────────────────────────────────────────────

def _call_claude(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4) -> str:
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": CLAUDE_MODEL,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    parts = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(parts).strip()


def _call_openai(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4) -> str:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _call_gemini(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    resp = requests.post(
        url,
        json={
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def call_ai(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4) -> str:
    """
    Calls the configured AI provider and returns the raw text response.
    Tries the preferred provider first, then falls back to any other
    provider that has a key configured. Provider-agnostic: the same
    system_prompt/user_prompt work unchanged against Claude, OpenAI, or
    Gemini.
    """
    providers = {
        "claude": (CLAUDE_API_KEY, _call_claude),
        "openai": (OPENAI_API_KEY, _call_openai),
        "gemini": (GEMINI_API_KEY, _call_gemini),
    }

    order = [AI_PROVIDER] + [p for p in providers if p != AI_PROVIDER]
    last_error = None

    for name in order:
        key, fn = providers[name]
        if not key:
            continue
        try:
            return fn(system_prompt, user_prompt, max_tokens=max_tokens, temperature=temperature)
        except Exception as exc:  # noqa: BLE001
            logger.warning("AI provider '%s' failed: %s", name, exc)
            last_error = exc

    if last_error:
        raise AIProviderError(f"All configured AI providers failed: {last_error}")
    raise AIProviderError(
        "No AI provider is configured. Set CLAUDE_API_KEY, OPENAI_API_KEY, "
        "or GEMINI_API_KEY as an environment variable."
    )


def extract_json(text: str):
    """Best-effort extraction of a JSON object from a model's text reply."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in AI response")
    return json.loads(text[start:end + 1])


# ─────────────────────────────────────────────────────────────
# API routes
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# Resume analysis: prompt engineering + schema normalization
# ─────────────────────────────────────────────────────────────

# This schema mirrors exactly what the existing frontend (app.js → renderAll)
# already expects, so no frontend code needs to change. A few extra fields
# requested for completeness (salary range, interview prep, 30/60/90 plan,
# etc.) are appended at the top level; the frontend simply ignores keys it
# doesn't render.
ANALYZE_SYSTEM_PROMPT = """You are simultaneously an experienced ATS (Applicant Tracking System) \
recruiter, a senior technical hiring manager, and a career coach with 15+ years across software, \
data, and product roles. You are reviewing ONE real candidate's resume text.

YOUR MOST IMPORTANT RULE: every single output must be derived strictly from what is actually \
written in the resume text you are given. Two different resumes must NEVER receive the same \
output. If you find yourself writing something generic enough to apply to any resume ("improve \
communication skills", "learn Python", "add more projects", "improve formatting") — STOP. That is \
a signal you have not looked closely enough at the actual content. Re-read the resume and produce \
something that could only be true for THIS candidate.

STRICT RULES:
1. Never hallucinate facts, companies, numbers, or skills that are not present or reasonably \
   inferable from the resume text.
2. Never use generic, templated, or boilerplate phrasing that could apply to any resume.
3. Never repeat the same recommendation in two different sections.
4. Base every recommendation strictly on the extracted content of THIS resume.
5. If a skill/technology is already present on the resume, NEVER recommend "learning" it again — \
   only recommend skills that are genuinely missing.
6. Only recommend missing technologies that logically complement the candidate's current stack \
   and target role (e.g. someone with Python + SQL + Power BI should be pointed toward Tableau, \
   statistics, and dashboarding — not toward Java or DevOps, which don't fit their profile).
7. Vary tone, wording and structure across resumes — do not fall into a fixed template.
8. Respond with ONLY one raw JSON object. No markdown code fences, no commentary before or after.

STEP 1 — EXTRACT (use these to inform every later field, don't just repeat them back):
Candidate Name, Education, CGPA, Degree, College, Skills, Programming Languages, Frameworks, \
Databases, Projects, Certifications, Internships, Experience, Achievements, Soft Skills, Missing \
Skills (relative to the candidate's own apparent target field), Target Role (best inferred role).

STEP 2 — SCORE the ATS compatibility (0-100) using this rubric, adjusted by judgment based on \
actual content quality (do not just add fixed points mechanically — reward genuinely strong, \
specific, well-quantified resumes and penalize vague, sparse ones):
- Contact info present (email/phone): up to 10
- Clear skills section with relevant, specific technologies: up to 20
- Quantified achievements (numbers, %, metrics): up to 15
- Relevant, well-described projects: up to 15
- Professional summary/objective: up to 10
- Certifications relevant to target role: up to 10
- Structure/formatting signals (bullets, links, consistent sections): up to 10
- Overall keyword alignment with the candidate's apparent target role: up to 10

STEP 3 — GENERATE personalized output. Respond with EXACTLY this JSON shape (fill every field; \
use empty arrays/strings only where the resume truly gives you nothing to work with — never fill \
with placeholder text):

{
  "parsed": {
    "name": "", "email": "", "phone": "", "cgpa": "", "degree": "", "college": "",
    "target_role": "",
    "skills": [], "programming_languages": [], "frameworks": [], "databases": [],
    "internships": [], "achievements": [], "soft_skills": [],
    "education": [{"degree": "", "institution": "", "year": ""}],
    "experience": [{"title": "", "company": "", "duration": "", "description": ""}],
    "projects": [{"name": "", "description": "", "tech": []}],
    "certifications": []
  },
  "ats": {
    "score": 0, "grade": "A+|A|B+|B|C+|C",
    "suggestions": ["4 suggestions specific to THIS resume's actual gaps"],
    "compatibility_report": "2-3 sentences citing this resume's real content, score, and reasoning"
  },
  "strength": {
    "score": 0,
    "sections": {"summary": 0, "experience": 0, "skills": 0, "education": 0, "projects": 0, "certifications": 0}
  },
  "skills": {"technical": [], "soft": [], "tools": [], "frameworks": []},
  "skill_gap": {
    "missing": ["skills that genuinely complement this candidate's existing stack/target role"],
    "priority": ["top 3 of the above, ranked"],
    "industry_comparison": "1-2 sentences comparing this candidate's real skill set to their target role's typical requirements"
  },
  "problems": [
    {"icon": "emoji", "title": "specific problem found in THIS resume", "impact": "why it matters", "solution": "concrete fix"}
  ],
  "suggestions": [
    {"type": "Professional Summary", "original": "what this resume currently has (or '[missing]')", "improved": "a rewritten version using this candidate's real skills/experience"},
    {"type": "Experience Bullet — Before/After", "original": "an actual or representative weak bullet from this resume", "improved": "quantified rewrite using this candidate's real stack"},
    {"type": "Skills Section Format", "original": "this resume's current skills listing", "improved": "a better-organized version grouped by category using this candidate's REAL skills"}
  ],
  "job_roles": [
    {"title": "role name", "icon": "emoji", "confidence": 0, "description": "which of this candidate's actual skills match"}
  ],
  "career_guidance": {
    "recommendations": ["specific next steps derived from this exact resume's gaps and strengths"],
    "industries": ["industries that fit this candidate's actual stack"],
    "growth_opportunities": ["realistic next-role progression for this candidate"]
  },
  "roadmap": [
    {"period": "Month 1-2", "title": "", "items": ["specific to this candidate's real gaps"]},
    {"period": "Month 3-4", "title": "", "items": []},
    {"period": "Month 5-6", "title": "", "items": []},
    {"period": "Month 7-12", "title": "", "items": []}
  ],
  "resources": [
    {"icon": "emoji", "skill": "a skill this candidate is actually missing", "desc": "", "links": [{"name": "", "url": ""}]}
  ],
  "youtube": [
    {"skill": "video title relevant to a real gap", "channel": "", "url": "https://www.youtube.com/...", "thumb": "emoji", "duration": ""}
  ],
  "projects": {
    "beginner": [{"title": "", "desc": "", "skills": []}],
    "intermediate": [{"title": "", "desc": "", "skills": []}],
    "advanced": [{"title": "", "desc": "", "skills": []}]
  },
  "certifications": [
    {"icon": "emoji", "name": "cert relevant to this candidate's gaps/target role", "provider": "", "cost": "", "duration": ""}
  ],
  "portfolio": {"name": "", "title": "target role", "summary": "2-3 sentences using this candidate's real stack and experience", "email": "", "github": "", "linkedin": ""},

  "resume_summary": "3-4 sentence recruiter-style summary of THIS candidate",
  "technical_skills_analysis": "assessment of depth/breadth of this candidate's real technical skills",
  "soft_skills_analysis": "assessment based on any soft-skill evidence actually found in the resume",
  "industry_readiness_score": 0,
  "interview_prep": ["topics to prepare, specific to this candidate's target role and stack"],
  "salary_range": {"role": "", "range": "", "currency": "USD", "note": "basis for the estimate"},
  "career_plan_30_60_90": {"day_30": [], "day_60": [], "day_90": []}
}

All array fields with example lengths above are minimums — provide 3-5 items where the schema \
shows a list, except "problems" (2-5) and "job_roles" (3-5). Every string must be specific to this \
resume. Output ONLY the JSON object."""


def _clamp_score(value, default=50):
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(0, min(100, n))


def normalize_analysis(result: dict) -> dict:
    """
    Defensively fills in any top-level keys the model might have omitted so
    the existing frontend (which already reads most fields defensively with
    `?.` / `|| []`) never breaks, without altering the AI-generated content
    that IS present.
    """
    if not isinstance(result, dict):
        result = {}

    defaults = {
        "parsed": {}, "ats": {}, "strength": {}, "skills": {}, "skill_gap": {},
        "problems": [], "suggestions": [], "job_roles": [], "career_guidance": {},
        "roadmap": [], "resources": [], "youtube": [],
        "projects": {"beginner": [], "intermediate": [], "advanced": []},
        "certifications": [], "portfolio": {},
    }
    for key, default in defaults.items():
        result.setdefault(key, default)

    if isinstance(result.get("ats"), dict):
        result["ats"]["score"] = _clamp_score(result["ats"].get("score"))
    if isinstance(result.get("strength"), dict):
        result["strength"]["score"] = _clamp_score(result["strength"].get("score"))

    return result


# ─────────────────────────────────────────────────────────────
# API routes
# ─────────────────────────────────────────────────────────────

@app.route("/api/analyze-resume", methods=["POST"])
def analyze_resume():
    body = request.get_json(silent=True) or {}
    resume_text = (body.get("text") or "").strip()

    if not resume_text:
        return jsonify({"error": "Field 'text' (resume content) is required."}), 400

    # Guard against runaway token usage on huge uploads while keeping
    # enough content for genuinely personalized extraction.
    truncated_text = resume_text[:14000]

    user_prompt = (
        "Analyze this resume and return the JSON object described in your "
        "instructions. Resume text follows, verbatim, between the markers:\n"
        "-----RESUME START-----\n"
        f"{truncated_text}\n"
        "-----RESUME END-----"
    )

    def _run_analysis(extra_note: str = "") -> dict:
        prompt = user_prompt if not extra_note else f"{user_prompt}\n\n{extra_note}"
        raw = call_ai(ANALYZE_SYSTEM_PROMPT, prompt, max_tokens=4096, temperature=0.55)
        return extract_json(raw)

    try:
        try:
            result = _run_analysis()
        except (ValueError, json.JSONDecodeError):
            # One repair attempt: ask the model to strictly re-emit valid JSON.
            result = _run_analysis(
                "Your previous response was not valid JSON. Respond again with "
                "ONLY the raw JSON object, no markdown fences, no commentary."
            )
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("analyze-resume failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(normalize_analysis(result)), 200


@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    history = body.get("history") or []

    if not message:
        return jsonify({"error": "Field 'message' is required."}), 400

    system_prompt = (
        "You are ResumeAI's helpful career assistant. Answer clearly and "
        "concisely, focused on resumes, job search, and career growth."
    )

    convo_lines = []
    for turn in history[-10:]:
        role = "User" if turn.get("role") == "user" else "Assistant"
        convo_lines.append(f"{role}: {turn.get('content', '')}")
    convo_lines.append(f"User: {message}")
    user_prompt = "\n".join(convo_lines)

    try:
        reply = call_ai(system_prompt, user_prompt)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify({"reply": reply}), 200


@app.route("/api/generate-roadmap", methods=["POST"])
def generate_roadmap():
    body = request.get_json(silent=True) or {}
    current_skills = body.get("currentSkills") or []
    target_role = (body.get("targetRole") or "").strip()

    if not target_role:
        return jsonify({"error": "Field 'targetRole' is required."}), 400

    system_prompt = (
        "You are a career roadmap planning assistant. Respond with ONLY a "
        "valid JSON object (no markdown, no commentary) with fields: "
        "stages (array of objects each with 'title', 'duration', "
        "'skillsToLearn' array, and 'milestones' array), certifications "
        "(array of strings), estimatedTimelineMonths (integer)."
    )
    user_prompt = (
        f"Target role: {target_role}\n"
        f"Current skills: {', '.join(current_skills) if current_skills else 'none listed'}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt)
        result = extract_json(raw)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("generate-roadmap failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(result), 200


@app.route("/api/project-suggestions", methods=["POST"])
def project_suggestions():
    body = request.get_json(silent=True) or {}
    skills = body.get("skills") or []
    role = (body.get("targetRole") or "").strip()

    if not skills and not role:
        return jsonify({"error": "Provide 'skills' and/or 'targetRole'."}), 400

    system_prompt = (
        "You are a project-idea generator for job seekers building a "
        "portfolio. Respond with ONLY a valid JSON object (no markdown, no "
        "commentary) with field 'projects': an array of objects each with "
        "'title', 'description', and 'skills' (array of strings). Suggest "
        "3-5 projects."
    )
    user_prompt = (
        f"Target role: {role or 'not specified'}\n"
        f"Known skills: {', '.join(skills) if skills else 'not specified'}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt)
        result = extract_json(raw)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("project-suggestions failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(result), 200


# ─────────────────────────────────────────────────────────────
# Static frontend (unchanged files) + health check
# ─────────────────────────────────────────────────────────────

@app.route("/healthz")
def healthz():
    return jsonify({
        "status": "ok",
        "providers_configured": {
            "claude": bool(CLAUDE_API_KEY),
            "openai": bool(OPENAI_API_KEY),
            "gemini": bool(GEMINI_API_KEY),
        },
    })


@app.route("/")
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    """
    Serves every existing static file (css, js, the portfolio/ folder,
    images, etc.) exactly as before, with no changes to file names or
    folder structure. Directory requests (e.g. /portfolio/) resolve to
    that folder's own index.html. Unknown paths fall back to the site's
    root index.html so any client-side page routing keeps working.
    """
    full_path = os.path.join(BASE_DIR, path)

    if os.path.isfile(full_path):
        return send_from_directory(BASE_DIR, path)

    if os.path.isdir(full_path) and os.path.isfile(os.path.join(full_path, "index.html")):
        return send_from_directory(full_path, "index.html")

    return send_from_directory(BASE_DIR, "index.html")


# ─────────────────────────────────────────────────────────────
# Error handlers
# ─────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
