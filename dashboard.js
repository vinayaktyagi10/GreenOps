/* =========================================================================
   GreenOps dashboard: plain HTML/CSS/JS, no build step required.
   Everything here runs client-side against mock/simulated data so the
   UI is fully demoable before the FastAPI backend and the scheduling
   engine are wired up.

   When the real backend is ready:
   - Replace CONFIG.API_BASE with the real FastAPI URL.
   - Replace fetchLiveState()/generateReport() bodies with real fetch() calls.
     Both already try a real endpoint first and fall back to mock data,
     so swapping is mostly deleting the fallback branch once it's stable.
   - Replace the setInterval simulation loop with the WebSocket
     `container_update` stream described in the API specification.
   ========================================================================= */

const CONFIG = {
  API_BASE: "http://localhost:8000",   // FastAPI backend, once running
  WEIGHTS: { w1: 0.5, w2: 0.3, w3: 0.4 } // mirrors the policy engine's score() function
};

// ---- Regions (simulated grids with different generation mixes) ----------
const REGIONS = [
  { id:"us-east-sim", name:"US-East (sim)", desc:"coal + gas heavy", phase:0.0,  base:420, amp:180 },
  { id:"eu-west-sim",  name:"EU-West (sim)", desc:"wind heavy",      phase:2.4,  base:260, amp:200 },
  { id:"ap-south-sim", name:"AP-South (sim)", desc:"solar heavy",    phase:5.0,  base:340, amp:230 },
];

const NAMESPACES = [
  { name:"platform-eng", budgetKg: 40 },
  { name:"data-science", budgetKg: 25 },
  { name:"ml-training",  budgetKg: 60 },
];
NAMESPACES.forEach(n => n.usedKg = 0);

let simMinutes = 9 * 60;     // start at 09:00 on the simulated clock
let speed = 20;               // sim-minutes advanced per real second (approx)
let jobs = [];                // all jobs, queued/deferred/running/completed
let history = [];             // completed/executed jobs for the history table
let containers = [];          // mock "docker ps" rows
let cumulativeSavedKg = 0;
let cumulativeBaselineKg = 0;
let jobCounter = 1;

// ---- Carbon intensity model ---------------------------------------------
// A smooth day/night cycle per region + noise, clamped to a plausible range.
function carbonIntensity(region, minuteOfDay){
  const hour = (minuteOfDay / 60) % 24;
  const wave = Math.sin((hour / 24) * Math.PI * 2 + region.phase);
  const noise = (Math.pow(Math.sin(minuteOfDay*0.13 + region.phase*3), 2) - 0.5) * 25;
  let v = region.base + wave * region.amp * -1 + noise; // renewables peak -> lower intensity
  return Math.max(60, Math.round(v));
}
function forecastTrend(region, minuteOfDay){
  // slope of intensity over the next 2 simulated hours; positive means getting dirtier
  const now = carbonIntensity(region, minuteOfDay);
  const later = carbonIntensity(region, minuteOfDay + 120);
  return later - now;
}
function zoneFor(v){
  if(v < 260) return "clean";
  if(v < 400) return "medium";
  return "dirty";
}
function normalize(v, min=60, max=650){ return Math.min(1, Math.max(0, (v-min)/(max-min))); }

// ---- Policy / scoring engine (client-side mirror of the policy engine's formula) ----
// score = w1*normalize(current) + w2*normalize(forecast_trend) - w3*urgency_penalty
// Lower score = better time/place to run (it's a "carbon cost" score).
function scoreRegion(region, minuteOfDay, job){
  const current = carbonIntensity(region, minuteOfDay);
  const trend = forecastTrend(region, minuteOfDay);
  const waitedMin = minuteOfDay - job.submittedAt;
  const slaWindow = job.priority === "flexible" ? 240 : 45; // minutes
  const urgency = Math.min(1, waitedMin / slaWindow);
  const w = CONFIG.WEIGHTS;
  const score = w.w1*normalize(current) + w.w2*normalize(Math.max(0,trend)/50) - w.w3*urgency;
  return { score, current, trend, urgency, waitedMin, slaWindow };
}
function bestRegion(minuteOfDay, job){
  let best = null;
  for(const r of REGIONS){
    const s = scoreRegion(r, minuteOfDay, job);
    if(!best || s.score < best.score) best = { region:r, ...s };
  }
  return best;
}

// ---- Job lifecycle ---------------------------------------------------
function submitJob({name, priority, namespace, runtime}){
  const job = {
    id: "job-" + (jobCounter++),
    name: name || `workload-${jobCounter}`,
    priority, namespace, runtime,
    submittedAt: simMinutes,
    status: "queued",
    execRegion: null, execAt: null, execIntensity: null,
    lastDecision: null,
  };
  jobs.push(job);
  evaluateJob(job, true);
}

