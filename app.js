/* ══════════════════════════════════════════
   ResumeAI — Plain JS (no build step)
   Ports the session/toast/auth/dashboard logic
   from the Next.js version back to vanilla JS.
   ══════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

/* ── Global error visibility ──────────────────────────────────────
   If anything throws (a missing element, a CDN script that never
   loaded, a typo) it normally fails silently in the browser console
   and just looks like "nothing happened" to the user. Surface it as
   a toast instead so a broken state is visibly broken, not silently
   broken. Open DevTools (F12) → Console for the full stack trace. */
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error || e.message);
  try {
    toast('⚠️ Something broke: ' + (e.message || 'unknown error') + ' — check browser console (F12) for details.', 'err');
  } catch (_) { /* toast itself may not be defined yet this early */ }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  try {
    toast('⚠️ Something broke: ' + (e.reason?.message || e.reason || 'unknown error') + ' — check browser console (F12) for details.', 'err');
  } catch (_) {}
});

/* ── Session state (replaces React context) ── */
const S = { user: null, txt: '', data: null, pfTemplate: 't1' };

/* ── Toast ── */
function toast(msg, type = 'ok') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const d = document.createElement('div');
  d.className = 'toast ' + type;
  d.innerHTML = `<span>${type === 'ok' ? '✅' : '❌'}</span><span>${msg}</span>`;
  document.body.appendChild(d);
  setTimeout(() => { try { d.remove(); } catch (e) {} }, 4500);
}

/* ── Pages ── */
function showPage(id) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}
function gotoAuth(mode) {
  showPage('ap');
  switchAuth(mode);
}

/* ── Auth ── */
function switchAuth(mode) {
  ['s-login', 's-register'].forEach((id) => $(id).classList.remove('active'));
  $('s-' + mode).classList.add('active');
}

function signInUser(email, name) {
  S.user = {
    email: email.trim(),
    name: (name && name.trim()) ? name.trim() : email.split('@')[0],
  };
  $('av-t').textContent = S.user.name[0].toUpperCase();
  $('u-n').textContent = S.user.name;
  $('u-e').textContent = S.user.email;
  showPage('dp');
  toast('Welcome to ResumeAI! 🎉', 'ok');
}

function doLogin() {
  const email = ($('l-email')?.value || '').trim();
  if (!email) { toast('Please enter your email.', 'err'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Please enter a valid email.', 'err'); return; }
  signInUser(email);
}

function doRegister() {
  const name = ($('r-name')?.value || '').trim();
  const email = ($('r-email')?.value || '').trim();
  if (!email) { toast('Please enter your email.', 'err'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Please enter a valid email.', 'err'); return; }
  signInUser(email, name);
}

function doLogout() {
  S.user = null;
  S.txt = '';
  S.data = null;
  resetUIAfterLogout();
  resetAuthUI();
  showPage('lp');
  toast('Logged out.', 'ok');
}

function resetAuthUI() {
  // Resets the auth forms back to their initial state.
  ['l-email', 'r-name', 'r-email'].forEach((id) => {
    const el = $(id);
    if (el) el.value = '';
  });
  switchAuth('login');
}

/* ── Name formatting helper ──────────────────────────────────────
   Used as the fallback (Strategy 3) when no clear "Name" line or
   "Name: XYZ" label is found on the resume, so we derive a readable
   name from the email username instead (e.g. "gmedharavireddy" ->
   "G. Medha Reddy"). Best-effort: recognizes a small set of common
   name fragments and falls back gracefully otherwise. */
const NAME_FRAGMENTS = ['medha','reddy','sharma','kumar','singh','patel','gupta','khan','iyer',
  'nair','verma','mehta','joshi','desai','pillai','menon','naidu','chowdary','chowdhury',
  'bhatt','nayak','panda','mishra','tiwari','yadav','chauhan','rathi','agarwal','bansal',
  'varma','prasad','priya','divya','pooja','kavya','sneha','rajesh','suresh','mahesh',
  'naresh','kiran','aravind','arvind','vikram','vivek','rahul','rohit','sumit','ankit',
  'deepak','pradeep','sandeep','gopal','krishna','venkat','john','smith','james','michael',
  'david','robert','mary','jennifer','linda','sarah','emily','jessica','daniel','william'];
const NAME_FRAGSET = new Set(NAME_FRAGMENTS);
const NAME_OVERRIDES = { 'gmedharavireddy': 'G. Medha Reddy' };
function nameBestSplit(s) {
  if (s.length === 0) return [];
  if (NAME_FRAGSET.has(s)) return [{ text: s, known: true }];
  let best = null;
  for (const frag of [...NAME_FRAGSET].sort((a, b) => b.length - a.length)) {
    const idx = s.indexOf(frag);
    if (idx !== -1) { best = { frag, start: idx }; break; }
  }
  if (!best) return [{ text: s, known: false }];
  const before = s.slice(0, best.start), after = s.slice(best.start + best.frag.length);
  return [...nameBestSplit(before), { text: best.frag, known: true }, ...nameBestSplit(after)];
}
function formatNameFromEmailPrefix(prefix) {
  const lower = (prefix || '').toLowerCase();
  if (!lower) return '';
  if (NAME_OVERRIDES[lower]) return NAME_OVERRIDES[lower];
  let parts = nameBestSplit(lower).filter((p) => p.text.length > 0);
  const out = [];
  for (let idx = 0; idx < parts.length; idx++) {
    const p = parts[idx];
    if (p.known) { out.push({ ...p }); continue; }
    if (idx === 0 && p.text.length <= 2 && parts[idx + 1]) { out.push({ ...p }); continue; }
    const next = parts[idx + 1];
    if (next && next.known) { parts[idx + 1] = { ...next, text: p.text + next.text }; continue; }
    if (out.length > 0) { out[out.length - 1].text += p.text; continue; }
    out.push({ ...p });
  }
  return out.map((p) => (p.text.length === 1 ? p.text.toUpperCase() + '.' : p.text.charAt(0).toUpperCase() + p.text.slice(1))).join(' ');
}

/* ── small helpers ── */
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── File upload — real reading, PDF/DOCX/TXT ── */
function triggerFile() {
  const fi = $('fi');
  if (fi) { fi.value = ''; fi.click(); }
}

function onFileChange(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  processFile(file);
}

async function processFile(file) {
  const nm = file.name.toLowerCase();
  const isPDF = nm.endsWith('.pdf');
  const isDOCX = nm.endsWith('.docx');
  const isTXT = nm.endsWith('.txt') || file.type === 'text/plain';
  if (!isPDF && !isDOCX && !isTXT) {
    toast('❌ Please upload a PDF, DOCX, or TXT file.', 'err');
    return;
  }
  $('fb-n').textContent = file.name;
  $('fb-s').textContent = (file.size / 1024).toFixed(1) + ' KB';
  $('fbar').classList.add('on');
  toast(`📄 Reading "${file.name}"…`, 'ok');

  // PDF.js / Mammoth load from a CDN with `defer`, so on a slow connection
  // they might not be ready the instant a file is dropped. Give them a
  // moment before declaring them missing, rather than failing immediately.
  if (isPDF && !window['pdfjs-dist/build/pdf']) await waitForGlobal(() => window['pdfjs-dist/build/pdf'], 4000);
  if (isDOCX && !window.mammoth) await waitForGlobal(() => window.mammoth, 4000);

  let text = '';
  let libMissing = false;
  try {
    if (isPDF) {
      if (!window['pdfjs-dist/build/pdf']) { libMissing = true; } else { text = await readPDF(file); }
    } else if (isDOCX) {
      if (!window.mammoth) { libMissing = true; } else { text = await readDOCX(file); }
    } else {
      text = await readTXT(file);
    }
  } catch (err) {
    console.warn('Read error:', err);
    text = '';
  }

  if (libMissing) {
    toast(
      `⚠️ Couldn't load the ${isPDF ? 'PDF' : 'DOCX'} reader library (cdnjs.cloudflare.com unreachable — check your internet connection or network/firewall settings). Try a .txt file, or fix connectivity and reload.`,
      'err'
    );
    text = '[Resume: ' + file.name + ']';
  } else if (!text || text.trim().length < 10) {
    text = '[Resume: ' + file.name + ']';
    toast('⚠️ Could not extract readable text from this file — showing placeholder analysis. Try a different file or a .txt export.', 'ok');
  }
  S.txt = text;
  startAnalysis();
}

function waitForGlobal(check, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (check() || Date.now() - start > timeoutMs) {
        clearInterval(iv);
        resolve();
      }
    }, 150);
  });
}

/* ── PDF reader (uses PDF.js, loaded via CDN in index.html) ── */
async function readPDF(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const lib = window['pdfjs-dist/build/pdf'];
        if (!lib) { resolve(''); return; }
        lib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await lib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
        let out = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
          const pg = await pdf.getPage(i);
          const ct = await pg.getTextContent();
          out += ct.items.map((x) => x.str).join(' ') + '\n';
        }
        resolve(out.trim());
      } catch (err) {
        console.error('PDF.js error:', err);
        resolve('');
      }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

/* ── DOCX reader (uses Mammoth, loaded via CDN in index.html) ── */
async function readDOCX(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.mammoth) { resolve(''); return; }
        const r = await mammoth.extractRawText({ arrayBuffer: e.target.result });
        resolve((r.value || '').trim());
      } catch (err) {
        console.error('Mammoth error:', err);
        resolve('');
      }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

/* ── TXT reader ── */
function readTXT(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result || '');
    r.onerror = () => resolve('');
    r.readAsText(file);
  });
}

function setupUploadDragDrop() {
  const zone = $('uzone');
  if (!zone) return;
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag');
  });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  });
}

/* ══════════════════════════════════════════
   LOCAL ANALYSIS ENGINE
   No API, no backend. Runs entirely in the browser
   against the actual extracted resume text.
   ══════════════════════════════════════════ */

const TECH_KW = ['python','javascript','typescript','java','c++','c#','go','rust','php','ruby','swift','kotlin','scala','r',
  'react','vue','angular','next.js','nuxt','svelte','node.js','express','django','flask','fastapi','spring','laravel',
  'sql','mysql','postgresql','mongodb','redis','elasticsearch','firebase','dynamodb','cassandra','sqlite',
  'aws','azure','gcp','docker','kubernetes','terraform','ansible','jenkins','github actions','ci/cd','linux',
  'html','css','sass','tailwind','bootstrap','webpack','vite','git','rest api','graphql','grpc',
  'machine learning','deep learning','tensorflow','pytorch','scikit-learn','pandas','numpy','keras',
  'system design','microservices','kafka','rabbitmq','nginx','apache','bash','powershell'];

const SOFT_KW = ['communication','leadership','teamwork','problem solving','critical thinking','time management',
  'adaptability','creativity','collaboration','project management','agile','scrum','mentoring','presentation'];

const CERT_KW = ['aws certified','azure','gcp','google cloud','pmp','cisco','comptia','tensorflow','kubernetes','cka','ckad',
  'oracle','salesforce','tableau','power bi','scrum master','safe','itil'];

const ROLE_MAP = {
  'Full Stack Developer': ['react','node.js','javascript','mongodb','express','html','css','rest api','next.js','vue'],
  'Backend Engineer': ['python','java','node.js','go','spring','django','flask','postgresql','mysql','redis','microservices'],
  'Frontend Developer': ['react','vue','angular','javascript','typescript','html','css','tailwind','webpack','next.js'],
  'Data Scientist': ['python','pandas','numpy','scikit-learn','machine learning','tensorflow','pytorch','sql','r','jupyter'],
  'Cloud/DevOps Engineer': ['aws','azure','gcp','docker','kubernetes','terraform','ci/cd','linux','jenkins','ansible'],
  'AI/ML Engineer': ['python','tensorflow','pytorch','machine learning','deep learning','scikit-learn','keras','nlp','transformers'],
  'Android Developer': ['kotlin','java','android','gradle','jetpack','retrofit'],
  'iOS Developer': ['swift','objective-c','ios','xcode','cocoapods','swiftui'],
  'Database Admin': ['sql','postgresql','mysql','mongodb','oracle','redis','elasticsearch','database','dba'],
  'Cybersecurity': ['security','cybersecurity','network','penetration','firewall','vulnerability','comptia','cissp','siem'],
};

const ROLE_ICONS = { 'Full Stack Developer':'💻','Backend Engineer':'🔧','Frontend Developer':'🎨',
  'Data Scientist':'📊','Cloud/DevOps Engineer':'☁️','AI/ML Engineer':'🤖',
  'Android Developer':'📱','iOS Developer':'🍎','Database Admin':'🗄️','Cybersecurity':'🔐' };

