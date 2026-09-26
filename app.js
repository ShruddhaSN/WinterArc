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
  const match = TASK_INFO.find(([key]) => lower.includes(key));
  return match ? match[1] : null;
}

// ---------- Rendering ----------
async function render() {
  const all = await getAllGoals();
  const today = todayStr();
  const todaysGoals = all.filter((g) => g.date === today);

  document.getElementById("dateline").textContent = new Date().toDateString();

  const list = document.getElementById("goalList");
  const empty = document.getElementById("emptyState");
  list.innerHTML = "";
  if (todaysGoals.length === 0) {
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    todaysGoals.forEach((g) => list.appendChild(renderGoalItem(g)));
  }

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";
  const byDate = {};
  all.forEach((g) => {
    if (g.date === today) return;
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

  document.getElementById("pointsVal").textContent = computePoints(all);
  document.getElementById("streakVal").textContent = computeStreak(all);
}

function renderGoalItem(g) {
  const div = document.createElement("div");
  div.className = "goal-item" + (g.status !== "pending" ? " " + g.status : "");
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
  if (g.status === "pending") {
    actions.appendChild(makeBtn("done", "btn small primary", () => openProofModal(g, "done")));
    actions.appendChild(makeBtn("postpone", "btn small secondary", () => setStatus(g, "postponed")));
    actions.appendChild(makeBtn("skip", "btn small secondary", () => openProofModal(g, "skipped")));
  }
  return div;
}

function makeBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = cls;
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
