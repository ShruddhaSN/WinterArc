// ---------- IndexedDB setup ----------
let db;
let dayOffset = null; // day-peek navigation state, relative to today (1 = tomorrow, -1 = yesterday, etc.)
const DB_NAME = "winterArcDB";
const STORE = "goals";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date", { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

// ---------- Date helpers: everything is a plain LOCAL calendar date (never UTC) ----------
function pad2(n) { return String(n).padStart(2, "0"); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// add n days to a "YYYY-MM-DD" string (pure calendar maths, no timezone involved)
function shiftDateStr(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// whole days from date a to date b
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// 0 = Sunday ... 6 = Saturday
function weekdayOf(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addGoalRecord(goal) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(goal);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// writes many goals in ONE transaction — all-or-nothing, so an interrupted refresh can't leave half a plan
function addManyGoalRecords(list) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    list.forEach((g) => store.add(g));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function updateGoalRecord(goal) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(goal);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

function getAllGoals() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ---------- Task descriptions (tap a goal to see what it actually means) ----------
const TASK_INFO = [
  ["screen check", "Screenshot your phone's screen-time summary at the end of the day as proof — no judgment either way, just visibility."],
  ["catch-up", "Whatever workout got skipped this week, do it now — or if nothing's pending, use this slot for a project/skill hour instead."],
  ["study", "20-30 min focused block — rotate between Java/Spring Boot, Korean, or sign language depending on what you feel like that day."],
  ["prep day", "Iron/lay out the week's outfits, handle laundry if it's due, and glance over what's coming up this week."],
  ["reflect", "A few lines: what felt like a win this week, what you skipped and why. No pressure to write a lot."],
  ["weigh-in", "One weekly weigh-in, same time of day if possible (e.g. first thing in the morning) for consistency."],
  ["protein", "Eggs, paneer, dal, curd/yogurt, chicken, or a protein shake — mix toward ~80g across the day, doesn't need to be exact."],
  ["walk", "Steady walk at a comfortable pace — outdoors, treadmill, or pacing indoors all count. Today's number is today's target, not a ceiling."],
];

function getTaskInfo(text) {
  const lower = text.toLowerCase();
  const match = TASK_INFO.find(([key]) => lower.includes(key.toLowerCase()));
  return match ? match[1] : null;
}

// ---------- Simple move illustrations (line-art, no external images needed) ----------
const EXERCISE_ICONS = {
  jumpingJack: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="11" x2="20" y2="24" stroke="currentColor" stroke-width="2"/><line x1="20" y1="14" x2="8" y2="6" stroke="currentColor" stroke-width="2"/><line x1="20" y1="14" x2="32" y2="6" stroke="currentColor" stroke-width="2"/><line x1="20" y1="24" x2="8" y2="36" stroke="currentColor" stroke-width="2"/><line x1="20" y1="24" x2="32" y2="36" stroke="currentColor" stroke-width="2"/></svg>`,
  mountainClimber: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="10" y1="14" x2="30" y2="30" stroke="currentColor" stroke-width="2"/><line x1="30" y1="30" x2="36" y2="30" stroke="currentColor" stroke-width="2"/><line x1="10" y1="14" x2="4" y2="30" stroke="currentColor" stroke-width="2"/><line x1="18" y1="22" x2="10" y2="16" stroke="currentColor" stroke-width="2"/><line x1="18" y1="22" x2="26" y2="14" stroke="currentColor" stroke-width="2"/></svg>`,
  squat: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="12" x2="20" y2="22" stroke="currentColor" stroke-width="2"/><line x1="20" y1="15" x2="10" y2="20" stroke="currentColor" stroke-width="2"/><line x1="20" y1="15" x2="30" y2="20" stroke="currentColor" stroke-width="2"/><line x1="20" y1="22" x2="12" y2="30" stroke="currentColor" stroke-width="2"/><line x1="12" y1="30" x2="12" y2="36" stroke="currentColor" stroke-width="2"/><line x1="20" y1="22" x2="28" y2="30" stroke="currentColor" stroke-width="2"/><line x1="28" y1="30" x2="28" y2="36" stroke="currentColor" stroke-width="2"/></svg>`,
  highKnees: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="11" x2="20" y2="24" stroke="currentColor" stroke-width="2"/><line x1="20" y1="24" x2="12" y2="16" stroke="currentColor" stroke-width="2"/><line x1="12" y1="16" x2="10" y2="26" stroke="currentColor" stroke-width="2"/><line x1="20" y1="24" x2="28" y2="34" stroke="currentColor" stroke-width="2"/><line x1="20" y1="14" x2="10" y2="10" stroke="currentColor" stroke-width="2"/><line x1="20" y1="14" x2="30" y2="18" stroke="currentColor" stroke-width="2"/></svg>`,
  plank: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="8" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="24" x2="34" y2="14" stroke="currentColor" stroke-width="2"/><line x1="16" y1="22" x2="12" y2="32" stroke="currentColor" stroke-width="2"/><line x1="34" y1="14" x2="30" y2="24" stroke="currentColor" stroke-width="2"/></svg>`,
  lunge: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="18" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="18" y1="11" x2="20" y2="22" stroke="currentColor" stroke-width="2"/><line x1="20" y1="22" x2="10" y2="26" stroke="currentColor" stroke-width="2"/><line x1="10" y1="26" x2="8" y2="36" stroke="currentColor" stroke-width="2"/><line x1="20" y1="22" x2="30" y2="30" stroke="currentColor" stroke-width="2"/><line x1="30" y1="30" x2="26" y2="36" stroke="currentColor" stroke-width="2"/></svg>`,
  pushup: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="8" cy="22" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="22" x2="34" y2="18" stroke="currentColor" stroke-width="2"/><line x1="14" y1="21" x2="14" y2="30" stroke="currentColor" stroke-width="2"/><line x1="30" y1="19" x2="30" y2="30" stroke="currentColor" stroke-width="2"/></svg>`,
  gluteBridge: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="8" cy="28" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="26" x2="24" y2="18" stroke="currentColor" stroke-width="2"/><line x1="24" y1="18" x2="34" y2="26" stroke="currentColor" stroke-width="2"/><line x1="24" y1="18" x2="22" y2="30" stroke="currentColor" stroke-width="2"/></svg>`,
  stretch: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="12" x2="20" y2="28" stroke="currentColor" stroke-width="2"/><line x1="20" y1="16" x2="8" y2="8" stroke="currentColor" stroke-width="2"/><line x1="20" y1="16" x2="32" y2="24" stroke="currentColor" stroke-width="2"/><line x1="20" y1="28" x2="14" y2="36" stroke="currentColor" stroke-width="2"/><line x1="20" y1="28" x2="26" y2="36" stroke="currentColor" stroke-width="2"/></svg>`,
  talk: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="16" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 30 Q16 22 24 30" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 10 Q34 12 32 20 Q30 24 24 22" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
};

// ---------- Structured routines (workouts, run, articulation) ----------
const ROUTINE_LIBRARY = {
  hiit: {
    title: "HIIT",
    duration: "~18 min",
    blocks: [
      { phase: "warm-up", detail: "2 min easy marching in place" },
      { phase: "4 rounds — 30s work / 15s rest between moves, 30s rest between rounds", moves: [
        { name: "Jumping jacks", time: "30s", icon: "jumpingJack" },
        { name: "Mountain climbers", time: "30s", icon: "mountainClimber" },
        { name: "Squat jumps", time: "30s", icon: "squat" },
        { name: "High knees", time: "30s", icon: "highKnees" },
      ]},
      { phase: "cooldown", detail: "2 min light stretching", icon: "stretch" },
    ],
    note: "Skip squat jumps if your back is bothering you — swap in regular squats instead.",
  },
  mobility: {
    title: "Mobility & Stretch",
    duration: "~12 min",
    blocks: [
      { phase: "hold each ~45s (both sides where it applies)", moves: [
        { name: "Neck rolls", time: "45s", icon: "stretch" },
        { name: "Shoulder rolls & arm circles", time: "45s", icon: "stretch" },
        { name: "Cat-cow (on all fours)", time: "45s", icon: "stretch" },
        { name: "Hip flexor lunge stretch", time: "45s/side", icon: "lunge" },
        { name: "Hamstring forward fold", time: "45s", icon: "stretch" },
        { name: "Seated lower-back twist", time: "45s/side", icon: "stretch" },
      ]},
    ],
  },
  strength: {
    title: "Bodyweight Strength",
    duration: "~15 min",
    blocks: [
      { phase: "3 rounds — 60s rest between rounds", moves: [
        { name: "Squats", time: "12-15 reps", icon: "squat" },
        { name: "Push-ups (knees down is fine)", time: "8-12 reps", icon: "pushup" },
        { name: "Glute bridges", time: "12-15 reps", icon: "gluteBridge" },
        { name: "Lunges", time: "10 reps/leg", icon: "lunge" },
        { name: "Plank hold", time: "20-40s", icon: "plank" },
      ]},
    ],
  },
  dance: {
    title: "Dance Session",
    duration: "20-30 min",
    blocks: [
      { phase: "freestyle", detail: "Put on a playlist you love and just move — no set steps. Follow an online dance workout video instead if you want structure." },
    ],
  },
  run: {
    title: "Run",
    duration: "15-20 min",
    blocks: [
      { phase: "early weeks — repeat for 15-20 min total", moves: [
        { name: "Jog", time: "1 min", icon: "highKnees" },
        { name: "Walk", time: "1-2 min", icon: "stretch" },
      ]},
    ],
    note: "As it gets easier, stretch the jog interval longer before extending the walk-break version. Build pace over weeks, not in one run.",
  },
  articulation: {
    title: "Articulation Practice",
    duration: "10 min",
    blocks: [
      { phase: "warm-up", detail: "2 min — a few tongue twisters, exaggerate your mouth movements", icon: "talk" },
      { phase: "read aloud", detail: "5 min — read anything (book, article, subtitles) slowly and clearly, focus on enunciation", icon: "talk" },
      { phase: "record & reflect", detail: "3 min — record yourself talking about any random topic, then play it back once", icon: "talk" },
    ],
  },
  selfdefense: {
    title: "Fighting & Self-Defense Fundamentals",
    duration: "20-25 min",
    blocks: [
      { phase: "stage 1 (weeks 1-4) — boxing basics", detail: "YouTube: ExpertBoxing (Johnny N) or Tyler Bell Boxing — stance, jab-cross, footwork. Real striking fundamentals, not choreography." },
      { phase: "stage 2 (weeks 5-8) — self-defense techniques", detail: "YouTube: Krav Maga Global's beginner playlist — grabs, chokes, wrist releases, getting free and creating distance." },
      { phase: "stage 3 (weeks 9+) — combine & drill", detail: "Mix stance/strikes from stage 1 with the releases from stage 2. Shadow-practice combinations like you'd actually need them." },
      { phase: "structured app option", detail: "Hero Krav Maga (free) — use instead of picking videos yourself if you'd rather follow a set lesson order." },
    ],
    note: "This is a real multi-month skill, not a weekly checkbox — move to the next stage whenever stage 1 starts feeling automatic, not on a fixed date.",
  },
};

function renderRoutine(routine) {
  let html = `<div class="routine"><div class="routine-head">${routine.title} <span>${routine.duration}</span></div>`;
  routine.blocks.forEach((b) => {
    html += `<div class="routine-block"><p class="routine-phase">${b.phase}</p>`;
    if (b.moves) {
      b.moves.forEach((m) => {
        html += `<div class="routine-move"><span class="move-icon">${EXERCISE_ICONS[m.icon] || ""}</span><span>${m.name}</span><span class="move-time">${m.time}</span></div>`;
      });
    } else {
      html += `<div class="routine-move"><span class="move-icon">${b.icon ? EXERCISE_ICONS[b.icon] || "" : ""}</span><span>${b.detail}</span></div>`;
    }
    html += `</div>`;
  });
  if (routine.note) html += `<p class="routine-note">${routine.note}</p>`;
  html += `</div>`;
  return html;
}

// ---------- Rendering ----------
async function render() {
  const all = await getAllGoals();
  const today = todayStr();
  const raw = rawDayNumber();
  const creds = getCreds();

  const list = document.getElementById("goalList");
  const empty = document.getElementById("emptyState");
  const heading = document.getElementById("goalsHeading");
  const addBtn = document.getElementById("addGoalBtn");
  list.innerHTML = "";
  empty.textContent = "nothing planned for this day.";
  empty.style.display = "none";

  if (creds) {
    if (dayOffset === null) dayOffset = 0; // first render: land on today
    const anchor = raw < 1 ? creds.startDate : today; // "day 0" reference point
    const planStart = creds.startDate;
    const planEnd = shiftDateStr(planStart, 89);
    let displayedDate = shiftDateStr(anchor, dayOffset);
    if (displayedDate < planStart) { dayOffset = daysBetween(anchor, planStart); displayedDate = planStart; }
    if (displayedDate > planEnd) { dayOffset = daysBetween(anchor, planEnd); displayedDate = planEnd; }

    const isRealToday = dayOffset === 0 && raw >= 1;
    document.getElementById("dayPrev").disabled = displayedDate <= planStart;
    document.getElementById("dayNext").disabled = displayedDate >= planEnd;
    addBtn.classList.toggle("hidden", !isRealToday);

    if (dayOffset === 0) {
      heading.textContent = raw < 1 ? "day 1 goals" : "today's goals";
    } else if (dayOffset === 1) {
      heading.textContent = "tomorrow";
    } else if (dayOffset === -1) {
      heading.textContent = "yesterday";
    } else {
      const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayOf(displayedDate)];
      heading.textContent = `${dayLabel}, ${displayedDate}`;
    }

    if (dayOffset === 0 && raw < 1) {
      const label = document.createElement("p");
      label.className = "hint";
      label.style.marginBottom = "8px";
      label.textContent = `arc starts in ${1 - raw} day${1 - raw === 1 ? "" : "s"} — here's a peek:`;
      list.appendChild(label);
    }

    const dayGoals = all.filter((g) => g.date === displayedDate);
    if (dayGoals.length === 0) {
      empty.style.display = "block";
    } else {
      dayGoals.forEach((g) => list.appendChild(renderGoalItem(g, !isRealToday)));
    }
  }

  // catch-up: past goals never touched — capped to last 7 days so it can't pile up indefinitely
  const catchupCard = document.getElementById("catchupCard");
  const catchupList = document.getElementById("catchupList");
  const cutoff = shiftDateStr(today, -7);
  const pastPending = all.filter((g) => g.date < today && g.date >= cutoff && g.status === "pending");
  catchupList.innerHTML = "";
  if (pastPending.length > 0) {
    catchupCard.classList.remove("hidden");
    pastPending
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((g) => catchupList.appendChild(renderGoalItem(g, false, true)));
  } else {
    catchupCard.classList.add("hidden");
  }

  // history (group by date, excluding today)
  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";
  const byDate = {};
  all.forEach((g) => {
    if (g.date >= today) return;
    (byDate[g.date] = byDate[g.date] || []).push(g);
  });
  const dates = Object.keys(byDate).sort().reverse();
  if (dates.length === 0) {
    historyList.innerHTML = '<p class="empty">no past days yet.</p>';
  }
  dates.forEach((d) => {
    const row = document.createElement("div");
    row.className = "history-day";
    const counts = { done: 0, postponed: 0, skipped: 0 };
    byDate[d].forEach((g) => counts[g.status] = (counts[g.status] || 0) + 1);
    row.innerHTML = `${d} ` +
      (counts.done ? `<span class="tag done">${counts.done} done</span>` : "") +
      (counts.postponed ? `<span class="tag postponed">${counts.postponed} postponed</span>` : "") +
      (counts.skipped ? `<span class="tag skipped">${counts.skipped} skipped</span>` : "");
    historyList.appendChild(row);
  });

  // streak + points
  document.getElementById("pointsVal").textContent = computePoints(all);
  document.getElementById("streakVal").textContent = computeStreak(all);
}

function renderGoalItem(g, preview, catchup) {
  const div = document.createElement("div");
  div.className = "goal-item" + (preview ? " preview" : (g.status !== "pending" ? " " + g.status : ""));
  const statusLabel = g.status === "pending" ? "" : `<small>${g.status}${g.proof ? " · proof attached" : ""}</small>`;
  const dateTag = catchup ? `<small>${g.date}</small>` : "";
  const routine = g.routineKey && ROUTINE_LIBRARY[g.routineKey];
  const info = routine ? renderRoutine(routine) : getTaskInfo(g.text);
  const hasInfo = !!info;
  div.innerHTML = `
    <div class="goal-main">
      <div class="goal-text"${hasInfo ? ' style="cursor:pointer;"' : ""}>${g.text}${statusLabel}${dateTag}</div>
      ${hasInfo ? `<div class="goal-info hidden">${info}</div>` : ""}
      <div class="goal-actions"></div>
    </div>
  `;
  if (hasInfo) {
    div.querySelector(".goal-text").onclick = () => {
      div.querySelector(".goal-info").classList.toggle("hidden");
    };
  }
  const actions = div.querySelector(".goal-actions");
  if (!preview && g.status === "pending") {
    actions.appendChild(makeIconBtn("✓", "icon-btn done-btn", "mark done", () => openProofModal(g, "done")));
    if (!catchup) {
      actions.appendChild(makeIconBtn("⏭", "icon-btn postpone-btn", "postpone", () => setStatus(g, "postponed")));
    }
    actions.appendChild(makeIconBtn("✕", "icon-btn skip-btn", "skip", () => openProofModal(g, "skipped")));
  } else if (!preview) {
    actions.appendChild(makeIconBtn("↺", "icon-btn edit-btn", "change status", () => setStatus(g, "pending")));
  }
  return div;
}

function makeIconBtn(symbol, cls, title, onClick) {
  const b = document.createElement("button");
  b.textContent = symbol;
  b.className = cls;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.onclick = onClick;
  return b;
}

async function setStatus(goal, status, proofDataUrl) {
  goal.status = status;
  if (proofDataUrl) goal.proof = proofDataUrl;
  await updateGoalRecord(goal);
  render();
}

// ---------- Points / streak ----------
function computePoints(all) {
  return all.filter((g) => g.status === "done").length * 10;
}

function computeStreak(all) {
  const doneDates = new Set(all.filter((g) => g.status === "done").map((g) => g.date));
  let key = todayStr();
  if (!doneDates.has(key)) key = shiftDateStr(key, -1); // today not done yet — don't wipe the streak each morning
  let streak = 0;
  while (doneDates.has(key)) {
    streak++;
    key = shiftDateStr(key, -1);
  }
  return streak;
}

document.getElementById("dayPrev").onclick = () => { dayOffset -= 1; render(); };
document.getElementById("dayNext").onclick = () => { dayOffset += 1; render(); };

document.getElementById("clearCatchupBtn").onclick = async () => {
  const today = todayStr();
  const cutoff = shiftDateStr(today, -7);
  const all = await getAllGoals();
  const pastPending = all.filter((g) => g.date < today && g.date >= cutoff && g.status === "pending");
  for (const g of pastPending) {
    g.status = "skipped";
    await updateGoalRecord(g);
  }
  render();
};

// ---------- Add goal modal ----------
const addModal = document.getElementById("addModal");
document.getElementById("addGoalBtn").onclick = () => addModal.classList.remove("hidden");
document.getElementById("cancelAdd").onclick = () => addModal.classList.add("hidden");
document.getElementById("confirmAdd").onclick = async () => {
  const text = document.getElementById("goalText").value.trim();
  if (!text) return;
  const needsProof = document.getElementById("needsProof").checked;
  await addGoalRecord({ date: todayStr(), text, needsProof, status: "pending", proof: null });
  document.getElementById("goalText").value = "";
  addModal.classList.add("hidden");
  render();
};

// ---------- Proof modal ----------
let pendingGoal = null;
let pendingStatus = null;
let selectedProofFile = null;
const proofModal = document.getElementById("proofModal");

function openProofModal(goal, status) {
  pendingGoal = goal;
  pendingStatus = status;
  selectedProofFile = null;
  document.getElementById("proofTitle").textContent =
    status === "done" ? "mark as done" : "mark as skipped (that's ok too)";
  document.getElementById("proofFileCamera").value = "";
  document.getElementById("proofFileGallery").value = "";
  document.getElementById("proofFileName").textContent = "";
  proofModal.classList.remove("hidden");
}
document.getElementById("cancelProof").onclick = () => proofModal.classList.add("hidden");

document.getElementById("proofCameraBtn").onclick = () => document.getElementById("proofFileCamera").click();
document.getElementById("proofGalleryBtn").onclick = () => document.getElementById("proofFileGallery").click();

function handleProofFileChosen(e) {
  const file = e.target.files && e.target.files[0];
  if (file) {
    selectedProofFile = file;
    document.getElementById("proofFileName").textContent = `selected: ${file.name}`;
  }
}
document.getElementById("proofFileCamera").onchange = handleProofFileChosen;
document.getElementById("proofFileGallery").onchange = handleProofFileChosen;

document.getElementById("confirmProof").onclick = async () => {
  let proofDataUrl = null;
  if (selectedProofFile) {
    proofDataUrl = await fileToDataUrl(selectedProofFile);
  }
  await setStatus(pendingGoal, pendingStatus, proofDataUrl);
  proofModal.classList.add("hidden");
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 900;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Recap video ----------
document.getElementById("recapBtn").onclick = generateRecap;

async function generateRecap() {
  const statusEl = document.getElementById("recapStatus");
  const all = await getAllGoals();
  const withProof = all.filter((g) => g.proof);
  if (withProof.length === 0) {
    statusEl.textContent = "no proof photos saved yet — add some as you go!";
    return;
  }
  statusEl.textContent = "rendering your recap...";

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);

  const finished = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const video = document.getElementById("recapVideo");
      video.src = url;
      video.style.display = "block";
      const link = document.getElementById("downloadLink");
      link.href = url;
      link.style.display = "inline-block";
      statusEl.textContent = "recap ready — every win and postponed day, all in one video.";
      resolve();
    };
  });

  recorder.start();
  const sorted = withProof.sort((a, b) => a.date.localeCompare(b.date));
  for (const g of sorted) {
    await drawFrame(ctx, canvas, g);
    await sleep(1500);
  }
  recorder.stop();
  await finished;
}