const ALL_TOP_SKILLS = ['python','javascript','typescript','react','node.js','docker','aws','sql','git','system design',
  'kubernetes','machine learning','rest api','ci/cd','mongodb','postgresql','redis','graphql','microservices','linux',
  'azure','gcp','java','go','next.js','tailwind','terraform','jenkins','kafka'];

function analyzeResume(rawText) {
  const txt = rawText.toLowerCase();
  const lines = rawText.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  /* ── Extract name — multi-strategy ── */
  let name = '';
  for (const line of lines.slice(0, 10)) {
    if (line.length > 2 && line.length < 60 && /^[A-Za-z][A-Za-z\s\.\-]+$/.test(line) &&
        !/resume|curriculum|vitae|objective|summary|education|experience|skill|project|certif|contact|email|phone|address|linkedin|github|portfolio|university|college|engineer|developer|analyst|manager|intern|bachelor|master|b\.tech|m\.tech/i.test(line)) {
      name = line.trim();
      break;
    }
  }
  if (!name) {
    const nm = rawText.match(/(?:^|\n)\s*(?:name|full name)\s*[:\-]\s*([A-Za-z][A-Za-z\s\.]{2,40})/im);
    if (nm) name = nm[1].trim();
  }
  if (!name) {
    const emailMatch = rawText.match(/([a-zA-Z0-9._%+\-]+)@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      const prefix = emailMatch[1].replace(/[^a-zA-Z]/g, '').trim();
      if (prefix.length > 2) name = formatNameFromEmailPrefix(prefix);
    }
  }

  const emailMatch = rawText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  const phoneMatch = rawText.match(/(\+?\d[\d\s\-().]{8,14}\d)/);
  const phone = phoneMatch ? phoneMatch[0].trim() : '';

  const foundTech = TECH_KW.filter((k) => txt.includes(k));
  const foundSoft = SOFT_KW.filter((k) => txt.includes(k));

  const toolKws = ['vs code','vscode','git','github','gitlab','postman','jira','confluence','figma',
    'linux','windows','mac','intellij','eclipse','xcode','android studio','docker desktop','kubectl'];
  const foundTools = toolKws.filter((k) => txt.includes(k));

  const fwKws = ['react','vue','angular','next.js','nuxt','django','flask','fastapi','express','spring',
    'laravel','rails','bootstrap','tailwind','tensorflow','pytorch','scikit-learn','pandas','numpy'];
  const foundFW = fwKws.filter((k) => txt.includes(k));

  const foundCerts = CERT_KW.filter((k) => txt.includes(k));

  const yrMatch = txt.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i) || txt.match(/(experience|exp)[^\d]*(\d+)\+?\s*years?/i);
  const expYears = yrMatch ? parseInt(yrMatch[1] || yrMatch[2] || 1) : 1;

  /* ── ATS score ── */
  const hasEmail = email.length > 0;
  const hasPhone = phone.length > 0;
  const hasSkills = foundTech.length >= 3;
  const hasBullets = rawText.includes('•') || rawText.includes('-') || rawText.includes('*');
  const hasQuant = /\d+%|\d+\s*(users|clients|customers|revenue|reduction|improvement|performance|ms|seconds|requests|apis)/i.test(rawText);
  const hasLinks = /github|linkedin|portfolio|website/i.test(txt);
  const hasSummary = /summary|objective|profile|about/i.test(txt);
  const hasProjects = /project|built|developed|created|implemented/i.test(txt);
  const wordCount = rawText.split(/\s+/).length;
  const goodLength = wordCount > 200 && wordCount < 1200;

  let atsScore = 40;
  if (hasEmail) atsScore += 8;
  if (hasPhone) atsScore += 5;
  if (hasSkills) atsScore += 15;
  if (hasBullets) atsScore += 5;
  if (hasQuant) atsScore += 10;
  if (hasLinks) atsScore += 5;
  if (hasSummary) atsScore += 7;
  if (hasProjects) atsScore += 5;
  if (goodLength) atsScore += 5;
  if (foundTech.length > 8) atsScore += 5;
  if (foundCerts.length > 0) atsScore += 5;
  atsScore = Math.min(atsScore, 96);

  const atsGrade = atsScore >= 90 ? 'A+' : atsScore >= 80 ? 'A' : atsScore >= 70 ? 'B+' : atsScore >= 60 ? 'B' : atsScore >= 50 ? 'C+' : 'C';

  /* ── Strength score ── */
  const summaryScore = hasSummary ? Math.min(40 + foundTech.length * 4, 85) : 30;
  const expScore = hasQuant ? Math.min(60 + expYears * 5, 90) : Math.min(45 + expYears * 5, 75);
  const skillsScore = Math.min(40 + foundTech.length * 4, 90);
  const eduScore = /bachelor|master|b\.tech|m\.tech|b\.e|m\.e|bsc|msc|phd|degree|university|college/i.test(txt) ? 72 : 55;
  const projScore = hasProjects ? Math.min(50 + foundTech.length * 3, 85) : 40;
  const certScore = foundCerts.length > 0 ? Math.min(50 + foundCerts.length * 15, 90) : 15;
  const strengthScore = Math.round((summaryScore + expScore + skillsScore + eduScore + projScore + certScore) / 6);

  const missing = ALL_TOP_SKILLS.filter((k) => !txt.includes(k)).slice(0, 8);
  const priority = missing.slice(0, 3);

  const roleScores = Object.entries(ROLE_MAP).map(([role, kws]) => {
    const matched = kws.filter((k) => txt.includes(k)).length;
    const conf = Math.min(Math.round((matched / kws.length) * 100), 96);
    return { title: role, icon: ROLE_ICONS[role] || '💼', confidence: conf, description: kws.filter((k) => txt.includes(k)).slice(0, 3).join(', ') || 'Based on your profile' };
  }).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

  const eduMatch = rawText.match(/(B\.?Tech|B\.?E|B\.?Sc|M\.?Tech|M\.?Sc|M\.?E|MBA|B\.?A|M\.?A|Ph\.?D|Bachelor|Master)[^\n]{0,80}/i);

  const expPattern = /(?:software|senior|junior|lead|full.?stack|front.?end|back.?end|data|cloud|devops)[^\n]{0,80}/gi;
  const expMatches = [...rawText.matchAll(expPattern)].slice(0, 3);

  const projPattern = /(?:built|developed|created|implemented|designed)[^\n]{0,120}/gi;
  const projMatches = [...rawText.matchAll(projPattern)].slice(0, 3);

  /* ── Problems ── */
  const problems = [];
  if (!hasSummary) problems.push({ icon: '❌', title: 'Missing Professional Summary', impact: 'Recruiters spend 6 seconds scanning — no summary = no attention.', solution: 'Add a 3-line summary at the top: your role, years of experience, and one achievement with a metric.' });
  if (atsScore < 70) problems.push({ icon: '📉', title: `Low ATS Score (${atsScore}%)`, impact: 'Most companies auto-reject resumes scoring below 70%. You risk never reaching a human recruiter.', solution: 'Add keywords from job descriptions: REST API, Agile, Docker, CI/CD, cloud infrastructure, microservices.' });
  if (!txt.includes('docker') && !txt.includes('aws') && !txt.includes('azure') && !txt.includes('gcp'))
    problems.push({ icon: '🔧', title: 'No Cloud / DevOps Skills Found', impact: '92% of mid-level engineering roles now require Docker or cloud knowledge.', solution: 'Learn Docker basics (1 week free). Deploy one project to AWS Free Tier and add it to your resume.' });
  if (foundCerts.length === 0) problems.push({ icon: '📜', title: 'No Certifications Listed', impact: 'Certified candidates get 25–30% more callbacks according to LinkedIn data.', solution: 'Start with AWS Cloud Practitioner — 2-3 months of part-time prep, $100 exam fee.' });
  if (!hasQuant) problems.push({ icon: '📊', title: 'No Quantified Achievements', impact: 'Vague bullets like "worked on backend" are ignored by both ATS and humans.', solution: 'Add numbers: "Served 10,000+ users", "Reduced load time by 40%", "Maintained 99.9% uptime".' });
  if (foundTech.length < 5) problems.push({ icon: '⚡', title: 'Too Few Technical Skills Listed', impact: 'ATS scans for skills keywords. Fewer than 5 technical skills = very low match rate.', solution: 'Expand your skills section. List every relevant technology, language, tool, and framework you know.' });

  /* ── Suggestions ── */
  const suggestions = [
    { type: 'Professional Summary',
      original: hasSummary ? 'Your current summary lacks specific metrics and impact.' : '[No summary section found on resume]',
      improved: `Results-driven ${roleScores[0]?.title || 'Software Engineer'} with ${expYears}+ years building scalable web applications using ${foundTech.slice(0, 3).join(', ') || 'modern tech stacks'}. Delivered projects serving 1,000+ users with 99.9% uptime. Passionate about clean code and cloud-native architectures.` },
    { type: 'Experience Bullet — Before/After',
      original: 'Worked on the backend of the application.',
      improved: 'Engineered RESTful APIs using ' + (foundTech.includes('node.js') ? 'Node.js' : 'Python') + ' and ' + (foundTech.includes('postgresql') ? 'PostgreSQL' : 'MySQL') + ' handling 5,000+ daily requests, achieving 99.9% uptime across 18 months of production deployment.' },
    { type: 'Skills Section Format',
      original: foundTech.slice(0, 4).join(', ') || 'Python, JavaScript',
      improved: `Languages: ${foundTech.filter((k) => ['python','javascript','typescript','java','go','rust','c++'].includes(k)).join(', ') || 'Python, JavaScript'} | Frameworks: ${foundFW.slice(0, 3).join(', ') || 'React, Node.js'} | Databases: ${foundTech.filter((k) => ['sql','mysql','postgresql','mongodb','redis'].includes(k)).join(', ') || 'PostgreSQL, MongoDB'} | Tools: ${foundTools.slice(0, 3).join(', ') || 'Git, Docker, Postman'}` },
  ];

  /* ── Roadmap — tiered by actual ATS score + real skill gaps, not one-size-fits-all ── */
  const topRole = roleScores[0]?.title || 'Software Engineer';
  const tier = atsScore >= 90 ? 'top' : atsScore >= 75 ? 'high' : atsScore >= 60 ? 'mid' : 'low';
  const gapTitle = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : 'System Design';
  const topGap = gapTitle(priority[0]);

  const roadmapByTier = {
    low: [
      { period: 'Month 1', title: 'Fix Resume Fundamentals', items: [
          !hasSummary ? 'Write a 3-line professional summary with role, years and one metric' : 'Sharpen your existing summary with a concrete metric',
          !hasQuant ? 'Quantify at least 5 experience/project bullets (numbers, %, time saved)' : 'Add 2-3 more quantified bullets',
          !hasLinks ? 'Add GitHub + LinkedIn links to your header' : 'Pin your best 3 repos on GitHub',
        ] },
      { period: 'Month 2-3', title: `Close Your Top Skill Gap: ${topGap}`, items: missing.slice(0, 3).map((s) => gapTitle(s) + ' fundamentals').concat(['Ship 1 small project using it']) },
      { period: 'Month 4-6', title: 'Build Proof of Work', items: ['Launch 2 full-stack GitHub projects', 'Write 2 technical blog posts on Dev.to', 'Re-run this ATS check — target 75%+'] },
      { period: 'Month 7-12', title: 'Start Applying', items: [`Apply to junior/entry ${topRole} roles`, 'Do 5+ mock interviews', 'Earn 1 relevant certification'] },
    ],
    mid: [
      { period: 'Month 1-2', title: 'Fill Critical Skill Gaps', items: missing.slice(0, 3).map((s) => gapTitle(s) + ' fundamentals').concat(['System Design basics']) },
      { period: 'Month 3-4', title: 'Get Certified', items: [`${topGap} certification — highest ROI for your gaps`, 'Advanced Git & GitHub Actions', 'Agile / Scrum basics'] },
      { period: 'Month 5-6', title: 'Build Portfolio', items: ['Launch 2 full-stack GitHub projects', 'Write 3 technical blog posts on Dev.to', 'First open-source contribution'] },
      { period: 'Month 7-12', title: 'Career Growth', items: [`Apply for mid-level ${topRole} roles`, 'Start freelancing for side income', 'Attend 2 tech meetups'] },
    ],
    high: [
      { period: 'Month 1-2', title: 'Round Out Your Stack', items: missing.slice(0, 2).map((s) => gapTitle(s) + ' basics').concat(['Contribute to 1 open-source project']) },
      { period: 'Month 3-4', title: 'Interview Prep', items: ['Practice system design 2x/week', 'Solve 50 DSA problems', 'Run 2-3 mock interviews with peers'] },
      { period: 'Month 5-6', title: 'Apply to Senior Roles', items: [`Target senior ${topRole} openings`, 'Benchmark comp on levels.fyi before negotiating', `Earn ${topGap} certification`] },
      { period: 'Month 7-12', title: 'Leadership Track', items: ['Lead a cross-team project', 'Mentor 1-2 junior engineers', 'Speak at a meetup or conference'] },
    ],
    top: [
      { period: 'Month 1-2', title: 'Interview-Ready Sprint', items: ['Practice system design 2x/week', 'Solve 30 hard DSA problems', 'Run 3 mock interviews'] },
      { period: 'Month 3-4', title: 'Target Top Companies', items: [`Apply to senior ${topRole} roles at top-tier companies`, 'Get referrals via your LinkedIn network', 'Negotiate multiple offers against each other'] },
      { period: 'Month 5-8', title: 'Establish Authority', items: ['Publish 2-3 in-depth technical articles', 'Speak at a conference or meetup', 'Open-source a tool from your work'] },
      { period: 'Month 9-12', title: 'Leadership / Staff Track', items: ['Lead architecture decisions on a major project', 'Mentor junior/mid engineers', 'Target Staff/Principal-level interviews'] },
    ],
  };
  const roadmap = roadmapByTier[tier];

  /* ── Resources (matched to missing skills) ── */
  const resourceMap = {
    python: { icon: '🐍', skill: 'Python', desc: 'Master Python for backend and automation', links: [{ name: 'Python Docs', url: 'https://docs.python.org/3/' }, { name: 'Real Python', url: 'https://realpython.com' }, { name: 'W3Schools', url: 'https://www.w3schools.com/python/' }] },
    javascript: { icon: '🟨', skill: 'JavaScript', desc: 'Modern JavaScript for web development', links: [{ name: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' }, { name: 'javascript.info', url: 'https://javascript.info' }, { name: 'freeCodeCamp', url: 'https://www.freecodecamp.org' }] },
    docker: { icon: '🐳', skill: 'Docker', desc: 'Containerization from zero to hero', links: [{ name: 'Docker Docs', url: 'https://docs.docker.com' }, { name: 'Play with Docker', url: 'https://labs.play-with-docker.com' }, { name: 'Docker Curriculum', url: 'https://docker-curriculum.com' }] },
    aws: { icon: '☁️', skill: 'AWS', desc: 'Cloud computing fundamentals', links: [{ name: 'AWS Free Tier', url: 'https://aws.amazon.com/free/' }, { name: 'AWS Skill Builder', url: 'https://skillbuilder.aws' }, { name: 'A Cloud Guru', url: 'https://acloudguru.com' }] },
    'system design': { icon: '🏗️', skill: 'System Design', desc: 'Design scalable distributed systems', links: [{ name: 'SD Primer', url: 'https://github.com/donnemartin/system-design-primer' }, { name: 'Grokking SD', url: 'https://www.educative.io/courses/grokking-the-system-design-interview' }, { name: 'High Scalability', url: 'http://highscalability.com' }] },
    react: { icon: '⚛️', skill: 'React', desc: 'Build modern UIs with React', links: [{ name: 'React Docs', url: 'https://react.dev' }, { name: 'freeCodeCamp React', url: 'https://www.freecodecamp.org/learn/front-end-development-libraries/' }, { name: 'Scrimba React', url: 'https://scrimba.com/learn/learnreact' }] },
    kubernetes: { icon: '⎈', skill: 'Kubernetes', desc: 'Container orchestration at scale', links: [{ name: 'K8s Docs', url: 'https://kubernetes.io/docs/' }, { name: 'K8s by Example', url: 'https://kubernetesbyexample.com' }, { name: 'KodeKloud', url: 'https://kodekloud.com' }] },
    'machine learning': { icon: '🧠', skill: 'Machine Learning', desc: 'AI/ML fundamentals and practice', links: [{ name: 'Kaggle', url: 'https://kaggle.com' }, { name: 'Google ML Crash Course', url: 'https://developers.google.com/machine-learning/crash-course' }, { name: 'Fast.ai', url: 'https://fast.ai' }] },
  };
  const resources = missing.slice(0, 4).map((m) => resourceMap[m]).filter(Boolean);
  if (resources.length < 3) resources.push(resourceMap['system design'], resourceMap['docker']);
  const uniqueRes = [...new Map(resources.filter(Boolean).map((r) => [r.skill, r])).values()].slice(0, 4);

  const youtubePool = [
    { skill: 'Python Full Course for Beginners', channel: 'Programming with Mosh', url: 'https://www.youtube.com/watch?v=_uQrJ0TkZlc', thumb: '🐍', duration: '6 hrs', tag: 'python' },
    { skill: 'JavaScript Full Course for Beginners', channel: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=PkZNo7MFNFg', thumb: '🟨', duration: '3.5 hrs', tag: 'javascript' },
    { skill: 'Docker Tutorial for Beginners', channel: 'TechWorld with Nana', url: 'https://www.youtube.com/watch?v=3c-iBn73dDE', thumb: '🐳', duration: '3 hrs', tag: 'docker' },
    { skill: 'System Design for Interviews', channel: 'Gaurav Sen', url: 'https://www.youtube.com/watch?v=xpDnVSmNFX0', thumb: '🏗️', duration: '45 min', tag: 'system design' },
    { skill: 'Data Structures & Algorithms', channel: 'Abdul Bari', url: 'https://www.youtube.com/watch?v=0IAPZzGSbME', thumb: '📊', duration: '8 hrs', tag: 'dsa' },
    { skill: 'AWS Full Course for Beginners', channel: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=ulprqHHWlng', thumb: '☁️', duration: '5 hrs', tag: 'aws' },
    { skill: 'Machine Learning Full Course', channel: 'Krish Naik', url: 'https://www.youtube.com/watch?v=GwIo3gDZCVQ', thumb: '🤖', duration: '10 hrs', tag: 'machine learning' },
    { skill: 'React Course for Beginners', channel: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=bMknfKXIFA8', thumb: '⚛️', duration: '11 hrs', tag: 'react' },
    { skill: 'Kubernetes Tutorial for Beginners', channel: 'TechWorld with Nana', url: 'https://www.youtube.com/watch?v=X48VuDVv0do', thumb: '⎈', duration: '4 hrs', tag: 'kubernetes' },
    { skill: 'SQL Full Course', channel: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY', thumb: '🗄️', duration: '4 hrs', tag: 'sql' },
  ];
  // Prioritize videos that fill this resume's actual missing skills; fall back to broadly useful ones.
  const youtube = youtubePool
    .map((v) => ({ ...v, _rank: missing.includes(v.tag) ? missing.indexOf(v.tag) : foundTech.includes(v.tag) ? 50 : 25 }))
    .sort((a, b) => a._rank - b._rank)
    .slice(0, 6)
    .map(({ _rank, tag, ...v }) => v);

  /* ── Career guidance — driven by actual score tier, top role & real gaps ── */
  const recommendationsByTier = {
    low: [
      !hasSummary ? 'Add a professional summary — resumes without one get skipped in the first 6 seconds' : `Tighten your summary with a hard metric so it survives a recruiter's first scan`,
      !hasQuant ? 'Rewrite at least 3 bullet points with numbers (users, %, time saved) before applying anywhere' : 'Add numbers to your remaining unquantified bullets',
      `Fill your biggest skill gap first: ${topGap} — this is blocking you from ${topRole} roles`,
      'Fix ATS basics before job-hunting: consistent fonts, standard section headers, no tables or images',
    ],
    mid: [
      `Get certified in ${topGap} in the next 2-3 months — it directly closes your biggest skill gap`,
      `Build 1 project that clearly demonstrates ${foundTech.slice(0, 2).join(' and ') || 'your core stack'} plus ${topGap}`,
      'Quantify every remaining experience bullet — aim for a number in at least 80% of them',
      `Start applying to mid-level ${topRole} roles now while you build the gap-filling project in parallel`,
    ],
    high: [
      `You're ATS-ready — focus on differentiation: contribute to 1 open-source project in ${foundTech[0] || 'your stack'}`,
      `Add ${topGap} to round out your ${topRole} profile and unlock senior-level postings`,
      'Write 2-3 technical blog posts to build a public track record recruiters can verify',
      'Start mock interviews (system design + DSA) — you are close to interview-ready',
    ],
    top: [
      `Your resume is in the top bracket (${atsScore}%) — the bottleneck now is interviews, not paperwork`,
      `Target senior / staff-level ${topRole} postings and negotiate on total comp, not just base salary`,
      'Mentor 1-2 junior engineers or speak at a meetup — leadership signals matter at this level',
      `Sharpen ${topGap} as your next differentiator for staff-level rounds`,
    ],
  };

  const growthByTier = {
    low: [
      `Entry / junior ${topRole} role once your ATS score crosses 70%`,
      'Mid-level within 2-3 years after building a track record of shipped projects',
      'Freelance micro-projects on Upwork once your portfolio has 2+ live projects',
    ],
    mid: [
      `Mid-level ${topRole} within 6-12 months`,
      'Senior role in 2-3 years with consistent delivery and upskilling',
      'Freelancing on Upwork/Toptal as parallel income from Month 6',
    ],
    high: [
      `Senior ${topRole} in 1-1.5 years`,
      'Tech Lead in 2-3 years with hands-on team project experience',
      'Startup founding engineer role once you cross 3+ years of experience',
    ],
    top: [
      `Senior ${topRole} within 6-12 months — you're already close`,
      'Staff / Principal Engineer track in 2-3 years',
      'Strong candidate for FAANG / top-tier product company interviews right now',
    ],
  };

  const industryMap = {
    'Data Scientist': ['FinTech', 'HealthTech', 'E-Commerce', 'AdTech', 'SaaS Startups', 'Research Labs'],
    'AI/ML Engineer': ['AI Research Labs', 'FinTech', 'HealthTech', 'Autonomous Systems', 'SaaS Startups'],
    'Cloud/DevOps Engineer': ['IT Services', 'FinTech', 'SaaS Startups', 'E-Commerce', 'Telecom'],
    'Cybersecurity': ['BFSI', 'Government / Defense', 'Healthcare', 'IT Services', 'Telecom'],
    'Backend Engineer': ['FinTech', 'E-Commerce', 'SaaS Startups', 'IT Services', 'Logistics'],
    'Frontend Developer': ['EdTech', 'E-Commerce', 'SaaS Startups', 'MarTech', 'Media'],
    'Android Developer': ['Consumer Apps', 'FinTech', 'E-Commerce', 'EdTech', 'Gaming'],
    'iOS Developer': ['Consumer Apps', 'FinTech', 'E-Commerce', 'HealthTech', 'Gaming'],
    'Database Admin': ['BFSI', 'IT Services', 'E-Commerce', 'Healthcare', 'Telecom'],
  };

  const career = {
    recommendations: recommendationsByTier[tier],
    industries: industryMap[topRole] || ['FinTech', 'EdTech', 'HealthTech', 'E-Commerce', 'SaaS Startups', 'IT Services'],
    growth_opportunities: growthByTier[tier],
  };

  /* ── Certifications — ranked by relevance to THIS resume's role & gaps, not a fixed list ── */
  const CERT_POOL = [
    { icon: '☁️', name: 'AWS Cloud Practitioner', provider: 'Amazon Web Services', cost: '$100', duration: '2-3 months', tags: ['aws', 'cloud/devops engineer', 'backend engineer', 'full stack developer'] },
    { icon: '🔷', name: 'Azure Fundamentals AZ-900', provider: 'Microsoft Azure', cost: '$165', duration: '1-2 months', tags: ['azure', 'cloud/devops engineer'] },
    { icon: '🌐', name: 'Google Cloud Associate Engineer', provider: 'Google Cloud', cost: '$200', duration: '3-4 months', tags: ['gcp', 'cloud/devops engineer'] },
    { icon: '⎈', name: 'Certified Kubernetes Administrator', provider: 'CNCF', cost: '$395', duration: '2-3 months', tags: ['kubernetes', 'docker', 'cloud/devops engineer'] },
    { icon: '📊', name: 'TensorFlow Developer Certificate', provider: 'Google', cost: '$100', duration: '3-6 months', tags: ['machine learning', 'tensorflow', 'ai/ml engineer', 'data scientist'] },
    { icon: '📈', name: 'Google Data Analytics Certificate', provider: 'Google', cost: '$49/mo', duration: '3-6 months', tags: ['sql', 'data scientist'] },
    { icon: '🔐', name: 'CompTIA Security+', provider: 'CompTIA', cost: '$370', duration: '3-4 months', tags: ['security', 'cybersecurity'] },
    { icon: '📱', name: 'Associate Android Developer', provider: 'Google', cost: 'Free', duration: '2-3 months', tags: ['kotlin', 'android developer'] },
    { icon: '🗄️', name: 'Oracle Database SQL Certified Associate', provider: 'Oracle', cost: '$245', duration: '1-2 months', tags: ['sql', 'database admin'] },
    { icon: '⚛️', name: 'Meta Front-End Developer Certificate', provider: 'Meta', cost: '$49/mo', duration: '3-5 months', tags: ['react', 'frontend developer'] },
  ];
  const roleKey = topRole.toLowerCase();
  const rankedCertifications = CERT_POOL
    .map((c) => {
      let score = 0;
      if (c.tags.includes(roleKey)) score += 3;
      missing.forEach((m) => { if (c.tags.includes(m)) score += 2; });
      foundTech.forEach((t) => { if (c.tags.includes(t)) score += 1; });
      return { ...c, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 5)
    .map(({ _score, tags, ...c }) => c);

  return {
    parsed: {
      name, email, phone,
      skills: foundTech.slice(0, 12),
      education: eduMatch ? [{ degree: eduMatch[0].trim().slice(0, 60), institution: '', year: '' }] : [],
      experience: expMatches.length > 0 ? expMatches.map((m) => ({ title: m[0].trim().slice(0, 60), company: '', duration: '', description: '' })) : [{ title: 'Software Engineer', company: '', duration: '', description: 'Worked on software development projects' }],
      projects: projMatches.length > 0 ? projMatches.map((m) => ({ name: m[0].trim().slice(0, 50), description: m[0].trim().slice(0, 100), tech: [] })) : [{ name: 'See resume', description: 'Projects listed in resume', tech: [] }],
      certifications: foundCerts,
    },
    ats: {
      score: atsScore, grade: atsGrade,
      suggestions: [
        !hasSummary ? 'Add a professional summary / objective at the top of your resume' : 'Strengthen your summary with quantified achievements',
        !hasQuant ? 'Quantify achievements — add numbers like users served, uptime %, performance gains' : 'Add more quantified metrics to experience bullets',
        missing.length > 0 ? `Add missing keywords: ${missing.slice(0, 4).join(', ')}` : 'Your keyword density is good — keep it up',
        !hasLinks ? 'Add LinkedIn and GitHub profile links' : 'Good — make sure your GitHub has pinned, documented projects',
      ],
      compatibility_report: `Your resume scores ${atsScore}% on ATS compatibility (Grade ${atsGrade}). ${atsScore >= 70 ? 'You pass most basic ATS filters.' : 'You are at risk of being auto-rejected before a human sees your resume.'} ${foundTech.length} technical skills detected. ${hasQuant ? 'Good — you have some quantified achievements.' : 'Add numbers and metrics to experience bullets for a higher score.'}`,
    },
    strength: { score: strengthScore, sections: { summary: summaryScore, experience: expScore, skills: skillsScore, education: eduScore, projects: projScore, certifications: certScore } },
    skills: { technical: foundTech.slice(0, 12), soft: foundSoft.slice(0, 6), tools: foundTools.slice(0, 6), frameworks: foundFW.slice(0, 8) },
    skill_gap: {
      missing, priority,
      industry_comparison: `You have ${Math.round((foundTech.length / ALL_TOP_SKILLS.length) * 100)}% of top industry skills for modern engineering roles. ${priority.length > 0 ? 'Priority gaps: ' + priority.join(', ') + '.' : ''} Focus on cloud and DevOps skills to reach 80%+ match rate.`,
    },
    problems, suggestions,
    job_roles: roleScores.map((r) => ({ ...r, description: r.description ? `Matched skills: ${r.description}` : 'Based on your overall profile' })),
    career_guidance: career,
    roadmap,
    resources: uniqueRes,
    youtube,
    projects: (() => {
      const rank = (pool) => pool
        .map((p) => ({ ...p, _score: p.skills.reduce((sum, s) => sum + (missing.includes(s.toLowerCase()) ? 2 : foundTech.includes(s.toLowerCase()) ? -1 : 0), 0) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 3)
        .map(({ _score, ...p }) => p);
      const beginnerPool = [
        { title: 'Personal Portfolio Website', desc: 'Responsive dark-mode portfolio with animations, skill bars, project showcase, and contact form.', skills: ['HTML5', 'CSS3', 'JavaScript', 'Netlify'] },
        { title: 'Weather Dashboard App', desc: 'Real-time weather with OpenWeatherMap API, city search, 5-day forecast, and geolocation support.', skills: ['JavaScript', 'REST API', 'CSS', 'localStorage'] },
        { title: 'Task Manager with Auth', desc: 'Full CRUD task app with JWT authentication, priority labels, due dates, and email reminders.', skills: ['React', 'Node.js', 'MongoDB', 'JWT'] },
        { title: 'Dockerized Blog Engine', desc: 'Simple markdown blog packaged and run entirely with Docker, including a one-command deploy script.', skills: ['Docker', 'Node.js', 'Markdown'] },
        { title: 'Cloud File Uploader', desc: 'Drag-and-drop file uploader that stores files on AWS S3 with signed URLs and a progress bar.', skills: ['AWS', 'JavaScript', 'REST API'] },
      ];
      const intermediatePool = [
        { title: 'E-Commerce Platform', desc: 'Full-stack online store with product catalog, cart, Stripe payments, admin panel, and order tracking.', skills: ['React', 'Node.js', 'Stripe', 'MongoDB', 'Redis'] },
        { title: 'Real-Time Chat App', desc: 'Socket.io group chat with rooms, typing indicators, online status, emoji support, and file sharing.', skills: ['Socket.io', 'Express', 'React', 'Redis', 'Cloudinary'] },
        { title: 'Job Board Platform', desc: 'Job listings with advanced search, apply flow, save jobs, application tracking, and recruiter dashboard.', skills: ['Next.js', 'PostgreSQL', 'Prisma', 'NextAuth.js'] },
        { title: 'CI/CD Pipeline for a Web App', desc: 'Automated build-test-deploy pipeline using GitHub Actions, Docker, and a staging + production environment.', skills: ['CI/CD', 'Docker', 'GitHub Actions'] },
        { title: 'ML-Powered Recommendation Engine', desc: 'Content recommender trained on a public dataset, served through a lightweight API with a simple UI.', skills: ['Python', 'Machine Learning', 'FastAPI'] },
      ];
      const advancedPool = [
        { title: 'AI Resume Analyzer (like this!)', desc: 'NLP-powered resume parser with ATS scoring, skill gap detection, job matching, and portfolio generation.', skills: ['Python', 'spaCy', 'FastAPI', 'React', 'PostgreSQL', 'Docker'] },
        { title: 'Microservices E-Commerce', desc: 'Distributed system with Docker, Kubernetes, API gateway, RabbitMQ, and full CI/CD via GitHub Actions.', skills: ['Docker', 'Kubernetes', 'Node.js', 'RabbitMQ', 'Nginx', 'GitHub Actions'] },
        { title: 'ML Model Deployment Platform', desc: 'End-to-end platform to train, version, evaluate and serve ML models with real-time monitoring dashboard.', skills: ['Python', 'MLflow', 'FastAPI', 'Docker', 'React', 'PostgreSQL'] },
        { title: 'Multi-Region Cloud Infra with Terraform', desc: 'Infrastructure-as-code setup deploying a full app stack across two AWS regions with auto-failover.', skills: ['Terraform', 'AWS', 'Kubernetes'] },
        { title: 'Distributed System Design Case Study', desc: 'Built and documented a rate limiter + event queue system, covering scaling, consistency, and failure modes.', skills: ['System Design', 'Kafka', 'Microservices'] },
      ];
      return { beginner: rank(beginnerPool), intermediate: rank(intermediatePool), advanced: rank(advancedPool) };
    })(),
    certifications: rankedCertifications,
    portfolio: { name, title: topRole, summary: `${expYears}+ year${expYears > 1 ? 's' : ''} of experience building applications with ${foundTech.slice(0, 3).join(', ') || 'modern web technologies'}. Passionate about clean code, scalable architecture and continuous learning.`, email, github: '', linkedin: '' },
  };
}

/* ── Scanning animation steps ── */
const STEPS = [
  { id: 'p0', l: 'Parsing Resume Text', i: '📄' },
  { id: 'p1', l: 'Extracting Skills & Experience', i: '⚡' },
  { id: 'p2', l: 'Running ATS Analysis', i: '🤖' },
  { id: 'p3', l: 'Calculating Resume Strength', i: '💪' },
  { id: 'p4', l: 'Identifying Skill Gaps', i: '🔍' },
  { id: 'p5', l: 'Detecting Problems', i: '⚠️' },
  { id: 'p6', l: 'Generating AI Suggestions', i: '✨' },
  { id: 'p7', l: 'Predicting Job Roles', i: '🎯' },
  { id: 'p8', l: 'Building Career Guidance', i: '🚀' },
  { id: 'p9', l: 'Preparing Resources', i: '📚' },
  { id: 'p10', l: 'Generating Portfolio', i: '🌐' },
];
function buildStepUI() {
  $('stepslist').innerHTML = STEPS.map((s) =>
    `<div class="srow" id="${s.id}"><span class="s-ico">${s.i}</span><span class="s-lbl">${s.l}</span><span class="s-st" id="${s.id}-s">Waiting…</span></div>`).join('');
}
function setSt(id, st) {
  const el = $(id + '-s');
  if (!el) return;
  el.className = 's-st ' + (st === 'run' ? 'run' : st === 'done' ? 'done' : '');
  el.textContent = st === 'run' ? 'Analyzing…' : st === 'done' ? '✓ Done' : 'Waiting…';
}

/* Calls the secure backend AI endpoint added for personalized analysis.
   Falls back to the existing local analyzeResume() below if the backend
   is unreachable or not configured with an AI provider key, so the app
   keeps working exactly as before in that case. */
async function fetchAIAnalysis(text) {
  const res = await fetch('/api/analyze-resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('AI analysis request failed: ' + res.status);
  const data = await res.json();
  if (!data || !data.ats || typeof data.ats.score !== 'number') {
    throw new Error('AI analysis response missing expected fields');
  }
  return data;
}

async function startAnalysis() {
  $('uzone').style.display = 'none';
  $('fbar').classList.remove('on');
  $('scanning').classList.add('on');
  buildStepUI();
  let idx = 0;
  const anim = setInterval(() => {
    if (idx < STEPS.length) {
      if (idx > 0) setSt(STEPS[idx - 1].id, 'done');
      setSt(STEPS[idx].id, 'run');
      idx++;
    }
  }, 400);
  await sl(200);
  const analysisPromise = (async () => {
    try {
      return await fetchAIAnalysis(S.txt);
    } catch (err) {
      console.warn('AI analysis unavailable, using local analysis:', err);
      try {
        return analyzeResume(S.txt);
      } catch (err2) {
        console.error('Analysis error:', err2);
        return analyzeResume('');
      }
    }
  })();
  const [result] = await Promise.all([analysisPromise, sl(STEPS.length * 400 + 400)]);
  clearInterval(anim);
  STEPS.forEach((s) => setSt(s.id, 'done'));
  await sl(400);
  S.data = result;
  $('scanning').classList.remove('on');
  renderAll(S.data);
  $('results').classList.add('on');
  toast('✅ Analysis complete! All 16 features ready.', 'ok');
}

/* ── Render all 16 tabs ── */
function renderAll(d) {
  $('sv-ats').textContent = (d.ats?.score || 0) + '%';
  $('sv-str').textContent = (d.strength?.score || 0) + '%';
  $('sv-sk').textContent = (d.skills?.technical?.length || 0) + (d.skills?.soft?.length || 0);
  $('sv-mis').textContent = d.skill_gap?.missing?.length || 0;
  rParsed(d.parsed); rATS(d.ats); rStrength(d.strength);
  rSkills(d.skills, d.skill_gap); rProblems(d.problems);
  rSuggestions(d.suggestions); rRoles(d.job_roles);
  rCareer(d.career_guidance); rRoadmap(d.roadmap);
  rResources(d.resources); rYT(d.youtube);
  rProjects(d.projects); rCerts(d.certifications);
  rPortfolio(d.portfolio, d.parsed);
}

function rParsed(p) {
  if (!p) return;
  const raw = S.txt || '';
  let displayName = p.name;
  if (!displayName || /^your name$/i.test(displayName.trim()) || displayName === '—') {
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 60);
    for (const line of lines.slice(0, 10)) {
      if (/^[A-Za-z][A-Za-z\s\.\-]{2,50}$/.test(line) &&
          !/resume|curriculum|vitae|objective|summary|education|experience|skill|project|certif|contact|email|phone|address|linkedin|github|portfolio|university|college|engineer|developer|analyst|manager|intern|bachelor|master|b\.tech|m\.tech/i.test(line)) {
        displayName = line.trim();
        break;
      }
    }
    if (!displayName || /^your name$/i.test(displayName)) {
      const nm = raw.match(/(?:^|\n)\s*(?:name|full name)\s*[:\-]\s*([A-Za-z][A-Za-z\s\.]{2,40})/im);
      if (nm) displayName = nm[1].trim();
    }
    if (!displayName || /^your name$/i.test(displayName)) {
      const emailM = raw.match(/([a-zA-Z0-9._%+\-]+)@/);
      if (emailM) {
        const prefix = emailM[1].replace(/[^a-zA-Z]/g, '').trim();
        if (prefix.length > 2) displayName = formatNameFromEmailPrefix(prefix);
      }
    }
  }
  if (!displayName || /^your name$/i.test(displayName.trim())) displayName = '—';
  $('r-parsed').innerHTML = `
    <div class="pgrid">
      <div class="pi"><div class="pk">👤 Name</div><div class="pv">${esc(displayName)}</div></div>
      <div class="pi"><div class="pk">📧 Email</div><div class="pv">${esc(p.email) || '—'}</div></div>
      <div class="pi"><div class="pk">📱 Phone</div><div class="pv">${esc(p.phone) || '—'}</div></div>
      <div class="pi"><div class="pk">🏅 Certifications</div><div class="pv">${p.certifications?.length ? p.certifications.join(', ') : 'None detected'}</div></div>
    </div>
    <div class="divider"></div>
    <div class="ct">💼 Detected Experience</div>
    ${(p.experience || []).slice(0, 3).map((e) => `<div class="expitem"><div class="exp-t">${esc(e.title)}</div>${e.description ? `<div class="exp-s">${esc(e.description)}</div>` : ''}</div>`).join('') || '<div class="iban"><span>ℹ️</span>Experience section not clearly detected. Check your resume format.</div>'}
    <div class="ct" style="margin-top:13px">🎓 Education</div>
    ${(p.education || []).length ? p.education.map((e) => `<div class="expitem"><div class="exp-t">${esc(e.degree)}</div></div>`).join('') : '<div class="iban"><span>ℹ️</span>Education section not clearly detected.</div>'}
    <div class="ct" style="margin-top:13px">🛠️ Detected Projects</div>
    ${(p.projects || []).slice(0, 3).map((pr) => `<div class="expitem"><div class="exp-t">${esc(pr.name)}</div><div class="exp-s">${esc(pr.description)}</div></div>`).join('') || '<div class="iban"><span>ℹ️</span>No project descriptions clearly detected.</div>'}
  `;
}
function rATS(a) {
  if (!a) return;
  $('ats-n').textContent = a.score;
  $('ats-g').textContent = a.grade;
  $('ats-r').textContent = a.compatibility_report;
  setTimeout(() => { $('ats-b').style.width = a.score + '%'; }, 200);
  $('ats-s').innerHTML = (a.suggestions || []).map((s) => `<div style="display:flex;gap:8px;align-items:flex-start;padding:9px 11px;background:var(--bg3);border:1px solid var(--br2);border-radius:8px;margin-bottom:6px"><span style="color:var(--p);flex-shrink:0">→</span><span style="font-size:13px;line-height:1.5">${esc(s)}</span></div>`).join('');
}
function rStrength(s) {
  if (!s) return;
  $('str-n').textContent = s.score;
  setTimeout(() => { $('str-b').style.width = s.score + '%'; }, 200);
  const sec = s.sections || {};
  $('str-s').innerHTML = Object.entries(sec).map(([k, v]) => {
    const cls = v >= 70 ? 'eh' : v >= 50 ? 'em' : 'el';
    const col = v >= 70 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--err)';
    return `<div class="erow"><div class="elbl">${k[0].toUpperCase() + k.slice(1)}</div><div class="ebar"><div class="efill ${cls}" id="ef-${k}" style="width:0;background:${col}"></div></div><div class="esc" style="color:${col}">${v}</div></div>`;
  }).join('');
  setTimeout(() => { Object.entries(sec).forEach(([k, v]) => { const e = $('ef-' + k); if (e) e.style.width = v + '%'; }); }, 300);
}
function rSkills(sk, gap) {
  if (!sk) return;
  $('sk-t').innerHTML = (sk.technical || []).length ? sk.technical.map((s) => `<span class="bdg bt">${esc(s)}</span>`).join('') : '<span style="color:var(--t3);font-size:13px">No technical skills detected in resume text</span>';
  $('sk-s').innerHTML = (sk.soft || []).map((s) => `<span class="bdg bs">${esc(s)}</span>`).join('') || '<span style="color:var(--t3);font-size:13px">No soft skills detected</span>';
  $('sk-to').innerHTML = (sk.tools || []).map((s) => `<span class="bdg bo">${esc(s)}</span>`).join('') || '<span style="color:var(--t3);font-size:13px">No tools detected</span>';
  $('sk-f').innerHTML = (sk.frameworks || []).map((s) => `<span class="bdg bo">${esc(s)}</span>`).join('') || '<span style="color:var(--t3);font-size:13px">No frameworks detected</span>';
  if (gap) {
    $('gap-m').innerHTML = (gap.missing || []).map((s) => `<span class="bdg bm">${esc(s)}</span>`).join('');
    $('gap-c').textContent = gap.industry_comparison;
    $('gap-p').innerHTML = (gap.priority || []).map((s) => `<span class="bdg bt">${esc(s)}</span>`).join('');
  }
}
function rProblems(probs) {
  if (!probs || !probs.length) { $('r-prob').innerHTML = '<div class="iban"><span>✅</span>No major problems detected! Your resume looks strong.</div>'; return; }
  $('r-prob').innerHTML = probs.map((p) => `<div class="pcard"><div class="p-head"><span class="p-ico">${p.icon}</span><span class="p-t">${esc(p.title)}</span></div><div class="p-imp">⚡ Impact: ${esc(p.impact)}</div><div class="p-sol">✅ Fix: ${esc(p.solution)}</div></div>`).join('');
}
function rSuggestions(sug) {
  if (!sug) return;
  $('r-sug').innerHTML = sug.map((s) => `<div class="sgcard"><div class="sg-type">${esc(s.type)}</div><div class="sg-l">❌ Before:</div><div class="sg-b">"${esc(s.original)}"</div><div class="sg-l" style="margin-top:7px">✅ After:</div><div class="sg-a">"${esc(s.improved)}"</div></div>`).join('');
}
function rRoles(roles) {
  if (!roles || !roles.length) return;
  $('r-roles').innerHTML = roles.map((r) => `<div class="rcard"><div class="r-ico">${r.icon}</div><div class="r-info"><div class="r-t">${esc(r.title)}</div><div class="r-d">${esc(r.description)}</div><div class="r-bar"><div class="r-fill" id="rf-${r.title.replace(/\W/g, '')}" style="width:0"></div></div></div><div class="r-pct">${r.confidence}%</div></div>`).join('');
  setTimeout(() => { roles.forEach((r) => { const e = $('rf-' + r.title.replace(/\W/g, '')); if (e) e.style.width = r.confidence + '%'; }); }, 200);
}
function rCareer(c) {
  if (!c) return;
  $('cr-r').innerHTML = (c.recommendations || []).map((r) => `<div style="display:flex;gap:8px;align-items:flex-start;padding:9px 11px;background:var(--bg3);border:1px solid var(--br2);border-radius:8px;margin-bottom:6px"><span style="color:var(--a);flex-shrink:0">✦</span><span style="font-size:13px;line-height:1.5">${esc(r)}</span></div>`).join('');
  $('cr-i').innerHTML = (c.industries || []).map((i) => `<span class="bdg bt">${esc(i)}</span>`).join('');
  $('cr-g').innerHTML = (c.growth_opportunities || []).map((g) => `<div style="padding:8px 12px;background:var(--bg3);border:1px solid var(--br2);border-radius:8px;font-size:13px;margin-bottom:6px;line-height:1.5">🌱 ${esc(g)}</div>`).join('');
}
function rRoadmap(rm) {
  if (!rm) return;
  $('r-road').innerHTML = rm.map((r) => `<div class="rm-item"><div class="rm-dot"></div><div class="rm-p">${esc(r.period)}</div><div class="rm-t">${esc(r.title)}</div><div class="rm-tags">${(r.items || []).map((i) => `<span class="rm-tag">${esc(i)}</span>`).join('')}</div></div>`).join('');
}
function rResources(res) {
  if (!res) return;
  $('r-res').innerHTML = res.map((r) => `<div class="rescard"><div class="res-ico">${r.icon}</div><div style="flex:1"><div class="res-n">${esc(r.skill)}</div><div class="res-d">${esc(r.desc)}</div><div class="res-ls">${(r.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="res-l">🔗 ${esc(l.name)}</a>`).join('')}</div></div></div>`).join('');
}
function rYT(yt) {
  if (!yt) return;
  $('r-yt').innerHTML = yt.map((v) => `<div class="ytcard"><div class="yt-th">${v.thumb}</div><div class="yt-in"><div class="yt-t">${esc(v.skill)}</div><div class="yt-ch"><span class="yt-b">YT</span>${esc(v.channel)} · ${esc(v.duration)}</div></div><a href="${esc(v.url)}" target="_blank" rel="noopener" class="yt-w">▶ Watch on YouTube</a></div>`).join('');
}
function rProjects(proj) {
  if (!proj) return;
  const mk = (p, lbl, cls) => `<div class="prcard"><div class="pr-lv ${cls}">${lbl}</div><div class="pr-t">${esc(p.title)}</div><div class="pr-d">${esc(p.desc)}</div><div class="pr-sk">${(p.skills || []).map((s) => `<span class="pr-s">${esc(s)}</span>`).join('')}</div></div>`;
  $('pr-b').innerHTML = (proj.beginner || []).map((p) => mk(p, 'Beginner', 'lvb')).join('');
  $('pr-i').innerHTML = (proj.intermediate || []).map((p) => mk(p, 'Intermediate', 'lvi')).join('');
  $('pr-a').innerHTML = (proj.advanced || []).map((p) => mk(p, 'Advanced', 'lva')).join('');
}
function rCerts(certs) {
  if (!certs) return;
  $('r-cert').innerHTML = `
    <div style="margin-bottom:18px">
      <h3 style="font-size:16px;font-weight:700;color:var(--t);margin-bottom:4px">🏆 Recommended Certificates</h3>
      <p style="font-size:13px;color:var(--t3)">AI-curated certifications based on your skill gaps and target career path</p>
    </div>
  ` + certs.map((c) => `
    <div class="ccard" style="background:linear-gradient(135deg,rgba(56,189,248,.08),rgba(52,224,199,.04));border:1px solid rgba(56,189,248,.2);border-radius:14px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;transition:all .2s;cursor:default" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='rgba(56,189,248,.45)'" onmouseout="this.style.transform='';this.style.borderColor='rgba(56,189,248,.2)'">
      <div class="c-ico" style="font-size:28px;flex-shrink:0;margin-top:2px">${c.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="c-n" style="font-size:14.5px;font-weight:700;color:var(--t);margin-bottom:3px">${esc(c.name)}</div>
        <div class="c-p" style="font-size:12.5px;color:var(--p);font-weight:600;margin-bottom:8px">${esc(c.provider)}</div>
        <div class="c-m" style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="c-mi" style="background:rgba(52,224,199,.1);border:1px solid rgba(52,224,199,.2);color:var(--a);padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:600">💰 ${esc(c.cost)}</span>
          <span class="c-mi" style="background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.2);color:var(--p);padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:600">⏱️ ${esc(c.duration)}</span>
        </div>
      </div>
    </div>`).join('');
}

/* ── Portfolio template picker ── */
function selectPfTemplate(tpl) {
  S.pfTemplate = tpl;
  document.querySelectorAll('.pf-tpl-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.tpl === tpl);
  });
  if (S.data) rPortfolio(S.data.portfolio, S.data.parsed);
}

/* ── Portfolio preview (inside dashboard) + downloadable HTML builder ── */
function rPortfolio(port, parsed) {
  const raw = S.txt || '';
  let name = '';
  const rawLines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 60);
  for (const line of rawLines.slice(0, 10)) {
    if (/^[A-Za-z][A-Za-z\s\.\-]{2,50}$/.test(line) &&
        !/resume|curriculum|vitae|objective|summary|education|experience|skill|project|certif|contact|email|phone|address|linkedin|github|portfolio|university|college|engineer|developer|analyst|manager|intern|bachelor|master|b\.tech|m\.tech/i.test(line)) {
      name = line.trim();
      break;
    }
  }
  if (!name) {
    const nm = raw.match(/(?:^|\n)\s*(?:name|full name)\s*[:\-]\s*([A-Za-z][A-Za-z\s\.]{2,40})/im);
    if (nm) name = nm[1].trim();
  }
  if (!name) {
    const emailM = raw.match(/([a-zA-Z0-9._%+\-]+)@/);
    if (emailM) {
      const prefix = emailM[1].replace(/[^a-zA-Z]/g, '').trim();
      if (prefix.length > 2) name = formatNameFromEmailPrefix(prefix);
    }
  }
  if (!name || /^your name$/i.test(name)) name = parsed?.name || port?.name || '';

  let title = '';
  if (S.data?.job_roles?.[0]?.confidence > 30) title = S.data.job_roles[0].title;
  if (!title) title = parsed?.experience?.[0]?.title || port?.title || 'Software Engineer';

  const emailM = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const email = emailM ? emailM[0] : (parsed?.email || port?.email || '');

  const githubM = raw.match(/github\.com\/([a-zA-Z0-9\-_]+)/i);
  const linkedinM = raw.match(/linkedin\.com\/in\/([a-zA-Z0-9\-_]+)/i);
  const github = githubM ? 'github.com/' + githubM[1] : (port?.github || '');
  const linkedin = linkedinM ? 'linkedin.com/in/' + linkedinM[1] : (port?.linkedin || '');

  const skills = S.data?.skills?.technical || parsed?.skills || [];
  const projects = parsed?.projects || [];

  const techList = skills.slice(0, 3).join(', ') || 'modern technologies';
  const yrsM = raw.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i);
  const yrs = yrsM ? yrsM[1] : '1';
  const summary = port?.summary || `${yrs}+ year${+yrs > 1 ? 's' : ''} of experience as a ${title} specializing in ${techList}. Passionate about building scalable, production-ready applications with clean code.`;

  $('pf-n').textContent = name || '—';
  $('pf-r').textContent = title;
  const pfHTML = buildPF({ name: name || 'Your Name', title, summary, skills, projects, email, github, linkedin }, S.pfTemplate);
  const pfBody = $('pf-body');
  pfBody.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.id = 'pf-frame';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.setAttribute('title', 'Portfolio website preview');
  pfBody.appendChild(iframe);
  iframe.srcdoc = pfHTML;
}

function buildPF(d, tpl) {
  switch (tpl) {
    case 't2': return buildPF2(d);
    case 't3': return buildPF3(d);
    case 't4': return buildPF4(d);
    case 't5': return buildPF5(d);
    default: return buildPF1(d);
  }
}

/* ── Template 1: "Midnight Hero" — dark navy/blue hero landing page ── */
function buildPF1(d) {
  const skillsHTML = d.skills.length
    ? d.skills.map((s) => `<div class="sk-card"><span>${esc(s)}</span></div>`).join('')
    : '<p style="color:#888">Upload your resume to see skills</p>';

  const projHTML = d.projects.length
    ? d.projects.map((p) => `
      <div class="proj-card">
        <div class="proj-img"><span>${p.name ? p.name[0] : 'P'}</span></div>
        <div class="proj-info">
          <div class="proj-name">${esc(p.name || 'Project')}</div>
          <div class="proj-desc">${esc(p.description || '')}</div>
          <div class="proj-tags">${(p.tech || []).map((t) => `<span class="ptag">${esc(t)}</span>`).join('')}</div>
          <a class="proj-link" href="#">Check it Out →</a>
        </div>
      </div>`).join('')
    : `<div class="proj-card"><div class="proj-img"><span>P</span></div><div class="proj-info"><div class="proj-name">Your Projects</div><div class="proj-desc">Projects from your resume will appear here.</div></div></div>`;

  const summaryPoints = d.summary
    ? d.summary.split('.').filter((s) => s.trim().length > 10).slice(0, 4).map((s) => `<li>${esc(s.trim())}</li>`).join('')
    : '<li>Passionate about building scalable applications</li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.name)} — Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--dark:#0a0a0a;--dark2:#111;--dark3:#1a1a1a;--blue:#2563eb;--blue2:#1d4ed8;--text:#e5e7eb;--muted:#9ca3af;--border:rgba(255,255,255,.08)}
html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--dark);color:var(--text);overflow-x:hidden}
nav{position:fixed;top:0;left:0;right:0;z-index:1000;display:flex;align-items:center;justify-content:space-between;padding:18px 60px;background:rgba(10,10,10,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
.nav-brand{font-family:'Poppins',sans-serif;font-size:18px;font-weight:800;letter-spacing:1px;color:#fff;text-transform:uppercase}
.nav-links{display:flex;gap:32px;list-style:none}
.nav-links a{color:var(--muted);font-size:13px;font-weight:500;text-decoration:none;letter-spacing:.5px;text-transform:uppercase;transition:color .2s}
.nav-links a:hover{color:#fff}
.nav-hire{padding:9px 24px;background:var(--blue);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;letter-spacing:.3px;transition:background .2s}
.nav-hire:hover{background:var(--blue2)}
#hero{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:100px 60px 60px;gap:40px;background:var(--dark);position:relative;overflow:hidden}
#hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 60% 70% at 30% 50%,rgba(37,99,235,.06) 0%,transparent 70%)}
.hero-left{position:relative;z-index:1}
.hero-label{font-size:12px;font-weight:600;color:var(--blue);letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
.hero-hello{font-family:'Poppins',sans-serif;font-size:clamp(36px,4.5vw,64px);font-weight:900;line-height:1.05;color:#fff;margin-bottom:8px}
.hero-hello em{color:var(--blue);font-style:normal}
.hero-role{font-size:17px;font-weight:600;color:var(--blue);text-transform:uppercase;letter-spacing:2px;margin-bottom:22px}
.hero-desc{font-size:14.5px;color:var(--muted);line-height:1.85;max-width:460px;margin-bottom:32px}
.hero-btns{display:flex;gap:14px;flex-wrap:wrap}
.btn-hire{padding:13px 30px;background:var(--blue);color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .2s}
.btn-hire:hover{background:var(--blue2);transform:translateY(-1px)}
.btn-cv{padding:13px 30px;background:transparent;border:2px solid rgba(255,255,255,.2);color:#fff;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center}
.btn-cv:hover{border-color:rgba(255,255,255,.5)}
.hero-right{display:flex;justify-content:center;align-items:center;position:relative;z-index:1}
.hero-img-wrap{position:relative;width:340px;height:400px}
.hero-img-bg{position:absolute;inset:0;background:linear-gradient(135deg,rgba(37,99,235,.15),rgba(37,99,235,.05));border-radius:12px;border:1px solid rgba(37,99,235,.2)}
.hero-avatar{width:100%;height:100%;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;z-index:1}
.avatar-placeholder{width:100%;height:100%;background:linear-gradient(160deg,#1a1a2e,#16213e,#0f3460);display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px}
.avatar-circle{width:110px;height:110px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:42px;font-weight:900;color:#fff;margin-bottom:16px;box-shadow:0 0 40px rgba(37,99,235,.4)}
.avatar-name-tag{font-family:'Poppins',sans-serif;font-size:16px;font-weight:700;color:#fff;letter-spacing:.5px}
.avatar-role-tag{font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;text-align:center;padding:0 20px}
.hero-badge{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);background:var(--blue);color:#fff;padding:8px 20px;border-radius:30px;font-size:11.5px;font-weight:700;letter-spacing:.5px;white-space:nowrap;box-shadow:0 4px 20px rgba(37,99,235,.5)}
#about{background:var(--dark2);padding:90px 60px}
.about-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1.4fr;gap:60px;align-items:center}
.about-photo{width:100%;max-width:340px;aspect-ratio:3/4;border-radius:12px;background:linear-gradient(160deg,#1a1a2e,#16213e,#0f3460);display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border)}
.about-photo-inner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100%}
.about-avatar-big{width:130px;height:130px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:52px;font-weight:900;color:#fff;box-shadow:0 0 50px rgba(37,99,235,.35)}
.about-text-side h2{font-family:'Poppins',sans-serif;font-size:13px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px}
.about-text-side h3{font-family:'Poppins',sans-serif;font-size:30px;font-weight:800;color:#fff;margin-bottom:20px;line-height:1.2}
.about-hi{font-family:'Poppins',sans-serif;font-size:20px;font-weight:700;color:#fff;margin-bottom:16px}
.about-points{list-style:none;display:flex;flex-direction:column;gap:10px}
.about-points li{display:flex;align-items:flex-start;gap:10px;font-size:14px;color:var(--muted);line-height:1.6}
.about-points li::before{content:'▸';color:var(--blue);flex-shrink:0;margin-top:1px}
.about-contact{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
.ac-link{padding:9px 20px;border:1px solid var(--border);border-radius:7px;color:var(--muted);font-size:12.5px;font-weight:600;text-decoration:none;transition:all .2s;display:inline-flex;align-items:center;gap:6px}
.ac-link:hover{border-color:var(--blue);color:var(--blue)}
.sec-wrap{max-width:1100px;margin:0 auto}
.sec-label{font-size:12px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;text-align:center}
.sec-title{font-family:'Poppins',sans-serif;font-size:clamp(24px,3vw,36px);font-weight:800;color:#fff;text-align:center;margin-bottom:48px}
#skills{padding:80px 60px;background:var(--dark)}
.sk-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.sk-card{background:var(--dark3);border:1px solid var(--border);border-radius:10px;padding:12px 22px;font-size:14px;font-weight:600;color:var(--text);transition:all .2s;cursor:default}
.sk-card:hover{border-color:var(--blue);color:var(--blue);transform:translateY(-2px);background:rgba(37,99,235,.06)}
#projects{padding:80px 60px;background:var(--dark2)}
.proj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.proj-card{background:var(--dark3);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:all .25s}
.proj-card:hover{transform:translateY(-5px);border-color:rgba(37,99,235,.3);box-shadow:0 16px 40px rgba(0,0,0,.4)}
.proj-img{height:160px;background:linear-gradient(135deg,#1e1b4b,#1e3a5f,#1a1a2e);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:52px;font-weight:900;color:rgba(37,99,235,.6)}
.proj-info{padding:20px}
.proj-name{font-family:'Poppins',sans-serif;font-size:16px;font-weight:700;color:#fff;margin-bottom:8px}
.proj-desc{font-size:13px;color:var(--muted);line-height:1.65;margin-bottom:12px}
.proj-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.ptag{background:rgba(37,99,235,.12);border:1px solid rgba(37,99,235,.25);color:#93c5fd;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace}
.proj-link{color:var(--blue);font-size:13px;font-weight:600;text-decoration:none;transition:color .2s}
.proj-link:hover{color:#93c5fd}
#contact{padding:80px 60px;background:var(--dark);text-align:center}
.contact-box{max-width:560px;margin:0 auto}
.contact-box p{font-size:15px;color:var(--muted);line-height:1.8;margin-bottom:28px}
.contact-email{font-family:'Poppins',sans-serif;font-size:22px;font-weight:800;color:var(--blue);margin-bottom:24px}
.contact-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.c-btn{padding:11px 24px;background:var(--dark3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13.5px;font-weight:600;text-decoration:none;transition:all .2s}
.c-btn:hover{border-color:var(--blue);color:var(--blue)}
.c-btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.c-btn.primary:hover{background:var(--blue2)}
footer{padding:24px 60px;background:#050505;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.footer-l{font-size:12px;color:rgba(255,255,255,.3)}
.footer-r{font-size:12px;color:rgba(255,255,255,.3)}
@media(max-width:900px){
  nav{padding:14px 24px}
  .nav-links{display:none}
  #hero{grid-template-columns:1fr;padding:100px 24px 60px;text-align:center}
  .hero-right{display:none}
  .hero-btns{justify-content:center}
  .about-inner{grid-template-columns:1fr;gap:32px}
  .about-photo{max-width:200px;margin:0 auto}
  #about,#skills,#projects,#contact{padding:60px 24px}
  footer{flex-direction:column;gap:8px;text-align:center;padding:20px 24px}
}
@media(max-width:500px){
  .hero-hello{font-size:32px}
  .proj-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<nav>
  <div class="nav-brand">${esc(d.name)}</div>
  <ul class="nav-links">
    <li><a href="#about">About</a></li>
    <li><a href="#skills">Skills</a></li>
    <li><a href="#projects">Projects</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
  <button class="nav-hire" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">Hire Me</button>
</nav>
<section id="hero">
  <div class="hero-left">
    <div class="hero-label">✦ Portfolio</div>
    <h1 class="hero-hello">Hello, I'm<br><em>${esc(d.name)}</em></h1>
    <div class="hero-role">${esc(d.title)}</div>
    <p class="hero-desc">${esc(d.summary)}</p>
    <div class="hero-btns">
      <button class="btn-hire" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">Hire Me</button>
      <button class="btn-cv" onclick="window.print()">Download CV</button>
    </div>
  </div>
  <div class="hero-right">
    <div class="hero-img-wrap">
      <div class="hero-img-bg"></div>
      <div class="hero-avatar">
        <div class="avatar-placeholder">
          <div class="avatar-circle">${esc(d.name[0] || '?')}</div>
          <div class="avatar-name-tag">${esc(d.name)}</div>
          <div class="avatar-role-tag">${esc(d.title)}</div>
        </div>
      </div>
      <div class="hero-badge">✦ Open to Opportunities</div>
    </div>
  </div>
</section>
<section id="about">
  <div class="about-inner">
    <div>
      <div class="about-photo">
        <div class="about-photo-inner">
          <div class="about-avatar-big">${esc(d.name[0] || '?')}</div>
          <div style="font-family:'Poppins',sans-serif;font-size:15px;font-weight:700;color:#fff;margin-top:4px">${esc(d.name)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:3px">${esc(d.title)}</div>
        </div>
      </div>
    </div>
    <div class="about-text-side">
      <h2>About Me</h2>
      <div class="about-hi">HI THERE 👋</div>
      <p style="font-size:13.5px;color:var(--muted);margin-bottom:16px">I AM A <strong style="color:#fff">${esc(d.title.toUpperCase())}</strong> WHO:</p>
      <ul class="about-points">
        ${summaryPoints}
        ${d.email ? `<li>Can be reached at <strong style="color:#fff">${esc(d.email)}</strong></li>` : ''}
      </ul>
      <div class="about-contact">
        ${d.email ? `<a href="mailto:${esc(d.email)}" class="ac-link">📧 Email Me</a>` : ''}
        ${d.github ? `<a href="https://${esc(d.github)}" target="_blank" class="ac-link">💻 GitHub</a>` : ''}
        ${d.linkedin ? `<a href="https://${esc(d.linkedin)}" target="_blank" class="ac-link">💼 LinkedIn</a>` : ''}
      </div>
    </div>
  </div>
</section>
<section id="skills">
  <div class="sec-wrap">
    <div class="sec-label">What I Know</div>
    <div class="sec-title">My Skills</div>
    <div class="sk-grid">${skillsHTML}</div>
  </div>
</section>
<section id="projects">
  <div class="sec-wrap">
    <div class="sec-label">What I've Built</div>
    <div class="sec-title">Some of my Recent Projects</div>
    <div class="proj-grid">${projHTML}</div>
  </div>
</section>
<section id="contact">
  <div class="sec-wrap">
    <div class="sec-label">Get In Touch</div>
    <div class="sec-title">Contact Me</div>
    <div class="contact-box">
      <p>I'm currently open to new opportunities. Whether you have a question or just want to say hi — I'll get back to you!</p>
      ${d.email ? `<div class="contact-email">✉ ${esc(d.email)}</div>` : ''}
      <div class="contact-btns">
        ${d.email ? `<a href="mailto:${esc(d.email)}" class="c-btn primary">📧 Send Email</a>` : ''}
        ${d.github ? `<a href="https://${esc(d.github)}" target="_blank" class="c-btn">💻 GitHub</a>` : ''}
        ${d.linkedin ? `<a href="https://${esc(d.linkedin)}" target="_blank" class="c-btn">💼 LinkedIn</a>` : ''}
      </div>
    </div>
  </div>
</section>
<footer>
  <div class="footer-l">© ${new Date().getFullYear()} ${esc(d.name)} · ${esc(d.title)}</div>
  <div class="footer-r">Generated by ResumeAI ✦</div>
</footer>
</body>
</html>`;
}

/* ── Template 2: "App Shell" — teal/violet tabbed single-card shell ── */
function buildPF2(d) {
  const initials = (d.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const skillsHTML = d.skills.length
    ? d.skills.map((s) => `<span class="badge">${esc(s)}</span>`).join('')
    : '<span class="muted">Upload your resume to see skills</span>';
  const projHTML = d.projects.length
    ? d.projects.map((p) => `
      <div class="proj">
        <h3>${esc(p.name || 'Project')}</h3>
        <p>${esc(p.description || '')}</p>
        <div class="tags">${(p.tech || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('')}</div>
      </div>`).join('')
    : '<div class="proj"><h3>Your Projects</h3><p>Projects from your resume will appear here.</p></div>';
  const points = d.summary
    ? d.summary.split('.').filter((s) => s.trim().length > 10).slice(0, 4).map((s) => `<li><span class="dot"></span>${esc(s.trim())}</li>`).join('')
    : '<li><span class="dot"></span>Passionate about building scalable applications</li>';
  const socials = `${d.email ? `<a class="soc" href="mailto:${esc(d.email)}">✉</a>` : ''}${d.github ? `<a class="soc" href="https://${esc(d.github)}" target="_blank">⌥</a>` : ''}${d.linkedin ? `<a class="soc" href="https://${esc(d.linkedin)}" target="_blank">in</a>` : ''}`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.name)} — Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0b0f14;--card:#121822;--teal:#14b8a6;--violet:#8b5cf6;--text:#e6edf3;--muted:#8b98a8;--border:rgba(255,255,255,.08)}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:48px 20px}
.wrap{max-width:900px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.name{font-family:'Poppins',sans-serif;font-weight:800;font-size:26px}
.role{color:var(--teal);font-weight:600;font-size:14px;margin-top:2px}
.card{background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden}
.nav{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:10px}
.tabs{display:flex;gap:6px}
.tab{background:transparent;border:none;color:var(--muted);font-weight:700;font-size:12px;letter-spacing:.5px;padding:8px 14px;border-radius:9px;cursor:pointer;font-family:'Inter',sans-serif}
.tab.active{background:linear-gradient(135deg,var(--teal),var(--violet));color:#fff}
.soc{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.06);display:inline-flex;align-items:center;justify-content:center;color:var(--text);text-decoration:none;font-size:13px}
.panel{padding:28px 22px}
.tabpanel{display:none}
.tabpanel.active{display:block}
.about-grid{display:grid;grid-template-columns:160px 1fr;gap:26px;align-items:start}
.avatar{width:130px;height:130px;border-radius:22px;background:linear-gradient(135deg,var(--teal),var(--violet));display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:44px;font-weight:800;color:#fff}
.hi{color:var(--muted);font-size:13px;margin-bottom:8px}
.intro{font-size:15px;margin-bottom:14px}
.bio{list-style:none;display:flex;flex-direction:column;gap:9px;margin-bottom:14px}
.bio li{display:flex;align-items:flex-start;gap:9px;font-size:13.5px;color:var(--muted)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--teal);margin-top:6px;flex-shrink:0}
.email-link{color:var(--teal);text-decoration:none;font-size:13.5px;font-weight:600}
h2{font-family:'Poppins',sans-serif;font-size:15px;margin:0 0 12px;color:#fff}
section+section{margin-top:24px}
.badge{display:inline-block;padding:5px 11px;border-radius:20px;background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.3);color:var(--teal);font-size:12px;font-weight:600;margin:0 6px 6px 0}
.proj{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px}
.proj h3{font-size:14.5px;margin-bottom:6px}
.proj p{font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.6}
.muted{color:var(--muted);font-size:13px}
.foot{text-align:center;margin-top:20px;font-size:11.5px;color:var(--muted)}
@media(max-width:600px){.about-grid{grid-template-columns:1fr;text-align:center}.avatar{margin:0 auto}}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div><div class="name">${esc(d.name)}</div><div class="role">${esc(d.title)}</div></div>
  </div>
  <div class="card">
    <div class="nav">
      <div class="tabs">
        <button class="tab active" data-tab="about">ABOUT ME</button>
        <button class="tab" data-tab="cv">CV</button>
        <button class="tab" data-tab="projects">PROJECTS</button>
      </div>
      <div>${socials}</div>
    </div>
    <div class="panel">
      <div class="tabpanel active" data-panel="about">
        <div class="about-grid">
          <div class="avatar">${esc((d.name || '?')[0] || '?')}</div>
          <div>
            <div class="hi">Hi there 👋</div>
            <div class="intro">I'm a <strong>${esc(d.title)}</strong> who:</div>
            <ul class="bio">${points}</ul>
            ${d.email ? `<a class="email-link" href="mailto:${esc(d.email)}">✉ ${esc(d.email)}</a>` : ''}
          </div>
        </div>
      </div>
      <div class="tabpanel" data-panel="cv">
        <section><h2>Skills</h2>${skillsHTML}</section>
        <section><h2>Summary</h2><p class="muted" style="line-height:1.7">${esc(d.summary)}</p></section>
      </div>
      <div class="tabpanel" data-panel="projects">
        <h2>Projects</h2>
        ${projHTML}
      </div>
    </div>
  </div>
  <div class="foot">Built with ResumeAI · Template: App Shell</div>
</div>
<script>
document.querySelectorAll('.tab').forEach(function(tab){
  tab.addEventListener('click', function(){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
    document.querySelectorAll('.tabpanel').forEach(function(p){p.classList.remove('active')});
    tab.classList.add('active');
    document.querySelector('.tabpanel[data-panel="' + tab.dataset.tab + '"]').classList.add('active');
  });
});
</script>
</body></html>`;
}

/* ── Template 3: "Editorial" — warm amber/coral long-form scroll ── */
function buildPF3(d) {
  const skillsHTML = d.skills.length
    ? d.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')
    : '<span class="muted">Upload your resume to see skills</span>';
  const projHTML = d.projects.length
    ? d.projects.map((p, i) => `
      <div class="entry">
        <div class="num">0${i + 1}</div>
        <div>
          <h3>${esc(p.name || 'Project')}</h3>
          <p>${esc(p.description || '')}</p>
          <div class="tags">${(p.tech || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
        </div>
      </div>`).join('')
    : '<div class="entry"><div class="num">01</div><div><h3>Your Projects</h3><p>Projects from your resume will appear here.</p></div></div>';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.name)} — Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#fdf6ec;--ink:#2b2117;--muted:#8a7a68;--amber:#e08a2e;--coral:#e0654a;--line:rgba(43,33,23,.12)}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--ink)}
.hero{padding:90px 8vw 60px;border-bottom:1px solid var(--line)}
.eyebrow{color:var(--coral);font-weight:700;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-bottom:16px}
h1{font-family:'Playfair Display',serif;font-size:clamp(38px,6vw,68px);font-weight:800;line-height:1.05;margin-bottom:16px}
.role{font-size:18px;color:var(--amber);font-weight:600;margin-bottom:18px}
.summary{max-width:620px;font-size:15.5px;line-height:1.85;color:var(--muted)}
.links{display:flex;gap:16px;margin-top:26px;flex-wrap:wrap}
.links a{color:var(--ink);text-decoration:none;font-weight:600;font-size:13.5px;border-bottom:2px solid var(--amber);padding-bottom:2px}
section{padding:60px 8vw;border-bottom:1px solid var(--line)}
.sec-label{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;margin-bottom:30px}
.chip{display:inline-block;padding:7px 15px;border:1px solid var(--line);border-radius:24px;font-size:12.5px;font-weight:600;margin:0 8px 8px 0;background:#fff}
.entry{display:grid;grid-template-columns:70px 1fr;gap:20px;padding:22px 0;border-bottom:1px solid var(--line)}
.entry:last-child{border-bottom:none}
.num{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:var(--amber)}
.entry h3{font-size:18px;margin-bottom:8px}
.entry p{font-size:13.5px;color:var(--muted);line-height:1.7;margin-bottom:10px}
.muted{color:var(--muted);font-size:13.5px}
footer{padding:36px 8vw;text-align:center;font-size:12px;color:var(--muted)}
@media(max-width:640px){.entry{grid-template-columns:1fr}}
</style></head><body>
<section class="hero">
  <div class="eyebrow">Portfolio</div>
  <h1>${esc(d.name)}</h1>
  <div class="role">${esc(d.title)}</div>
  <p class="summary">${esc(d.summary)}</p>
  <div class="links">
    ${d.email ? `<a href="mailto:${esc(d.email)}">Email</a>` : ''}
    ${d.github ? `<a href="https://${esc(d.github)}" target="_blank">GitHub</a>` : ''}
    ${d.linkedin ? `<a href="https://${esc(d.linkedin)}" target="_blank">LinkedIn</a>` : ''}
  </div>
</section>
<section>
  <div class="sec-label">Skills</div>
  ${skillsHTML}
</section>
<section>
  <div class="sec-label">Selected Work</div>
  ${projHTML}
</section>
<footer>© ${new Date().getFullYear()} ${esc(d.name)} · Built with ResumeAI · Template: Editorial</footer>
</body></html>`;
}

/* ── Template 4: "Minimal" — clean black & white resume-style layout ── */
function buildPF4(d) {
  const skillsHTML = d.skills.length
    ? d.skills.map((s) => `<li>${esc(s)}</li>`).join('')
    : '<li class="muted">Upload your resume to see skills</li>';
  const projHTML = d.projects.length
    ? d.projects.map((p) => `
      <div class="item">
        <div class="item-h"><strong>${esc(p.name || 'Project')}</strong></div>
        <p>${esc(p.description || '')}</p>
        <div class="tech">${(p.tech || []).join(' · ')}</div>
      </div>`).join('')
    : '<div class="item"><div class="item-h"><strong>Your Projects</strong></div><p>Projects from your resume will appear here.</p></div>';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.name)} — Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#fff;color:#111;line-height:1.5}
.wrap{max-width:760px;margin:0 auto;padding:70px 24px}
h1{font-size:34px;font-weight:800;letter-spacing:-.5px}
.role{font-size:15px;color:#555;margin-top:4px;font-weight:600}
.contact{margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:13px}
.contact a{color:#111;text-decoration:none;border-bottom:1px solid #ccc}
hr{border:none;border-top:2px solid #111;margin:34px 0 24px}
h2{font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
.summary{font-size:14px;color:#333;max-width:620px}
ul.skills{list-style:none;display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
ul.skills li{font-size:13px;padding:6px 12px;border:1px solid #ddd;border-radius:4px}
.item{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #eee}
.item:last-child{border-bottom:none}
.item p{font-size:13.5px;color:#444;margin:6px 0}
.tech{font-size:12px;color:#888;font-weight:600}
.muted{color:#999}
footer{margin-top:50px;font-size:11.5px;color:#999;text-align:center}
</style></head><body>
<div class="wrap">
  <h1>${esc(d.name)}</h1>
  <div class="role">${esc(d.title)}</div>
  <div class="contact">
    ${d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : ''}
    ${d.github ? `<a href="https://${esc(d.github)}" target="_blank">${esc(d.github)}</a>` : ''}
    ${d.linkedin ? `<a href="https://${esc(d.linkedin)}" target="_blank">${esc(d.linkedin)}</a>` : ''}
  </div>
  <hr>
  <h2>Summary</h2>
  <p class="summary">${esc(d.summary)}</p>
  <hr>
  <h2>Skills</h2>
  <ul class="skills">${skillsHTML}</ul>
  <hr>
  <h2>Projects</h2>
  ${projHTML}
  <footer>Built with ResumeAI · Template: Minimal</footer>
</div>
</body></html>`;
}

/* ── Template 5: "Vivid Grid" — colorful gradient card-grid dashboard ── */
function buildPF5(d) {
  const skillsHTML = d.skills.length
    ? d.skills.map((s) => `<span class="pill">${esc(s)}</span>`).join('')
    : '<span class="muted">Upload your resume to see skills</span>';
  const projHTML = d.projects.length
    ? d.projects.map((p, i) => {
        const colors = ['g1', 'g2', 'g3', 'g4'];
        return `
      <div class="pcard ${colors[i % colors.length]}">
        <h3>${esc(p.name || 'Project')}</h3>
        <p>${esc(p.description || '')}</p>
        <div class="tags">${(p.tech || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>`;
      }).join('')
    : '<div class="pcard g1"><h3>Your Projects</h3><p>Projects from your resume will appear here.</p></div>';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.name)} — Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0f0a1a;color:#fff}
.wrap{max-width:1000px;margin:0 auto;padding:60px 24px}
.hero{background:linear-gradient(135deg,#ec4899,#8b5cf6 55%,#06b6d4);border-radius:26px;padding:50px 40px;margin-bottom:30px;position:relative;overflow:hidden}
.hero h1{font-family:'Poppins',sans-serif;font-size:clamp(30px,5vw,48px);font-weight:900;margin-bottom:8px}
.hero .role{font-size:15px;font-weight:600;opacity:.9;margin-bottom:16px}
.hero p{max-width:560px;font-size:14px;line-height:1.7;opacity:.95}
.links{margin-top:22px;display:flex;gap:12px;flex-wrap:wrap}
.links a{background:rgba(255,255,255,.18);backdrop-filter:blur(4px);padding:9px 18px;border-radius:30px;color:#fff;text-decoration:none;font-size:13px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:30px}
.card{background:#171126;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px}
.card h2{font-family:'Poppins',sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;color:#c4b5fd}
.pill{display:inline-block;background:rgba(139,92,246,.18);border:1px solid rgba(139,92,246,.4);color:#c4b5fd;padding:6px 13px;border-radius:20px;font-size:12px;font-weight:700;margin:0 6px 6px 0}
.muted{color:#8a80a0;font-size:13px}
.pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.pcard{border-radius:18px;padding:22px;color:#fff}
.pcard h3{font-family:'Poppins',sans-serif;font-size:16px;margin-bottom:8px}
.pcard p{font-size:12.5px;opacity:.9;line-height:1.6;margin-bottom:12px}
.tag{display:inline-block;background:rgba(255,255,255,.2);padding:4px 10px;border-radius:14px;font-size:11px;font-weight:700;margin:0 5px 5px 0}
.g1{background:linear-gradient(135deg,#ec4899,#f97316)}
.g2{background:linear-gradient(135deg,#8b5cf6,#6366f1)}
.g3{background:linear-gradient(135deg,#06b6d4,#3b82f6)}
.g4{background:linear-gradient(135deg,#10b981,#06b6d4)}
footer{text-align:center;margin-top:36px;font-size:11.5px;color:#8a80a0}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <h1>${esc(d.name)}</h1>
    <div class="role">${esc(d.title)}</div>
    <p>${esc(d.summary)}</p>
    <div class="links">
      ${d.email ? `<a href="mailto:${esc(d.email)}">✉ Email</a>` : ''}
      ${d.github ? `<a href="https://${esc(d.github)}" target="_blank">⌥ GitHub</a>` : ''}
      ${d.linkedin ? `<a href="https://${esc(d.linkedin)}" target="_blank">in LinkedIn</a>` : ''}
    </div>
  </div>
  <div class="grid">
    <div class="card"><h2>Skills</h2>${skillsHTML}</div>
  </div>
  <div class="pgrid">${projHTML}</div>
  <footer>Built with ResumeAI · Template: Vivid Grid</footer>
</div>
</body></html>`;
}

function dlPortfolio() {
  if (!S.data) { toast('Please upload and analyze a resume first.', 'err'); return; }
  const d = S.data;
  const raw = S.txt || '';

  let name = '';
  const rawLines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 60);
  for (const line of rawLines) {
    if (/^[A-Za-z][A-Za-z\s\.]{2,40}$/.test(line) &&
        !/resume|curriculum|vitae|objective|summary|education|experience|skill|project|certif|contact|email|phone|address|linkedin|github|portfolio|university|college|engineer|developer|analyst|manager|intern|bachelor|master|b\.tech|m\.tech/i.test(line)) {
      name = line.trim();
      break;
    }
  }
  if (!name || /^your name$/i.test(name)) name = d.parsed?.name || d.portfolio?.name || '';
  if (!name || /^your name$/i.test(name)) name = 'Portfolio';

  const emailM = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const githubM = raw.match(/github\.com\/([a-zA-Z0-9\-_]+)/i);
  const linkedinM = raw.match(/linkedin\.com\/in\/([a-zA-Z0-9\-_]+)/i);

  const title = (d.job_roles?.[0]?.confidence > 30 ? d.job_roles[0].title : null) || d.portfolio?.title || d.parsed?.experience?.[0]?.title || 'Software Engineer';
  const skills = d.skills?.technical || d.parsed?.skills || [];
  const techList = skills.slice(0, 3).join(', ') || 'modern technologies';
  const yrsM = raw.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i);
  const yrs = yrsM ? yrsM[1] : '1';

  const html = buildPF({
    name, title,
    summary: d.portfolio?.summary || `${yrs}+ year${+yrs > 1 ? 's' : ''} of experience as a ${title} specializing in ${techList}. Passionate about building scalable, production-ready applications.`,
    skills,
    projects: d.parsed?.projects || [],
    email: emailM ? emailM[0] : (d.parsed?.email || ''),
    github: githubM ? 'github.com/' + githubM[1] : (d.portfolio?.github || ''),
    linkedin: linkedinM ? 'linkedin.com/in/' + linkedinM[1] : (d.portfolio?.linkedin || ''),
  }, S.pfTemplate);
  const fname = name.replace(/[^a-zA-Z0-9]/g, '_') + '_Portfolio.html';
  dlFile(fname, html, 'text/html');
  toast('✅ Portfolio downloaded! Open the HTML file in any browser.', 'ok');
}

function dlReport() {
  if (!S.data) { toast('Please upload and analyze a resume first.', 'err'); return; }
  const d = S.data;
  const L = '─'.repeat(46);
  const lines = ['RESUME ANALYSIS REPORT — ResumeAI', '═'.repeat(46), '',
    `CANDIDATE : ${d.parsed?.name || 'N/A'}`, `EMAIL     : ${d.parsed?.email || 'N/A'}`, `PHONE     : ${d.parsed?.phone || 'N/A'}`, '',
    `ATS SCORE      : ${d.ats?.score || 0}/100  Grade: ${d.ats?.grade || '—'}`,
    `RESUME STRENGTH: ${d.strength?.score || 0}/100`,
    `SKILLS DETECTED: ${(d.skills?.technical || []).length}`,
    `MISSING SKILLS : ${d.skill_gap?.missing?.length || 0}`, '',
    L, 'DETECTED TECHNICAL SKILLS', L, (d.skills?.technical || []).join(', '), '',
    L, 'MISSING SKILLS (Learn These First)', L, (d.skill_gap?.missing || []).join(', '), '',
    d.skill_gap?.industry_comparison || '', '',
    L, 'PROBLEMS & FIXES', L, ...(d.problems || []).map((p) => `• ${p.title}\n  Impact: ${p.impact}\n  Fix: ${p.solution}`), '',
    L, 'JOB ROLE MATCHES', L, ...(d.job_roles || []).map((r) => `• ${r.title}: ${r.confidence}%`), '',
    L, 'ATS SUGGESTIONS', L, ...(d.ats?.suggestions || []).map((s) => `• ${s}`), '',
    L, 'CAREER RECOMMENDATIONS', L, ...(d.career_guidance?.recommendations || []).map((r) => `• ${r}`), '',
    L, 'ROADMAP', L, ...(d.roadmap || []).map((r) => `[${r.period}] ${r.title}\n  → ${(r.items || []).join(' | ')}`), '',
    '═'.repeat(46), 'Generated by ResumeAI', '═'.repeat(46)];
  dlFile('ResumeAI_Report.txt', lines.join('\n'), 'text/plain');
  toast('✅ Report downloaded!', 'ok');
}
function dlFile(name, content, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Tabs & Nav ── */
function setupTabs() {
  document.querySelectorAll('.tbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      const wrap = btn.closest('.twrap');
      wrap.querySelectorAll('.tbtn').forEach((b) => b.classList.remove('on'));
      wrap.querySelectorAll('.tpanel').forEach((p) => p.classList.remove('on'));
      btn.classList.add('on');
      const panel = $(target);
      if (panel) panel.classList.add('on');
    });
  });
}
function setupFeatureCards() {
  document.querySelectorAll('.fcard[data-tab]').forEach((card) => {
    card.addEventListener('click', () => {
      const target = card.dataset.tab;
      document.querySelectorAll('.tbtn').forEach((b) => { if (b.dataset.tab === target) b.click(); });
      $('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
function switchMobTab(tabId, btn) {
  document.querySelectorAll('.tbtn').forEach((b) => { if (b.dataset.tab === tabId) b.click(); });
  document.querySelectorAll('.mob-nav-btn').forEach((b) => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  $('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function resetUIAfterLogout() {
  const z = $('uzone');
  if (z) z.style.display = 'block';
  $('fbar')?.classList.remove('on');
  $('scanning')?.classList.remove('on');
  $('results')?.classList.remove('on');
  const fi = $('fi');
  if (fi) fi.value = '';
}

/* ── Dashboard sidebar nav (clicking a sidebar item jumps to the matching tab) ── */
function setupNav() {
  const items = document.querySelectorAll('.nitem[data-tab]');
  const mobBtns = document.querySelectorAll('.mob-nav-btn');

  function setActiveTab(tab) {
    items.forEach((i) => i.classList.toggle('on', i.dataset.tab === tab));
    mobBtns.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.tbtn').forEach((b) => { if (b.dataset.tab === tab) b.click(); });
    $('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  items.forEach((item) => {
    item.addEventListener('click', () => setActiveTab(item.dataset.tab));
  });
  mobBtns.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
}


/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  setupUploadDragDrop();
  setupTabs();
  setupNav();
  setupFeatureCards();
});