function evaluateJob(job, isFirstPass){
  if(job.status === "running" || job.status === "completed") return;

  if(job.priority === "critical"){
    // Critical tier: always launches immediately, no carbon check.
    runJob(job, REGIONS[0], carbonIntensity(REGIONS[0], simMinutes), "critical-bypass");
    return;
  }

  const decision = bestRegion(simMinutes, job);
  job.lastDecision = decision;

  const RUN_THRESHOLD = job.priority === "flexible" ? 0.30 : 0.55;
  const slaBreached = decision.waitedMin >= decision.slaWindow;

  const ns = NAMESPACES.find(n => n.name === job.namespace);
  const projectedKg = (job.runtime/60) * decision.current * 0.7 / 1000; // rough kg CO2 estimate
  const overBudget = job.priority === "flexible" && (ns.usedKg + projectedKg) > ns.budgetKg;

  if(overBudget){
    job.status = "deferred";
    job.deferReason = "namespace carbon budget exceeded, holding until budget resets or priority forces it";
    if(isFirstPass) toast(job, "deferred", `${job.name}: over budget, holding`);
    return;
  }

  if(decision.score <= RUN_THRESHOLD || slaBreached){
    runJob(job, decision.region, decision.current, slaBreached ? "sla-deadline" : "clean-window");
  } else {
    job.status = "deferred";
    job.deferReason = `waiting for cleaner grid (score ${decision.score.toFixed(2)} > ${RUN_THRESHOLD})`;
    if(isFirstPass) toast(job, "deferred", `${job.name}: deferred, grid too dirty`);
  }
}

function runJob(job, region, intensity, reason){
  job.status = "running";
  job.execRegion = region.id;
  job.execAt = simMinutes;
  job.execIntensity = intensity;
  job.runReason = reason;

  const ns = NAMESPACES.find(n => n.name === job.namespace);
  const kg = (job.runtime/60) * intensity * 0.7 / 1000;
  ns.usedKg += kg;

  const baselineIntensity = 480; // "always run immediately, ignore carbon" baseline
  const baselineKg = (job.runtime/60) * baselineIntensity * 0.7 / 1000;
  cumulativeSavedKg += Math.max(0, baselineKg - kg);
  cumulativeBaselineKg += baselineKg;

  const cid = Math.random().toString(16).slice(2,10);
  containers.push({ id: cid, image:"greenops/worker:latest", status:"Up", region: region.id, ns: job.namespace, job: job.id });

  toast(job, job.priority === "critical" ? "critical" : "running",
    `${job.name}: running now in ${region.name}${reason==="sla-deadline" ? " (SLA deadline)" : ""}`);

  setTimeout(() => completeJob(job, cid), Math.min(6000, 800 + job.runtime * 40));
}

function completeJob(job, cid){
  job.status = "completed";
  job.completedAt = simMinutes;
  history.unshift(job);
  if(history.length > 40) history.pop();
  const c = containers.find(c => c.id === cid);
  if(c) c.status = "Exited";
}

// ---- Re-evaluate all deferred jobs every tick ----------------------------
function tick(){
  for(const j of jobs){
    if(j.status === "queued" || j.status === "deferred") evaluateJob(j, false);
  }
}

// ---- UI: toasts -----------------------------------------------------
function toast(job, kind, msg){
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ---- Charts -----------------------------------------------------------
let sparkCharts = {};
let savingsChart;

function initSparklines(){
  REGIONS.forEach(r => {
    const ctx = document.getElementById("spark-"+r.id).getContext("2d");
    sparkCharts[r.id] = new Chart(ctx, {
      type:"line",
      data:{ labels:[], datasets:[{ data:[], borderColor:"#6C8EE0", borderWidth:2, pointRadius:0, tension:0.35, fill:true, backgroundColor:"rgba(108,142,224,0.08)" }]},
      options:{
        animation:false, responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{enabled:false}},
        scales:{ x:{display:false}, y:{display:false} }
      }
    });
  });
}
function initSavingsChart(){
  const ctx = document.getElementById("savingsChart").getContext("2d");
  savingsChart = new Chart(ctx, {
    type:"line",
    data:{ labels:[], datasets:[
      { label:"Carbon-aware (actual)", data:[], borderColor:"#7ED45A", backgroundColor:"rgba(126,212,90,0.08)", fill:true, tension:0.3, pointRadius:0, borderWidth:2 },
      { label:"Naive baseline", data:[], borderColor:"#9FAA88", borderDash:[4,4], fill:false, tension:0.3, pointRadius:0, borderWidth:1.5 },
    ]},
    options:{
      animation:false, responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:"#9FAA88", font:{family:"IBM Plex Mono", size:10} } } },
      scales:{
        x:{ ticks:{ color:"#7C8968", font:{size:9} }, grid:{ color:"rgba(255,255,255,0.03)" } },
        y:{ ticks:{ color:"#7C8968", font:{size:9} }, grid:{ color:"rgba(255,255,255,0.03)" }, title:{display:true,text:"kg CO₂",color:"#9FAA88",font:{size:10}} }
      }
    }
  });
}