function drawFrame(ctx, canvas, goal) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#26215C";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, (canvas.height - 160) / img.height);
      const w = img.width * scale, h = img.height * scale;
      const x = (canvas.width - w) / 2, y = 60;
      ctx.drawImage(img, x, y, w, h);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(goal.date, canvas.width / 2, canvas.height - 70);
      ctx.font = "28px sans-serif";
      const label = goal.status === "done" ? "win: " + goal.text : "part of the journey: " + goal.text;
      wrapText(ctx, label, canvas.width / 2, canvas.height - 30, canvas.width - 60, 32);
      resolve();
    };
    img.src = goal.proof;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  words.forEach((word) => {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line !== "") {
      lines.push(line);
      line = word + " ";
    } else {
      line = test;
    }
  });
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, y - (lines.length - 1 - i) * lineHeight));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- Auth (stored on this device only) ----------
const CREDS_KEY = "wa_creds";
const SEEDED_KEY = "wa_seeded";
const SESSION_KEY = "wa_session";
const DATEFIX_KEY = "wa_datefix_v1";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCreds() {
  const raw = localStorage.getItem(CREDS_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function initAuth() {
  const creds = getCreds();
  if (!creds) {
    document.getElementById("setupForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("setupStartDate").value = todayStr();
  } else {
    document.getElementById("setupForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
  }
}

document.getElementById("showLogin").onclick = (e) => {
  e.preventDefault();
  document.getElementById("setupForm").classList.add("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
};

document.getElementById("showSetup").onclick = (e) => {
  e.preventDefault();
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("setupForm").classList.remove("hidden");
};

document.getElementById("setupBtn").onclick = async () => {
  const user = document.getElementById("setupUser").value.trim();
  const pass = document.getElementById("setupPass").value;
  const pass2 = document.getElementById("setupPass2").value;
  const startDate = document.getElementById("setupStartDate").value;
  const errEl = document.getElementById("setupError");
  if (!user || !pass || !startDate) { errEl.textContent = "fill in every field."; return; }
  if (pass !== pass2) { errEl.textContent = "passwords don't match."; return; }
  const hash = await sha256(pass);
  localStorage.setItem(CREDS_KEY, JSON.stringify({ user, hash, startDate }));
  await unlockApp(startDate);
};

document.getElementById("loginBtn").onclick = async () => {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value;
  const errEl = document.getElementById("loginError");
  const creds = getCreds();
  const hash = await sha256(pass);
  if (creds && creds.user === user && creds.hash === hash) {
    await unlockApp(creds.startDate);
  } else {
    errEl.textContent = "wrong username or password.";
  }
};

// One-time repair: an earlier version saved each day's date one day too early
// (it converted local midnight to UTC). If the saved plan starts a day before
// the chosen start date, shift everything forward by that one day.
async function fixShiftedDatesIfNeeded(startDate) {
  if (localStorage.getItem(DATEFIX_KEY)) return;
  const all = await getAllGoals();
  if (all.length > 0) {
    // plan days hold 3-5 goals each; a stray one-off "extra" goal sits alone on its day
    const counts = {};
    all.forEach((g) => { counts[g.date] = (counts[g.date] || 0) + 1; });
    const planDates = new Set(Object.keys(counts).filter((d) => counts[d] >= 3));
    const planStart = Array.from(planDates).sort()
      .find((d) => [1, 2, 3, 4, 5, 6].every((k) => planDates.has(shiftDateStr(d, k))));
    if (planStart && daysBetween(planStart, startDate) === 1) {
      for (const g of all) {
        g.date = shiftDateStr(g.date, 1);
        await updateGoalRecord(g);
      }
    }
  }
  localStorage.setItem(DATEFIX_KEY, "1");
}

async function unlockApp(startDate) {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  try {
    await fixShiftedDatesIfNeeded(startDate);
    await seedGoalsIfNeeded(startDate);
    localStorage.setItem(SESSION_KEY, "1");
    drawWheel();
    updateSpinUI();
    renderMilestones();
    await render();
  } catch (e) {
    console.error("unlockApp failed:", e);
    document.getElementById("goalsHeading").textContent = "something went wrong";
    document.getElementById("emptyState").textContent = "error: " + e.message;
    document.getElementById("emptyState").style.display = "block";
  }
}

document.getElementById("logoutBtn").onclick = () => {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
};

// ---------- 90-day pre-fed goal plan ----------
function walkTargetForDay(dayIndex) {
  const stage = Math.floor(dayIndex / 14); // step up every 2 weeks
  return Math.min(20, 3 + stage * 2);
}

const WORKOUT_ROTATION = ["dance", "hiit", "mobility", "strength"];

const SIDE_QUESTS = [
  "clean the table",
  "organize the cupboard",
  "no-sugar day",
  "no-spend day",
  "declutter one drawer",
  "tidy the wardrobe",
  "water-only day (skip soda/juice)",
  "make the bed properly",
  "clean your work desk",
  "organize your phone gallery",
  "wipe down the bathroom mirror & sink",
  "sort laundry into piles",
  "clear old screenshots off your phone",
  "10-min deep clean of one corner",
  "unsubscribe from 3 unused emails/apps",
  "tidy your shoes/footwear area",
  "clean out your bag or purse",
  "organize your skincare shelf",
];

function sideQuestForDay(dayIndex) {
  return SIDE_QUESTS[dayIndex % SIDE_QUESTS.length];
}

function generateGoalsForDate(dayIndex, weekday) {
  const target = walkTargetForDay(dayIndex);
  const goals = [];
  if (weekday >= 1 && weekday <= 4) {
    // Mon-Thu (office days) — 5 items: walk, workout, protein, articulation, + rotating study/screen-check
    const workoutKey = WORKOUT_ROTATION[dayIndex % WORKOUT_ROTATION.length];
    goals.push({ text: `walk ${target}k steps`, needsProof: true });
    goals.push({ text: ROUTINE_LIBRARY[workoutKey].title, needsProof: true, routineKey: workoutKey });
    goals.push({ text: "protein ~80g today", needsProof: false });
    goals.push({ text: "articulation practice (10 min)", needsProof: false, routineKey: "articulation" });
    if (dayIndex % 2 === 0) {
      goals.push({ text: "study/skill practice", needsProof: false });
    } else {
      goals.push({ text: "screen time check — under 3 hrs today (proof: screenshot)", needsProof: true });
    }
  } else if (weekday === 5) {
    // Friday WFH — walk, catch-up, protein, articulation, side quest
    goals.push({ text: `walk ${target}k steps`, needsProof: true });
    goals.push({ text: "catch-up workout (whatever got skipped)", needsProof: true });
    goals.push({ text: "protein ~80g today", needsProof: false });
    goals.push({ text: "articulation practice (10 min)", needsProof: false, routineKey: "articulation" });
    goals.push({ text: sideQuestForDay(dayIndex), needsProof: false });
  } else if (weekday === 6) {
    // Saturday — run, protein, articulation, + alternating self-defense/side-quest (keeps it at 4 items)
    goals.push({ text: "run (build pace gradually)", needsProof: true, routineKey: "run" });
    goals.push({ text: "protein ~80g today", needsProof: false });
    goals.push({ text: "articulation practice (10 min)", needsProof: false, routineKey: "articulation" });
    const weekNum = Math.floor(dayIndex / 7);
    if (weekNum % 2 === 0) {
      goals.push({ text: "self-defense practice", needsProof: false, routineKey: "selfdefense" });
    } else {
      goals.push({ text: sideQuestForDay(dayIndex), needsProof: false });
    }
  } else {
    // Sunday — prep day, kept lighter on purpose (no articulation/side-quest)
    goals.push({ text: "prep day: iron clothes + plan the week's outfits", needsProof: false });
    goals.push({ text: "light movement: walk or stretch", needsProof: false });
    goals.push({ text: "weekly reflection + weigh-in", needsProof: false });
    goals.push({ text: "protein ~80g today", needsProof: false });
  }
  return goals;
}

async function seedGoalsIfNeeded(startDate) {
  if (localStorage.getItem(SEEDED_KEY)) return;
  const existing = await getAllGoals();
  if (existing.length > 0) { localStorage.setItem(SEEDED_KEY, "1"); return; }
  const list = [];
  for (let i = 0; i < 90; i++) {
    const dateStr = shiftDateStr(startDate, i);
    const weekday = weekdayOf(dateStr);
    generateGoalsForDate(i, weekday).forEach((g) => {
      list.push({ date: dateStr, text: g.text, needsProof: g.needsProof, status: "pending", proof: null, routineKey: g.routineKey || null });
    });
  }
  await addManyGoalRecords(list);
  localStorage.setItem(SEEDED_KEY, "1");
  localStorage.setItem(DATEFIX_KEY, "1");
}

// ---------- Rewards: spin wheel + milestones ----------
const REWARDS = [
  "order from somewhere new",
  "no rules today — skip it all, no guilt",
  "small surprise splurge (set a budget)",
  "new yarn or pattern to crochet",
  "at-home spa night",
  "dress-up night, no occasion needed",
  "try a genre you've never watched",
  "solo outing, dressed up, no agenda",
  "a beauty treat you don't usually buy",
  "open your seal-a-surprise envelope",
];
const MILESTONES = [
  { day: 30, text: "a skincare/beauty treat you've been eyeing" },
  { day: 60, text: "a day out doing something you actually want" },
  { day: 90, text: "the big one — whatever's been the real finish line" },
];
const WHEEL_COLORS = ["#14182B", "#D9A441", "#4F7A5B", "#B25B3E", "#1D2242", "#DCE9DF", "#8B5E3C", "#9A9FBA", "#2E4F38", "#7A3A22"];

function drawWheel() {
  const canvas = document.getElementById("rewardWheel");
  const ctx = canvas.getContext("2d");
  const n = REWARDS.length;
  const cx = canvas.width / 2, cy = canvas.height / 2, r = canvas.width / 2 - 4;
  const slice = (Math.PI * 2) / n;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, i * slice, (i + 1) * slice);
    ctx.closePath();
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();
  }
}

const LAST_SPIN_KEY = "wa_lastSpin";       // number of the last week that was spun for
const SPIN_HISTORY_KEY = "wa_spinHistory";

function completedWeeks(dayNum) {
  return dayNum > 0 ? Math.floor(dayNum / 7) : 0;
}

function canSpinThisWeek() {
  const raw = rawDayNumber();
  if (raw < 1) return false; // arc hasn't started
  const lastSpunWeek = Number(localStorage.getItem(LAST_SPIN_KEY) || 0);
  return completedWeeks(raw) > lastSpunWeek;
}

function updateSpinUI() {
  const hint = document.getElementById("spinHint");
  const btn = document.getElementById("spinBtn");
  const raw = rawDayNumber();
  if (raw < 1) {
    hint.textContent = "unlocks once your first week of the arc is done";
    btn.disabled = true;
  } else if (canSpinThisWeek()) {
    hint.textContent = `week ${completedWeeks(raw)} complete — available now`;
    btn.disabled = false;
  } else {
    const nextUnlockDay = (completedWeeks(raw) + 1) * 7;
    const daysLeft = nextUnlockDay - raw;
    hint.textContent = `next spin in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
    btn.disabled = true;
  }
  const history = JSON.parse(localStorage.getItem(SPIN_HISTORY_KEY) || "[]");
  document.getElementById("spinResult").textContent = history.length ? `last: ${history[history.length - 1].reward}` : "";
}

document.getElementById("spinBtn").onclick = () => {
  if (!canSpinThisWeek()) return;
  const n = REWARDS.length;
  const winnerIndex = Math.floor(Math.random() * n);
  const slice = 360 / n;
  const targetAngle = 360 * 4 + (360 - (winnerIndex * slice + slice / 2));
  const canvas = document.getElementById("rewardWheel");
  canvas.style.transform = `rotate(${targetAngle}deg)`;
  setTimeout(() => {
    const reward = REWARDS[winnerIndex];
    localStorage.setItem(LAST_SPIN_KEY, String(completedWeeks(rawDayNumber())));
    const history = JSON.parse(localStorage.getItem(SPIN_HISTORY_KEY) || "[]");
    history.push({ date: todayStr(), reward });
    localStorage.setItem(SPIN_HISTORY_KEY, JSON.stringify(history));
    document.getElementById("spinResult").textContent = `you got: ${reward}`;
    updateSpinUI();
  }, 4200);
};

function renderMilestones() {
  const dayNum = currentDayNumber();
  const list = document.getElementById("milestoneList");
  list.innerHTML = "";
  MILESTONES.forEach((m) => {
    const reached = dayNum >= m.day;
    const div = document.createElement("div");
    div.className = "milestone-item" + (reached ? " reached" : "");
    div.innerHTML = `<span>day ${m.day} — ${m.text}</span><span class="badge">${reached ? "✓ unlocked" : "🔒"}</span>`;
    list.appendChild(div);
  });
}

// ---------- Water tracker ----------
function waterKey(date) { return `wa_water_${date}`; }

function renderWater() {
  const count = Number(localStorage.getItem(waterKey(todayStr())) || 0);
  document.getElementById("waterCount").textContent = count;
}
document.getElementById("waterPlus").onclick = () => {
  const k = waterKey(todayStr());
  localStorage.setItem(k, String(Number(localStorage.getItem(k) || 0) + 1));
  renderWater();
};
document.getElementById("waterMinus").onclick = () => {
  const k = waterKey(todayStr());
  localStorage.setItem(k, String(Math.max(0, Number(localStorage.getItem(k) || 0) - 1)));
  renderWater();
};

// ---------- Weekly weight log ----------
function getWeightLog() { return JSON.parse(localStorage.getItem("wa_weight_log") || "[]"); }

function renderWeightHistory() {
  const log = getWeightLog().slice(-5).reverse();
  document.getElementById("weightHistory").innerHTML = log.length
    ? log.map((e) => `${e.date}: ${e.weight}`).join("<br>")
    : "no entries yet";
}
document.getElementById("logWeightBtn").onclick = () => {
  const val = parseFloat(document.getElementById("weightInput").value);
  if (!val) return;
  const log = getWeightLog();
  log.push({ date: todayStr(), weight: val });
  localStorage.setItem("wa_weight_log", JSON.stringify(log));
  document.getElementById("weightInput").value = "";
  renderWeightHistory();
};

// ---------- Daily reflection (tap chips, no writing required) ----------
const REFLECT_CHIPS = ["hit protein", "good sleep", "great workout", "low energy", "busy day", "proud moment", "skipped stuff", "stressed", "doomscrolled", "drank enough water"];
let activeChips = [];

function reflectKey(date) { return `wa_reflect_${date}`; }
function getReflection(date) {
  const raw = localStorage.getItem(reflectKey(date));
  return raw ? JSON.parse(raw) : { chips: [], note: "" };
}

function renderReflectChips() {
  const today = getReflection(todayStr());
  activeChips = today.chips;
  document.getElementById("reflectNote").value = today.note || "";
  const wrap = document.getElementById("reflectChips");
  wrap.innerHTML = "";
  REFLECT_CHIPS.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (activeChips.includes(c) ? " active" : "");
    btn.textContent = c;
    btn.onclick = () => {
      activeChips = activeChips.includes(c) ? activeChips.filter((x) => x !== c) : [...activeChips, c];
      renderReflectChips();
    };
    wrap.appendChild(btn);
  });
}
document.getElementById("saveReflectBtn").onclick = () => {
  const note = document.getElementById("reflectNote").value.trim();
  localStorage.setItem(reflectKey(todayStr()), JSON.stringify({ chips: activeChips, note }));
  renderSummaries();
};

function summarizeRange(days) {
  const tally = {};
  const notes = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateStr(todayStr(), -i);
    const r = getReflection(d);
    r.chips.forEach((c) => { tally[c] = (tally[c] || 0) + 1; });
    if (r.note) notes.push(`${d}: ${r.note}`);
  }
  const tallyLine = Object.keys(tally).length
    ? Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n}x)`).join(", ")
    : "nothing logged yet";
  return notes.length ? `${tallyLine}<br>${notes.join("<br>")}` : tallyLine;
}
function renderSummaries() {
  document.getElementById("weekSummary").innerHTML = "<strong>this week:</strong> " + summarizeRange(7);
  document.getElementById("monthSummary").innerHTML = "<strong>this month:</strong> " + summarizeRange(30);
}

// ---------- Bonus task list (your own, not date-bound) ----------
function getBonusTasks() { return JSON.parse(localStorage.getItem("wa_bonus_tasks") || "[]"); }
function saveBonusTasks(list) { localStorage.setItem("wa_bonus_tasks", JSON.stringify(list)); }

function renderBonusTasks() {
  const list = getBonusTasks();
  const wrap = document.getElementById("bonusTaskList");
  wrap.innerHTML = "";
  list.forEach((t) => {
    const div = document.createElement("div");
    div.className = "bonus-task" + (t.done ? " done" : "");
    div.innerHTML = `<span>${t.text}</span>`;
    div.querySelector("span").onclick = () => {
      t.done = !t.done;
      saveBonusTasks(list);
      renderBonusTasks();
    };
    div.appendChild(makeIconBtn("✕", "icon-btn skip-btn", "delete", () => {
      saveBonusTasks(list.filter((x) => x.id !== t.id));
      renderBonusTasks();
    }));
    wrap.appendChild(div);
  });
}
document.getElementById("addBonusTaskBtn").onclick = () => {
  const input = document.getElementById("bonusTaskInput");
  const text = input.value.trim();
  if (!text) return;
  const list = getBonusTasks();
  list.push({ id: Date.now(), text, done: false });
  saveBonusTasks(list);
  input.value = "";
  renderBonusTasks();
};

// ---------- Init ----------
function rawDayNumber() {
  const creds = getCreds();
  if (!creds) return 1;
  return daysBetween(creds.startDate, todayStr()) + 1;
}

function currentDayNumber() {
  return Math.max(1, Math.min(90, rawDayNumber()));
}

function updateDayline() {
  const creds = getCreds();
  if (!creds) return;
  const raw = rawDayNumber();
  const dayline = document.getElementById("dayline");
  const fill = document.getElementById("progressFill");
  if (raw < 1) {
    dayline.textContent = `starts in ${1 - raw} day${1 - raw === 1 ? "" : "s"} (${creds.startDate})`;
    fill.style.width = "0%";
  } else {
    const clamped = Math.min(90, raw);
    dayline.textContent = `day ${clamped} of 90`;
    fill.style.width = `${(clamped / 90) * 100}%`;
  }
}

const originalRender = render;
render = async function () {
  await originalRender();
  updateDayline();
  renderMilestones();
  updateSpinUI();
  renderWater();
  renderWeightHistory();
  renderReflectChips();
  renderSummaries();
  renderBonusTasks();
};

openDB().then(async () => {
  const creds = getCreds();
  if (creds && localStorage.getItem(SESSION_KEY)) {
    await unlockApp(creds.startDate);
  } else {
    await initAuth();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
