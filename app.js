// ---------- IndexedDB setup ----------
let db;
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addGoalRecord(goal) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(goal);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
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
  ["talk practice", "Read something aloud for 5-10 min, or do a Speechling submission. Recording yourself and listening back also counts."],
  ["study", "20-30 min focused block — rotate between Java/Spring Boot, Korean, or sign language depending on what you feel like that day."],
  ["dance", "Put on a playlist you love and move for 20-30 min — freestyle or an online dance workout video, whatever actually feels fun."],
  ["HIIT", "15-20 min circuit: ~30 sec work / 15 sec rest, 3-4 rounds. E.g. jumping jacks, mountain climbers, squat jumps, high knees (skip anything that aggravates your back)."],
  ["mobility", "10-15 min of stretching — hips, hamstrings, lower back, neck and shoulders. Good for sore or tired days."],
  ["strength", "Bodyweight circuit: squats, push-ups, glute bridges, lunges, plank hold. 2-3 sets of 10-15 reps each."],
  ["run", "Early on: alternate 1 min jog / 1-2 min walk for 15-20 min. As it gets easier, stretch the jog intervals. Build pace over weeks, not in one run."],
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

// ---------- Rendering ----------
async function render() {
  const all = await getAllGoals();
  const today = todayStr();
  const creds = getCreds();
  const raw = rawDayNumber();

  // today's list (or a preview of day 1 if the arc hasn't started yet)
  const list = document.getElementById("goalList");
  const empty = document.getElementById("emptyState");
  list.innerHTML = "";

  if (creds && raw < 1) {
    const previewGoals = all.filter((g) => g.date === creds.startDate);
    empty.style.display = "none";
    document.getElementById("goalsHeading").textContent = "day 1 goals";
    const label = document.createElement("p");
    label.className = "hint";
    label.style.marginBottom = "8px";
    label.textContent = `arc starts in ${1 - raw} day${1 - raw === 1 ? "" : "s"} — here's a peek:`;
    list.appendChild(label);
    previewGoals.forEach((g) => list.appendChild(renderGoalItem(g, true)));
  } else {
    document.getElementById("goalsHeading").textContent = "today's goals";
    const todaysGoals = all.filter((g) => g.date === today);
    if (todaysGoals.length === 0) {
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      todaysGoals.forEach((g) => list.appendChild(renderGoalItem(g)));
    }
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

function renderGoalItem(g, preview) {
  const div = document.createElement("div");
  div.className = "goal-item" + (preview ? " preview" : (g.status !== "pending" ? " " + g.status : ""));
  const statusLabel = g.status === "pending" ? "" : `<small>${g.status}${g.proof ? " · proof attached" : ""}</small>`;
  const info = getTaskInfo(g.text);
  div.innerHTML = `
    <div class="goal-main">
      <div class="goal-text"${info ? ' style="cursor:pointer;"' : ""}>${g.text}${statusLabel}</div>
      ${info ? `<div class="goal-info hidden">${info}</div>` : ""}
      <div class="goal-actions"></div>
    </div>
  `;
  if (info) {
    div.querySelector(".goal-text").onclick = () => {
      div.querySelector(".goal-info").classList.toggle("hidden");
    };
  }
  const actions = div.querySelector(".goal-actions");
  if (!preview && g.status === "pending") {
    actions.appendChild(makeIconBtn("✓", "icon-btn done-btn", "mark done", () => openProofModal(g, "done")));
    actions.appendChild(makeIconBtn("⏭", "icon-btn postpone-btn", "postpone", () => setStatus(g, "postponed")));
    actions.appendChild(makeIconBtn("✕", "icon-btn skip-btn", "skip", () => openProofModal(g, "skipped")));
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
  let streak = 0;
  let d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (doneDates.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

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
const proofModal = document.getElementById("proofModal");

function openProofModal(goal, status) {
  pendingGoal = goal;
  pendingStatus = status;
  document.getElementById("proofTitle").textContent =
    status === "done" ? "mark as done" : "mark as skipped (that's ok too)";
  document.getElementById("proofFile").value = "";
  proofModal.classList.remove("hidden");
}
document.getElementById("cancelProof").onclick = () => proofModal.classList.add("hidden");
document.getElementById("confirmProof").onclick = async () => {
  const fileInput = document.getElementById("proofFile");
  let proofDataUrl = null;
  if (fileInput.files && fileInput.files[0]) {
    proofDataUrl = await fileToDataUrl(fileInput.files[0]);
  }
  await setStatus(pendingGoal, pendingStatus, proofDataUrl);
  proofModal.classList.add("hidden");
};

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
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

// ---------- Auth (client-side only — this is a local personal app, not a real backend) ----------
const CREDS_KEY = "wa_creds";
const SEEDED_KEY = "wa_seeded";
const SESSION_KEY = "wa_session";

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
    const dateInput = document.getElementById("setupStartDate");
    dateInput.value = todayStr();
  } else {
    document.getElementById("setupForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
  }
}

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

async function unlockApp(startDate) {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  await seedGoalsIfNeeded(startDate);
  localStorage.setItem(SESSION_KEY, "1");
  drawWheel();
  updateSpinUI();
  renderMilestones();
  render();
}

document.getElementById("logoutBtn").onclick = () => {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
};

// ---------- 90-day pre-fed goal plan ----------
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d;
}

function walkTargetForDay(dayIndex) {
  const stage = Math.floor(dayIndex / 14); // step up every 2 weeks
  return Math.min(20, 3 + stage * 2);
}

const WORKOUTS = ["dance session", "HIIT (15-20 min)", "mobility & stretch", "bodyweight strength"];

function generateGoalsForDate(dayIndex, weekday) {
  const target = walkTargetForDay(dayIndex);
  const goals = [];
  if (weekday >= 1 && weekday <= 4) {
    // Mon-Thu (office days)
    goals.push({ text: `walk ${target}k steps`, needsProof: true });
    goals.push({ text: WORKOUTS[dayIndex % WORKOUTS.length], needsProof: true });
    goals.push({ text: "protein ~80g today", needsProof: false });
    goals.push({ text: (dayIndex % 2 === 0) ? "study/skill practice" : "articulation practice", needsProof: false });
    if (dayIndex % 3 === 0) {
      goals.push({ text: "screen time check — proof: screenshot", needsProof: true });
    }
  } else if (weekday === 5) {
    // Friday WFH
    goals.push({ text: `walk ${target}k steps`, needsProof: true });
    goals.push({ text: "catch-up workout (whatever got skipped)", needsProof: true });
    goals.push({ text: "protein ~80g today", needsProof: false });
    goals.push({ text: "project / skill time", needsProof: false });
  } else if (weekday === 6) {
    // Saturday — run day
    goals.push({ text: "run (build pace gradually)", needsProof: true });
    goals.push({ text: "protein ~80g today", needsProof: false });
    goals.push({ text: "something fun & active — your call", needsProof: false });
  } else {
    // Sunday — prep day
    goals.push({ text: "prep day: iron clothes + plan the week's outfits", needsProof: false });
    goals.push({ text: "light movement: walk or stretch", needsProof: false });
    goals.push({ text: "weekly reflection + weigh-in", needsProof: false });
    goals.push({ text: "protein ~80g today", needsProof: false });
  }
  return goals;
}

async function seedGoalsIfNeeded(startDate) {
  if (localStorage.getItem(SEEDED_KEY)) return;
  const all = await getAllGoals();
  if (all.length > 0) { localStorage.setItem(SEEDED_KEY, "1"); return; }
  for (let i = 0; i < 90; i++) {
    const d = addDays(startDate, i);
    const dateStr = d.toISOString().slice(0, 10);
    const weekday = d.getDay();
    const goals = generateGoalsForDate(i, weekday);
    for (const g of goals) {
      await addGoalRecord({ date: dateStr, text: g.text, needsProof: g.needsProof, status: "pending", proof: null });
    }
  }
  localStorage.setItem(SEEDED_KEY, "1");
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
const LAST_SPIN_KEY = "wa_lastSpin";
const SPIN_HISTORY_KEY = "wa_spinHistory";
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
    div.innerHTML = `<span>day ${m.day} — ${m.text}</span><span class="badge">${reached ? "unlocked" : "locked"}</span>`;
    list.appendChild(div);
  });
}

// ---------- Init ----------
openDB().then(async () => {
  const creds = getCreds();
  if (creds && localStorage.getItem(SESSION_KEY)) {
    await unlockApp(creds.startDate);
  } else {
    await initAuth();
  }
});

function rawDayNumber() {
  const creds = getCreds();
  if (!creds) return 1;
  const start = new Date(creds.startDate + "T00:00:00");
  const now = new Date();
  return Math.floor((now - start) / 86400000) + 1;
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
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