// ---- Pulse strip canvas (signature element) ------------------------------
const pulseCanvas = document.getElementById("pulseCanvas");
const pulseCtx = pulseCanvas.getContext("2d");
let pulseHistory = [];
function drawPulse(){
  const dpr = window.devicePixelRatio || 1;
  const w = pulseCanvas.clientWidth, h = pulseCanvas.clientHeight;
  pulseCanvas.width = w*dpr; pulseCanvas.height = h*dpr;
  pulseCtx.setTransform(dpr,0,0,dpr,0,0);
  pulseCtx.clearRect(0,0,w,h);

  if(pulseHistory.length < 2) return;
  const max = 650, min = 60;
  const n = pulseHistory.length;
  pulseCtx.lineWidth = 2;
  pulseCtx.beginPath();
  pulseHistory.forEach((v,i) => {
    const x = (i/(n-1)) * w;
    const y = h - ((v-min)/(max-min)) * h;
    if(i===0) pulseCtx.moveTo(x,y); else pulseCtx.lineTo(x,y);
  });
  const last = pulseHistory[pulseHistory.length-1];
  const zone = zoneFor(last);
  const color = zone==="clean" ? "#7ED45A" : zone==="medium" ? "#F0A83E" : "#E35A3A";
  pulseCtx.strokeStyle = color;
  pulseCtx.shadowColor = color;
  pulseCtx.shadowBlur = 8;
  pulseCtx.stroke();
  pulseCtx.shadowBlur = 0;

  // glow dot at the end
  const lastX = w, lastY = h - ((last-min)/(max-min))*h;
  pulseCtx.beginPath();
  pulseCtx.arc(lastX-3, lastY, 3.5, 0, Math.PI*2);
  pulseCtx.fillStyle = color;
  pulseCtx.fill();
}

// ---- Render loop -----------------------------------------------------
function fmtClock(min){
  const h = Math.floor(min/60)%24, m = Math.floor(min%60);
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
}

// Region cards are built once, so their <canvas> elements and the Chart.js
// instances attached to them persist. Every render() call after that only
// updates numbers, badges, and chart data; it never rebuilds the DOM or charts.
function initRegionStrip(){
  const strip = document.getElementById("regionStrip");
  strip.innerHTML = "";
  REGIONS.forEach(r => {
    const card = document.createElement("div");
    card.className = "region-card";
    card.innerHTML = `
      <div class="r-top">
        <div><div class="r-name">${r.name}</div><div class="r-desc">${r.desc}</div></div>
        <span class="badge" id="badge-${r.id}">...</span>
      </div>
      <div class="r-value" id="value-${r.id}">0 <span>gCO₂/kWh</span></div>
      <canvas id="spark-${r.id}" class="r-spark"></canvas>
    `;
    strip.appendChild(card);
  });
  initSparklines();
}

function render(){
  document.getElementById("clockVal").textContent = fmtClock(simMinutes);

  // best region right now, drives the pulse strip
  let bestVal = Infinity;
  REGIONS.forEach(r => { const v = carbonIntensity(r, simMinutes); if(v < bestVal) bestVal = v; });
  pulseHistory.push(bestVal);
  if(pulseHistory.length > 120) pulseHistory.shift();
  document.getElementById("pulseVal").textContent = bestVal;
  drawPulse();

  // region cards: update values/badges in place, update (don't recreate) sparklines
  REGIONS.forEach(r => {
    const v = carbonIntensity(r, simMinutes);
    const zone = zoneFor(v);
    document.getElementById("badge-"+r.id).className = "badge "+zone;
    document.getElementById("badge-"+r.id).textContent = zone.toUpperCase();
    document.getElementById("value-"+r.id).innerHTML = `${v} <span>gCO₂/kWh</span>`;

    const c = sparkCharts[r.id];
    const pts = [];
    for(let i=12;i>=0;i--) pts.push(carbonIntensity(r, simMinutes - i*10));
    c.data.labels = pts.map((_,i)=>i);
    c.data.datasets[0].data = pts;
    c.data.datasets[0].borderColor = zone==="clean" ? "#7ED45A" : zone==="medium" ? "#F0A83E" : "#E35A3A";
    c.update("none");
  });

  // timeline
  const tl = document.getElementById("timeline");
  tl.innerHTML = "";
  [...jobs].reverse().slice(0,14).forEach(j => {
    const row = document.createElement("div");
    row.className = "tl-row";
    const pct = j.status==="running" ? 100 : j.status==="completed" ? 100 : j.status==="critical" ? 100 : Math.min(90, 20 + (simMinutes-j.submittedAt));
    row.innerHTML = `
      <div class="tl-name">${j.name}</div>
      <div class="tl-track"><div class="tl-bar ${j.priority==='critical'?'critical':j.status}" style="width:${pct}%"></div></div>
      <div class="tl-status ${j.priority==='critical'?'critical':j.status}">${j.status}</div>
    `;
    row.onclick = () => showDrill(j);
    tl.appendChild(row);
  });

  // savings chart
  if(!savingsChart) initSavingsChart();
  const labelT = fmtClock(simMinutes);
  savingsChart.data.labels.push(labelT);
  savingsChart.data.datasets[0].data.push(Number(cumulativeSavedKg.toFixed(2)));
  savingsChart.data.datasets[1].data.push(Number(cumulativeBaselineKg.toFixed(2)));
  if(savingsChart.data.labels.length > 40){ savingsChart.data.labels.shift(); savingsChart.data.datasets.forEach(d=>d.data.shift()); }
  savingsChart.update();
  const pctSaved = cumulativeBaselineKg > 0 ? (cumulativeSavedKg/cumulativeBaselineKg*100) : 0;
  document.getElementById("savingsSub").textContent = `${cumulativeSavedKg.toFixed(1)} kg CO₂ saved (${pctSaved.toFixed(0)}%)`;

  // history table
  const hb = document.getElementById("histBody");
  hb.innerHTML = "";
  history.slice(0,10).forEach(j => {
    const delayedMin = Math.max(0, j.execAt - j.submittedAt);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${j.name}</td>
      <td>${j.priority}</td>
      <td class="mono">${j.execIntensity} g</td>
      <td>${delayedMin > 0 ? delayedMin+" min" : "No"}</td>
      <td class="mono">${fmtClock(j.execAt)}</td>
    `;
    hb.appendChild(tr);
  });

  // budgets
  const bl = document.getElementById("budgetList");
  bl.innerHTML = "";
  NAMESPACES.forEach(ns => {
    const pct = Math.min(100, (ns.usedKg/ns.budgetKg)*100);
    const color = pct > 90 ? "#E35A3A" : pct > 65 ? "#F0A83E" : "#7ED45A";
    const row = document.createElement("div");
    row.className = "budget-row";
    row.innerHTML = `
      <div class="budget-top"><span class="ns">${ns.name}</span><span class="nums mono">${ns.usedKg.toFixed(1)} / ${ns.budgetKg} kg</span></div>
      <div class="budget-track"><div class="budget-fill" style="width:${pct}%;background:${color}"></div></div>
    `;
    bl.appendChild(row);
  });

  // docker ps
  const db = document.getElementById("dockerBody");
  db.innerHTML = "";
  containers.slice(-8).reverse().forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.image}</td>
      <td><span class="dot ${c.status==='Up'?'up':'exited'}"></span>${c.status}</td>
      <td>${c.region}</td>
      <td>${c.ns}</td>
    `;
    db.appendChild(tr);
  });
}

// ---- Decision drill-down ----------------------------------------------
function showDrill(job){
  const modal = document.getElementById("drillModal");
  const d = job.lastDecision;
  modal.innerHTML = `
    <h3>${job.name}</h3>
    <div class="sub mono">${job.id} · ${job.priority} · ${job.namespace}</div>
    ${d ? `
      <div style="margin-top:14px;font-size:13px;line-height:1.7;">
        <div>Best region: <b>${d.region.name}</b></div>
        <div>Current intensity: <span class="mono">${d.current} gCO₂/kWh</span></div>
        <div>Forecast trend (next 2h): <span class="mono">${d.trend>0?'+':''}${d.trend}</span></div>
        <div>Urgency pressure: <span class="mono">${d.urgency.toFixed(2)}</span> (waited ${Math.round(d.waitedMin)}/${d.slaWindow} min of SLA)</div>
        <div>Policy score: <span class="mono">${d.score.toFixed(3)}</span> <span style="color:var(--text-dim)">(lower = better time to run)</span></div>
        <div style="margin-top:8px;color:var(--text-dim);">status: <b style="color:var(--text-primary)">${job.status}</b>${job.deferReason ? ', '+job.deferReason : ''}${job.runReason ? ', '+job.runReason : ''}</div>
      </div>
    ` : `<div class="sub">Critical tier: bypassed scoring entirely.</div>`}
    <div class="modal-actions"><button class="btn ghost" id="closeDrill">Close</button></div>
  `;
  document.getElementById("drillOverlay").classList.add("show");
  document.getElementById("closeDrill").onclick = () => document.getElementById("drillOverlay").classList.remove("show");
}

// ---- LLM report panel ---------------------------------------------------
// Tries a real backend endpoint first; falls back to a templated summary
// built from the numbers already on screen, so the demo never breaks if
// the API key / backend isn't reachable from the venue.
async function generateReport(){
  const btn = document.getElementById("genReportBtn");
  const body = document.getElementById("llmBody");
  btn.disabled = true; btn.textContent = "Generating…";
  body.innerHTML = `<div class="llm-placeholder">Generating report…</div>`;

  const stats = {
    saved_kg: Number(cumulativeSavedKg.toFixed(1)),
    baseline_kg: Number(cumulativeBaselineKg.toFixed(1)),
    pct_saved: cumulativeBaselineKg ? Number((cumulativeSavedKg/cumulativeBaselineKg*100).toFixed(0)) : 0,
    jobs_run: history.length,
    jobs_deferred: jobs.filter(j=>j.status==="deferred").length,
    window: fmtClock(simMinutes),
  };

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stats),
    });
    if(!res.ok) throw new Error("backend not available");
    const data = await res.json();
    body.innerHTML = `<p>${data.report}</p>`;
  } catch(err){
    // Fallback: template-based report, still useful and demo-safe.
    body.innerHTML = `
      <p>Over the current window, the scheduler avoided an estimated
      <b>${stats.saved_kg} kg CO₂</b> (${stats.pct_saved}%) versus a carbon-naive
      baseline that ignores grid conditions, by running <b>${stats.jobs_run}</b>
      workloads in cleaner windows/regions and holding <b>${stats.jobs_deferred}</b>
      lower-priority job(s) for a cleaner slot.</p>
      <div class="llm-tip"><b>Note:</b> live LLM backend not reachable, showing a
      template-generated summary instead of a Claude-generated one.</div>
    `;
  } finally {
    btn.disabled = false; btn.textContent = "Regenerate report";
  }
}

// ---- Wire up controls ----------------------------------------------
document.getElementById("speedSlider").addEventListener("input", e => {
  speed = Number(e.target.value);
  document.getElementById("speedLabel").textContent = speed + "x";
});
document.getElementById("genReportBtn").addEventListener("click", generateReport);

document.getElementById("submitJobBtn").onclick = () => document.getElementById("submitOverlay").classList.add("show");
document.getElementById("cancelSubmit").onclick = () => document.getElementById("submitOverlay").classList.remove("show");
document.getElementById("confirmSubmit").onclick = () => {
  const name = document.getElementById("jobName").value.trim();
  const priority = document.getElementById("jobPriority").value;
  const namespace = document.getElementById("jobNamespace").value;
  const runtime = Number(document.getElementById("jobRuntime").value) || 15;
  submitJob({ name, priority, namespace, runtime });
  document.getElementById("submitOverlay").classList.remove("show");
  document.getElementById("jobName").value = "";
};
document.getElementById("drillOverlay").addEventListener("click", e => {
  if(e.target.id === "drillOverlay") e.target.classList.remove("show");
});

// ---- Seed a few jobs so the dashboard isn't empty on load ---------------
submitJob({ name:"critical-alerting", priority:"critical", namespace:"platform-eng", runtime:5 });
submitJob({ name:"nightly-etl", priority:"flexible", namespace:"data-science", runtime:45 });
submitJob({ name:"model-eval-batch", priority:"standard", namespace:"ml-training", runtime:25 });

// ---- Main loop: advances the simulation clock and re-renders ------------
// Runs on a fixed interval, not requestAnimationFrame, since this is a data
// dashboard, not an animation, so ~2-3 updates/sec is plenty and keeps
// Chart.js data arrays and table rebuilds from growing every 16ms.
initRegionStrip();
const TICK_MS = 400;
let lastTs = performance.now();
setInterval(() => {
  const now = performance.now();
  const dtSec = (now - lastTs)/1000;
  lastTs = now;
  simMinutes += dtSec * speed;
  tick();
  render();
}, TICK_MS);
