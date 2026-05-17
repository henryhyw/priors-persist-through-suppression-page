/* ============================================================
 * app.js — All animations & interactivity.
 * Scrolly-telling page for "Priors Persist Through Suppression".
 *
 * Sections:
 *   0. Boot utilities (IntersectionObserver, progress, tooltip)
 *   1. Animation 1: The Stroop card (neutral → conflict transition)
 *   2. Paradigm controls (model/style/family/item selectors)
 *   3. Animation 2: Lexical-prior scatter (staggered scatter + OLS draw)
 *   4. Behavioral results: forest + heatmap
 *   5. Animation 3: Activation patching schematic (clean → corrupted injection)
 *   6. Animation 4: Triplet binding triangle
 *   7. Layer-wise patching curves
 *   8. Animation 5: Target-preservation vs distractor-suppression dissociation
 *   9. Logit decomposition cards
 *  10. BibTeX copy
 * ============================================================ */

const D = window.DATA;
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const fmt2 = d3.format("+.2f");
const fmt2u = d3.format(".2f");

const tooltip = $("#tooltip");
function showTip(html, evt) {
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  moveTip(evt);
}
function moveTip(evt) {
  const pad = 12;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let x = evt.clientX + pad;
  let y = evt.clientY - th - pad;
  if (x + tw > window.innerWidth - 10) x = evt.clientX - tw - pad;
  if (y < 8) y = evt.clientY + pad;
  tooltip.style.left = (x + window.scrollX) + "px";
  tooltip.style.top  = (y + window.scrollY) + "px";
}
function hideTip() { tooltip.classList.remove("show"); }

function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
const relationPhrase = (fam) => fam === "antonym" ? "a synonym of" : "a word related to";


// ============================================================
// 0. Boot: reveal-on-scroll, progress bar, nav state
// ============================================================
function initReveal() {
  const els = $$(".reveal");
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  els.forEach(el => obs.observe(el));
}

function initProgress() {
  const bar = $("#progress");
  const nav = $("#topnav");
  const onScroll = () => {
    const sc = window.scrollY;
    const tot = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (sc / tot * 100) + "%";
    nav.classList.toggle("scrolled", sc > 30);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// IntersectionObserver that fires only the first time (used for triggered animations)
function onceVisible(el, cb, threshold = 0.35) {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { cb(); obs.unobserve(el); }
    });
  }, { threshold });
  obs.observe(el);
}


// ============================================================
// 1. Animation 1 — The Stroop Card (neutral → conflict)
// ============================================================
const Stroop = (function () {
  let state = {
    modelId: "gemma-2-2b-it",
    style: "glossary",
    family: "arbitrary",
    itemId: "arb-04",
    query: "doctor",
    target: "forest",
    distractor: "hospital",
    neutral: "class",
  };
  let step = 0;  // 0=empty, 1=neutral text, 2=neutral bars, 3=conflict text, 4=conflict bars, 5=delta
  let isPlaying = false;
  let playGen = 0;  // bumped on every play() / refresh() — old plays self-abort.

  function getNumbers() {
    // Per-(model, item, style) real data from CSV.
    const cell = (D.perItem?.[state.itemId]?.[state.modelId]?.[state.style]);
    if (cell) {
      // Sync the displayed neutral word to the representative one for this combo.
      state.neutral = cell.neutralExample.word;
      return {
        conf: { lt: cell.conflict.logP_t, ld: cell.conflict.logP_d, S: cell.conflict.S },
        neu:  { lt: cell.neutralExample.logP_t, ld: cell.neutralExample.logP_d, S: cell.neutralExample.S },
        delta: cell.deltaVisual,
        deltaPaper: cell.deltaPaper,
        neutralMeanS: cell.neutralMeanS,
      };
    }
    // Fallback: derive plausible values from per-cell Δ.
    const cellDelta = (D.cellByFamily[state.modelId] || {})[state.family] ?? 2.5;
    const neutralS = 8.0;
    const conflictS = neutralS - cellDelta;
    return {
      conf: { lt: -1.5, ld: -1.5 - conflictS, S: conflictS },
      neu:  { lt: -1.0, ld: -1.0 - neutralS,  S: neutralS },
      delta: cellDelta,
      deltaPaper: cellDelta,
      neutralMeanS: neutralS,
    };
  }

  function renderTexts() {
    const tpl = D.promptTemplates[state.style];
    const rel = relationPhrase(state.family);

    const conflictHTML = tpl
      .replace(/\{subject\}/g, `<span class="q">${escapeHTML(state.query)}</span>`)
      .replace(/\{meaning\}/g, `<span class="t">${escapeHTML(state.target)}</span>`)
      .replace(/\{query\}/g,   `<span class="q">${escapeHTML(state.query)}</span>`)
      .replace(/\{relation\}/g, escapeHTML(rel));

    const neutralHTML = tpl
      .replace(/\{subject\}/g, `<span class="q">${escapeHTML(state.neutral)}</span>`)
      .replace(/\{meaning\}/g, `<span class="t">${escapeHTML(state.target)}</span>`)
      .replace(/\{query\}/g,   `<span class="q">${escapeHTML(state.neutral)}</span>`)
      .replace(/\{relation\}/g, escapeHTML(rel));

    return { conflictHTML, neutralHTML };
  }

  function reset() {
    step = 0;
    const v = getNumbers();   // also syncs state.neutral for current combo

    // Sync all dynamic labels to current state.
    const setText = (id, val) => { const el = $("#"+id); if (el) el.textContent = val; };
    setText("neu-label-word",   state.neutral);
    setText("neu-label-target", state.target);
    setText("conf-label-query", state.query);
    setText("conf-label-target", state.target);
    setText("neu-tname",  state.target);
    setText("neu-dname",  state.distractor);
    setText("conf-tname", state.target);
    setText("conf-dname", state.distractor);
    setText("neu-foot-t", state.target);
    setText("neu-foot-d", state.distractor);
    setText("conf-foot-t", state.target);
    setText("conf-foot-d", state.distractor);

    // Show both full prompts on reset — discoverable demo state.
    const tpl = renderTexts();
    $("#ptext-neutral").innerHTML  = tpl.neutralHTML;
    $("#ptext-conflict").innerHTML = tpl.conflictHTML;
    ["conf-tfill","conf-dfill","neu-tfill","neu-dfill"].forEach(id => { const el = $("#"+id); if (el) el.style.width = "0%"; });
    ["conf-tval","conf-dval","neu-tval","neu-dval","conf-S","neu-S"].forEach(id => { const el = $("#"+id); if (el) el.textContent = "—"; });
    const db = $("#delta-bar"); if (db) db.style.opacity = "0";
    const dv = $("#delta-display");
    if (dv) dv.innerHTML = (v.delta >= 0 ? "+" : "") + v.delta.toFixed(2) + '<span class="nats">nats</span>';
    const ss = $("#stroop-step"); if (ss) ss.textContent = "ready";

    // Takeaway + delta-formula dynamic fields
    const signed = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);
    setText("delta-formula-neutral", state.neutral);
    setText("tk-distractor", state.distractor);
    setText("tk-target",     state.target);
    setText("tk-neu-d",      v.neu.ld.toFixed(2));
    setText("tk-conf-d",     v.conf.ld.toFixed(2));
    setText("tk-delta-visual", signed(v.delta));
    setText("tk-delta-paper",  signed(v.deltaPaper));
  }

  const STEP_LABELS = [
    "ready",
    "neutral prompt",
    "neutral baseline — target wins cleanly",
    "now: conflict prompt",
    "the prior leaks through",
    "Δ — the prior conflict, quantified",
  ];
  function updateStepLabel() {
    const ss = $("#stroop-step");
    if (ss) ss.textContent = STEP_LABELS[step] || `step ${step}`;
  }

  // Tokenize HTML into atomic chunks: tags stay whole, text streams char by char.
  function tokenizeHTML(html) {
    const tokens = [];
    let i = 0;
    while (i < html.length) {
      if (html[i] === "<") {
        const end = html.indexOf(">", i);
        if (end === -1) { tokens.push({ t: "txt", v: html.slice(i) }); break; }
        tokens.push({ t: "tag", v: html.slice(i, end + 1) });
        i = end + 1;
      } else {
        const end = html.indexOf("<", i);
        const stop = end === -1 ? html.length : end;
        const text = html.slice(i, stop);
        for (const ch of text) tokens.push({ t: "ch", v: ch });
        i = stop;
      }
    }
    return tokens;
  }

  async function typewrite(el, html, charDelay = 12, cancelled = null) {
    const tokens = tokenizeHTML(html);
    let buf = "";
    el.innerHTML = "";
    for (const tok of tokens) {
      if (cancelled && cancelled()) return;
      buf += tok.v;
      el.innerHTML = buf;
      if (tok.t === "ch" && tok.v !== "\n") await sleep(charDelay);
    }
  }

  // Map logP to bar width %. Uses both prompts' values to pick a stable scale.
  function barPct(lp, all) {
    const mn = Math.min(...all), mx = Math.max(...all);
    const span = mx - mn || 1;
    return 8 + 92 * (lp - mn) / span;
  }

  async function play() {
    const myGen = ++playGen;
    const cancelled = () => myGen !== playGen;
    if (isPlaying) {
      // Old play() will exit at its next checkpoint via cancelled().
    }
    isPlaying = true;
    step = 0;
    ["conf-tfill","conf-dfill","neu-tfill","neu-dfill"].forEach(id => { const el = $("#"+id); if (el) el.style.width = "0%"; });
    ["conf-tval","conf-dval","neu-tval","neu-dval","conf-S","neu-S"].forEach(id => { const el = $("#"+id); if (el) el.textContent = "—"; });
    const db = $("#delta-bar"); if (db) db.style.opacity = "0";
    $("#ptext-neutral").innerHTML  = "";
    $("#ptext-conflict").innerHTML = "";

    const v = getNumbers();
    const tpl = renderTexts();
    const all = [v.conf.lt, v.conf.ld, v.neu.lt, v.neu.ld];

    // Step 1: Type neutral prompt
    if (cancelled()) { isPlaying = false; return; }
    step = 1; updateStepLabel();
    await typewrite($("#ptext-neutral"), tpl.neutralHTML, 12, cancelled);
    if (cancelled()) { isPlaying = false; return; }
    await sleep(300);
    if (cancelled()) { isPlaying = false; return; }

    // Step 2: Neutral bars fill — target wins cleanly
    step = 2; updateStepLabel();
    $("#neu-tval").textContent = v.neu.lt.toFixed(2);
    $("#neu-dval").textContent = v.neu.ld.toFixed(2);
    $("#neu-tfill").style.width = barPct(v.neu.lt, all) + "%";
    $("#neu-dfill").style.width = barPct(v.neu.ld, all) + "%";
    animateNumber($("#neu-S"), 0, v.neu.S, 700, fmt2);
    await sleep(1100);
    if (cancelled()) { isPlaying = false; return; }

    // Step 3: Type conflict prompt
    step = 3; updateStepLabel();
    await typewrite($("#ptext-conflict"), tpl.conflictHTML, 12, cancelled);
    if (cancelled()) { isPlaying = false; return; }
    await sleep(300);
    if (cancelled()) { isPlaying = false; return; }

    // Step 4: Conflict bars fill — the leak moment
    step = 4; updateStepLabel();
    $("#conf-tval").textContent = v.conf.lt.toFixed(2);
    $("#conf-dval").textContent = v.conf.ld.toFixed(2);
    $("#conf-tfill").style.width = barPct(v.conf.lt, all) + "%";
    $("#conf-dfill").style.width = barPct(v.conf.ld, all) + "%";
    animateNumber($("#conf-S"), 0, v.conf.S, 700, fmt2);
    await sleep(1100);
    if (cancelled()) { isPlaying = false; return; }

    // Step 5: Δ reveal
    step = 5; updateStepLabel();
    $("#delta-bar").style.opacity = "1";
    $("#delta-bar").style.transition = "opacity 600ms ease";
    animateNumber($("#delta-display"), 0, v.delta, 900, (x) => fmt2(x) + '<span class="nats">nats</span>', true);

    await sleep(900);
    isPlaying = false;
  }

  function applyItem() {
    const it = D.items.find(i => i.id === state.itemId);
    if (!it) return;
    state.query = it.query;
    state.target = it.target;
    state.distractor = it.distractor;
    state.family = it.family;
  }

  function refreshItems() {
    const items = D.items.filter(it => it.family === state.family);
    populateSelect("#par-item", items, it => ({
      value: it.id,
      label: `${it.query} → ${it.target}  (vs. ${it.distractor})`
    }), state.itemId);
    if (!items.some(it => it.id === state.itemId)) {
      state.itemId = items[0].id;
      const el = $("#par-item"); if (el) el.value = state.itemId;
    }
    applyItem();
  }

  // Sync state to current dropdown picks, pre-compute numbers (this also syncs
  // state.neutral to the representative neutral for this combo), then re-render.
  function refresh() {
    playGen++;        // cancel any in-flight play()
    isPlaying = false;
    applyItem();
    getNumbers();
    reset();
  }

  function init() {
    populateSelect("#par-model", D.models, m => ({
      value: m.id,
      label: m.label + (m.mech ? "  ◆" : "")
    }), state.modelId);

    populateSelect("#par-style", D.promptStyles, s => ({
      value: s.id, label: s.label
    }), state.style);

    populateSelect("#par-family", D.conflictFamilies, f => ({
      value: f.id, label: f.label
    }), state.family);

    refreshItems();

    const wire = (sel, key, post) => {
      const el = $(sel); if (!el) return;
      el.addEventListener("change", () => { state[key] = el.value; if (post) post(); refresh(); });
    };
    wire("#par-model",  "modelId");
    wire("#par-style",  "style");
    wire("#par-family", "family", refreshItems);
    wire("#par-item",   "itemId");

    const btnPlay = $("#stroop-play");
    const btnReset = $("#stroop-reset");
    if (btnPlay)  btnPlay.addEventListener("click", play);
    if (btnReset) btnReset.addEventListener("click", reset);

    refresh();   // initial render with correct state.neutral
    const stage = $("#stroop-stage");
    if (stage) onceVisible(stage, () => setTimeout(play, 400), 0.4);
  }

  return { init };
})();

// Helpers used by Stroop
function populateSelect(sel, arr, fn, current) {
  const el = $(sel);
  if (!el) return;  // HTML may not include this selector; skip silently.
  el.innerHTML = "";
  arr.forEach(a => {
    const { value, label } = fn(a);
    const o = document.createElement("option");
    o.value = value; o.textContent = label;
    if (value === current) o.selected = true;
    el.appendChild(o);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function animateNumber(el, from, to, dur, fmt, asHTML = false) {
  const t0 = performance.now();
  function tick(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * eased;
    if (asHTML) el.innerHTML = fmt(v); else el.textContent = fmt(v);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


// ============================================================
// 3. Animation 2 — Lexical-prior scatter
// ============================================================
const Scatter = (function () {
  let drawn = false;

  function draw() {
    if (drawn) return;
    drawn = true;

    const container = $("#scatter-chart");
    const rect = container.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 56, left: 60 };
    const W = Math.max(640, rect.width - margin.left - margin.right);
    const H = 440;

    d3.select(container).selectAll("*").remove();
    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Domain derived from real data — clip extreme outliers.
    const pts = D.scatter.points;
    const xExtent = d3.extent(pts, d => d.x);
    const yExtent = d3.extent(pts, d => d.y);
    const xDom = [Math.floor(xExtent[0]) - 1, Math.ceil(xExtent[1]) + 1];
    const yDom = [Math.min(-6, Math.floor(yExtent[0])), Math.max(12, Math.ceil(yExtent[1]))];

    const x = d3.scaleLinear().domain(xDom).range([0, W]);
    const y = d3.scaleLinear().domain(yDom).range([H, 0]);

    // Grid
    g.append("g").attr("class", "grid")
      .call(d3.axisBottom(x).tickSize(H).tickFormat("").ticks(8))
      .call(g => g.select(".domain").remove());
    g.append("g").attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-W).tickFormat("").ticks(6))
      .call(g => g.select(".domain").remove());

    // Family color
    const famColor = {
      antonym:     "var(--fam-olmo)",      // purple
      arbitrary:   "var(--fam-mistral)",   // red-orange
      polysemy:    "var(--fam-qwen)",      // teal
      "domain-def":"var(--fam-gemma)",     // gold
    };

    // Real points — 7,744 of them. Render as small dots, no per-point transition.
    const ptsG = g.append("g").attr("class", "points");
    const circles = ptsG.selectAll("circle")
      .data(pts).enter().append("circle")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", 1.3)
      .attr("fill", d => famColor[d.family])
      .attr("opacity", 0);

    // Stagger reveal by family (batched, not per-point)
    const families = ["antonym", "arbitrary", "polysemy", "domain-def"];
    families.forEach((fam, i) => {
      circles.filter(d => d.family === fam)
        .transition()
        .delay(120 + i * 220)
        .duration(500)
        .attr("opacity", 0.28);
    });

    // OLS line — draw with stroke-dasharray animation
    const xLo = -5, xHi = 21;
    const yLo = D.scatter.olsIntercept + D.scatter.olsSlope * xLo;
    const yHi = D.scatter.olsIntercept + D.scatter.olsSlope * xHi;
    const line = g.append("line")
      .attr("x1", x(xLo)).attr("y1", y(yLo))
      .attr("x2", x(xHi)).attr("y2", y(yHi))
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round");
    const lineLen = line.node().getTotalLength();
    line.attr("stroke-dasharray", `${lineLen} ${lineLen}`)
        .attr("stroke-dashoffset", lineLen)
        .transition().delay(1200).duration(1100).ease(d3.easeCubicInOut)
        .attr("stroke-dashoffset", 0);

    // Slope annotation
    g.append("text")
      .attr("x", x(20)).attr("y", y(yHi) - 12)
      .attr("text-anchor", "end")
      .attr("class", "annot")
      .style("fill", "var(--accent)")
      .style("font-weight", "500")
      .style("opacity", 0)
      .text(`OLS slope = +${D.scatter.olsSlope}`)
      .transition().delay(2100).duration(500).style("opacity", 1);

    // Decile means
    D.scatter.decileMeans.forEach((d, i) => {
      const grp = g.append("g")
        .attr("transform", `translate(${x(d.x)}, ${y(d.y)})`)
        .style("opacity", 0);
      grp.append("line")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", y(d.y - d.se) - y(d.y)).attr("y2", y(d.y + d.se) - y(d.y))
        .attr("stroke", "var(--text)").attr("stroke-width", 1.4);
      grp.append("circle")
        .attr("r", 5)
        .attr("fill", "var(--bg-card)")
        .attr("stroke", "var(--text)")
        .attr("stroke-width", 1.6)
        .style("cursor", "pointer")
        .on("mouseenter", evt => showTip(`
          <span class="lbl">decile mean</span><br>
          <span class="lbl">x:</span> ${d.x.toFixed(2)} &nbsp;
          <span class="lbl">Δ:</span> ${d.y.toFixed(2)} ± ${d.se.toFixed(2)}
        `, evt))
        .on("mousemove", moveTip)
        .on("mouseleave", hideTip);
      grp.transition().delay(2400 + i * 60).duration(360).style("opacity", 1);
    });

    // Axes
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(8));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));

    g.append("text").attr("class", "axis-label")
      .attr("x", W/2).attr("y", H + 42).attr("text-anchor", "middle")
      .text("Lexical-prior advantage   log P(distractor) − log P(target)");
    g.append("text").attr("class", "axis-label")
      .attr("transform", `translate(-44, ${H/2}) rotate(-90)`).attr("text-anchor", "middle")
      .text("Stroop interference Δ");

    // Family legend
    const legend = svg.append("g").attr("transform", `translate(${margin.left + 14}, ${margin.top + 14})`);
    Object.entries(famColor).forEach(([fam, c], i) => {
      const row = legend.append("g").attr("transform", `translate(0, ${i * 18})`).style("opacity", 0);
      row.append("circle").attr("r", 4).attr("fill", c);
      row.append("text").attr("x", 10).attr("dy", "0.32em")
        .text(D.conflictFamilies.find(f => f.id === fam).label)
        .style("font-family", "var(--font-mono)").style("font-size", "11px").attr("fill", "var(--text-soft)");
      row.transition().delay(3000 + i * 120).duration(360).style("opacity", 1);
    });
  }

  function init() {
    onceVisible($("#scatter-stage"), draw, 0.25);
    $("#scatter-replay").addEventListener("click", () => { drawn = false; draw(); });
  }

  return { init };
})();


// ============================================================
// 3b. Regression table
// ============================================================
function renderRegressionTable() {
  const tb = $("#reg-tbl tbody");
  if (!tb) return;
  tb.innerHTML = "";
  D.controlledRegression.forEach(r => {
    const tr = document.createElement("tr");
    const cls = r.coef > 0 ? "pos" : "neg";
    tr.innerHTML = `
      <td class="term">${r.term}</td>
      <td class="${cls}">${fmt2(r.coef)}</td>
      <td>[${fmt2(r.ci[0])}, ${fmt2(r.ci[1])}]</td>
      <td>${r.p}</td>
    `;
    tb.appendChild(tr);
  });
}

function renderRobustnessTable() {
  const tb = $("#robust-tbl tbody");
  if (!tb) return;
  tb.innerHTML = "";
  D.regressionRobustness.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="term">${r.spec}</td>
      <td class="pos">${fmt2(r.coef)}</td>
      <td>[${fmt2(r.ci[0])}, ${fmt2(r.ci[1])}]</td>
      <td>${r.p}</td>
    `;
    tb.appendChild(tr);
  });
}


// ============================================================
// 4. Forest plot
// ============================================================
function renderForest() {
  const container = $("#forest-chart");
  const rect = container.getBoundingClientRect();
  const margin = { top: 24, right: 56, bottom: 40, left: 132 };
  // Follow the container — don't floor at a fixed minimum, which made the
  // SVG scale down and the chart appear half-height in compact containers.
  const W = Math.max(200, rect.width - margin.left - margin.right);
  const H = D.models.length * 36;

  const models = [...D.models].sort((a, b) => D.modelLevel[a.id].delta - D.modelLevel[b.id].delta);
  const familyColor = {
    Qwen:    "var(--fam-qwen)",
    Gemma:   "var(--fam-gemma)",
    OLMo:    "var(--fam-olmo)",
    Mistral: "var(--fam-mistral)",
  };

  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xMin = Math.min(0, d3.min(models, m => D.modelLevel[m.id].ci[0]) - 0.1);
  const xMax = d3.max(models, m => D.modelLevel[m.id].ci[1]) + 0.1;
  const x = d3.scaleLinear().domain([xMin, xMax]).range([0, W]);
  const y = d3.scaleBand().domain(models.map(m => m.id)).range([0, H]).padding(0.3);

  // Vertical zero line
  g.append("line")
    .attr("x1", x(0)).attr("x2", x(0))
    .attr("y1", -4).attr("y2", H + 4)
    .attr("stroke", "var(--line-strong)").attr("stroke-dasharray", "3,3");

  // Grid
  g.append("g").attr("class", "grid")
    .call(d3.axisBottom(x).tickSize(H).ticks(6).tickFormat(""))
    .call(g => g.select(".domain").remove());

  const rows = g.selectAll(".forest-row")
    .data(models).enter().append("g")
    .attr("class", "forest-row")
    .attr("transform", d => `translate(0, ${y(d.id) + y.bandwidth()/2})`)
    .style("opacity", 0);

  rows.append("line")
    .attr("x1", d => x(D.modelLevel[d.id].ci[0]))
    .attr("x2", d => x(D.modelLevel[d.id].ci[1]))
    .attr("stroke", d => familyColor[d.family])
    .attr("stroke-width", 1.6)
    .attr("opacity", 0.55);

  rows.append("circle")
    .attr("cx", d => x(D.modelLevel[d.id].delta))
    .attr("r", 5)
    .attr("fill", d => d.tuning === "instruct" ? "var(--bg-card)" : familyColor[d.family])
    .attr("stroke", d => familyColor[d.family])
    .attr("stroke-width", 1.6);

  rows.append("text")
    .attr("x", -14).attr("dy", "0.32em").attr("text-anchor", "end")
    .attr("class", "model-name")
    .text(d => d.label);

  rows.append("text")
    .attr("x", d => x(D.modelLevel[d.id].ci[1]) + 8)
    .attr("dy", "0.32em")
    .attr("class", "val")
    .text(d => fmt2u(D.modelLevel[d.id].delta));

  // Reveal animation
  rows.transition().delay((d, i) => 100 + i * 60).duration(400).style("opacity", 1);

  // X axis
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(6));

  g.append("text").attr("class", "axis-label")
    .attr("x", W/2).attr("y", H + 32).attr("text-anchor", "middle")
    .text("Stroop interference Δ (nats)");

  // Family color legend
  const leg = svg.append("g").attr("transform", `translate(${margin.left + W - 200}, ${margin.top - 6})`);
  Object.entries(familyColor).forEach(([f, c], i) => {
    const row = leg.append("g").attr("transform", `translate(${i * 56}, 0)`);
    row.append("circle").attr("r", 3.5).attr("fill", c);
    row.append("text").attr("x", 9).attr("dy", "0.32em").style("font-family", "var(--font-mono)").style("font-size", "10.5px").attr("fill", "var(--text-mute)").text(f);
  });
}


// ============================================================
// 4b. Heatmap (family / style toggle)
// ============================================================
let heatmapMode = "family";
function renderHeatmap() {
  const container = $("#heatmap-chart");
  const rect = container.getBoundingClientRect();
  const cols = heatmapMode === "family" ? D.conflictFamilies : D.promptStyles;
  const dataSrc = heatmapMode === "family" ? D.cellByFamily : D.cellByStyle;

  // Same cellW for both modes — keeps SVG aspect identical when toggling.
  const cellW = 130;
  const cellH = 36;
  const labelW = 160, colH = 56;
  const W = labelW + cellW * cols.length;
  const H = colH + cellH * D.models.length;

  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W + 20} ${H + 40}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(10, 10)`);

  // Color: cream-friendly diverging
  const color = d3.scaleSequential(d3.interpolateRgbBasis([
    "#9d3a2f",      // strong neg
    "#c97863",      // neg
    "#f4e7d4",      // near zero (warm cream)
    "#a8d4c4",      // mild positive
    "#3a8a73",      // mid positive
    "#1a5f4a",      // strong positive
  ])).domain([-1, 6.5]);

  // Column labels
  cols.forEach((c, j) => {
    g.append("text")
      .attr("x", labelW + j * cellW + cellW/2)
      .attr("y", colH - 14)
      .attr("text-anchor", "middle")
      .attr("class", "axis-label")
      .style("fill", "var(--text-soft)")
      .style("font-size", "12px")
      .text(c.label);
  });

  // Rows
  D.models.forEach((m, i) => {
    g.append("text")
      .attr("x", labelW - 12).attr("y", colH + i * cellH + cellH/2)
      .attr("dy", "0.32em").attr("text-anchor", "end")
      .attr("class", "axis-label").style("fill", "var(--text-soft)")
      .text(m.label);

    cols.forEach((c, j) => {
      const v = (dataSrc[m.id] || {})[c.id];
      const cell = g.append("g").attr("transform", `translate(${labelW + j * cellW}, ${colH + i * cellH})`);
      cell.append("rect")
        .attr("width", cellW - 5).attr("height", cellH - 5)
        .attr("rx", 4)
        .attr("fill", v == null ? "var(--bg-warm)" : color(v))
        .attr("stroke", "var(--bg-card)")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("pointerenter", function (evt) {
          // Clear any stuck strokes from previous tap (touch devices don't fire pointerleave on tap-elsewhere).
          d3.select(container).selectAll("rect").attr("stroke", "var(--bg-card)").attr("stroke-width", 1.5);
          d3.select(this).attr("stroke", "var(--text)").attr("stroke-width", 2);
          $("#heatmap-detail").innerHTML = `
            <span class="hint">${m.label}</span> · 
            <span class="hint">${heatmapMode}:</span> <span class="v">${c.label}</span> · 
            <span class="hint">Δ =</span> <span class="v">${v == null ? "—" : v.toFixed(2)}</span> <span class="hint">nats</span>
          `;
        })
        .on("pointerleave", function (evt) {
          // Only un-highlight if this isn't a touch tap (touch leaves immediately after enter).
          if (evt.pointerType !== "touch") {
            d3.select(this).attr("stroke", "var(--bg-card)").attr("stroke-width", 1.5);
          }
        });

      cell.append("text")
        .attr("x", (cellW-5)/2).attr("y", (cellH-5)/2)
        .attr("text-anchor", "middle").attr("dy", "0.32em")
        .attr("fill", v != null && (v > 4 || v < -0.3) ? "white" : "var(--text)")
        .style("font-family", "var(--font-mono)").style("font-size", "12px")
        .style("font-feature-settings", '"tnum"').style("pointer-events", "none")
        .text(v == null ? "—" : v.toFixed(2));
    });
  });
}

function initHeatmapToggle() {
  $$("#heatmap-mode .btn-mini").forEach(b => {
    b.addEventListener("click", () => {
      $$("#heatmap-mode .btn-mini").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      heatmapMode = b.dataset.mode;
      renderHeatmap();
    });
  });
}


// ============================================================
// 5. Animation 3 — Activation patching schematic
// ============================================================
const Patching = (function () {
  let activeSource = "full_triplet";
  let svg = null;

  // Schematic geometry. Two transformer "blocks" side by side.
  const W = 980, H = 480;
  const blockW = 280, blockH = 280;
  const cleanX = 80, corruptX = W - blockW - 80;
  const blockY = 140;
  const tokens = ["In", "this", "game", "subject", "means", "target", "...", "query", "is"];
  const tokIdx = { subject: 3, target: 5, query: 7 };
  const cleanTokens = ["In","this","game","view","means","big","...","view","is"];
  const corruptTokens = ["In","this","game","small","means","big","...","small","is"];

  // R values per source (Gemma-2-2B values from Table 2 / 14)
  const R_BY_SOURCE = {
    def_subject:  0.07,
    def_target:   0.22,
    query_word:   0.30,
    full_triplet: 1.05,
  };
  const R_DESCRIPTIONS = {
    def_subject:  "barely moves the needle",
    def_target:   "partial recovery",
    query_word:   "about a third",
    full_triplet: "full recovery",
  };

  function updateHint() {
    const el = $("#patch-hint");
    if (!el) return;
    const R = R_BY_SOURCE[activeSource];
    const desc = R_DESCRIPTIONS[activeSource];
    el.innerHTML = `expected <span class="v">R ≈ ${R.toFixed(2)}</span> &nbsp;<span class="desc">— ${desc}</span>`;
  }
  // After patching, target↑ and distractor↓ proportional to R.
  // Initial (corrupted): target = 5, distractor = 10 (units: log-prob, just for viz).
  function patchedLogits(R) {
    const tStart = 5, dStart = 10;
    const tEnd   = 9, dEnd   = 4;     // clean values
    return {
      t: tStart + R * (tEnd - tStart),
      d: dStart + R * (dEnd - dStart),
    };
  }

  function draw() {
    const container = $("#patch-chart");
    d3.select(container).selectAll("*").remove();
    svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Title labels
    svg.append("text").attr("x", cleanX + blockW/2).attr("y", 28)
      .attr("text-anchor", "middle").attr("class", "annot")
      .style("font-family", "var(--font-display)").style("font-size", "18px").style("fill", "var(--target)")
      .style("font-style", "italic")
      .text("Clean run (neutral)");
    svg.append("text").attr("x", corruptX + blockW/2).attr("y", 28)
      .attr("text-anchor", "middle").attr("class", "annot")
      .style("font-family", "var(--font-display)").style("font-size", "18px").style("fill", "var(--distractor)")
      .style("font-style", "italic")
      .text("Corrupted run (conflict)");

    // Prompt strips
    drawPromptStrip(svg, cleanX, 60, cleanTokens, "var(--target)");
    drawPromptStrip(svg, corruptX, 60, corruptTokens, "var(--distractor)");

    // Transformer block schematics
    drawBlock(svg, cleanX, blockY, blockW, blockH, "var(--target)", "clean", cleanTokens);
    drawBlock(svg, corruptX, blockY, blockW, blockH, "var(--distractor)", "corrupt", corruptTokens);

    // Logit output panel on the right
    drawLogitPanel(svg, W - 180, blockY + blockH + 30);

    // Initial state: corrupted only, R=0
    setLogits({ t: 5, d: 10 }, 0, false);
  }

  function drawPromptStrip(svg, x, y, toks, color) {
    const tokW = blockW / toks.length;
    const g = svg.append("g").attr("transform", `translate(${x}, ${y})`);
    toks.forEach((tk, i) => {
      const isKey = i === tokIdx.subject || i === tokIdx.target || i === tokIdx.query;
      const rect = g.append("rect")
        .attr("x", i * tokW).attr("y", 0).attr("width", tokW - 2).attr("height", 28)
        .attr("rx", 4)
        .attr("fill", isKey ? color : "var(--bg-warm)")
        .attr("opacity", isKey ? 0.18 : 1)
        .attr("stroke", isKey ? color : "var(--line)")
        .attr("stroke-width", isKey ? 1.5 : 1);
      g.append("text")
        .attr("x", i * tokW + tokW/2 - 1).attr("y", 14).attr("dy", "0.32em")
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "10.5px")
        .style("fill", isKey ? color : "var(--text-soft)")
        .style("font-weight", isKey ? "500" : "400")
        .text(tk);
    });
  }

  function drawBlock(svg, x, y, w, h, color, kind, toks) {
    const g = svg.append("g").attr("transform", `translate(${x},${y})`).attr("class", `block-${kind}`);
    const nLayers = 8;
    const layerH = h / nLayers;
    const tokW = w / toks.length;

    // Layers: subtle horizontal bands
    for (let l = 0; l < nLayers; l++) {
      g.append("rect")
        .attr("x", 0).attr("y", l * layerH).attr("width", w).attr("height", layerH - 1.5)
        .attr("fill", "var(--bg-warm)")
        .attr("stroke", "var(--line-soft)")
        .attr("stroke-width", 0.5)
        .attr("rx", 1);
    }
    // Token columns: subtle dividers
    for (let t = 1; t < toks.length; t++) {
      g.append("line")
        .attr("x1", t * tokW).attr("x2", t * tokW)
        .attr("y1", 0).attr("y2", h)
        .attr("stroke", "var(--line-soft)").attr("stroke-width", 0.5);
    }
    // Outer frame
    g.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", w).attr("height", h)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.5)
      .attr("rx", 4).attr("opacity", 0.5);

    // Final-position arrow (where readout happens)
    g.append("line")
      .attr("x1", w + 6).attr("x2", w + 22)
      .attr("y1", h/2).attr("y2", h/2)
      .attr("stroke", color).attr("stroke-width", 1.6)
      .attr("marker-end", "url(#arrow-end)");
  }

  function drawLogitPanel(svg, x, y) {
    // Position below the corrupted block
    const g = svg.append("g").attr("transform", `translate(${corruptX + blockW/2 - 80}, ${blockY + blockH + 28})`).attr("class", "logit-panel");
    g.append("text").attr("y", -8)
      .attr("class", "annot").style("font-size", "11px")
      .style("font-family", "var(--font-mono)")
      .style("fill", "var(--text-mute)")
      .text("logits at final position");

    // Target bar
    g.append("text").attr("x", 0).attr("y", 16)
      .style("font-family", "var(--font-mono)").style("font-size", "11.5px")
      .style("fill", "var(--target)").text("big");
    g.append("rect").attr("class", "lbar-t")
      .attr("x", 36).attr("y", 6).attr("width", 0).attr("height", 14)
      .attr("rx", 2).attr("fill", "var(--target)").attr("opacity", 0.7);
    g.append("text").attr("class", "lval-t")
      .attr("x", 146).attr("y", 16).attr("text-anchor", "start")
      .style("font-family", "var(--font-mono)").style("font-size", "11px")
      .style("font-feature-settings", '"tnum"')
      .style("fill", "var(--text)").text("—");

    // Distractor bar
    g.append("text").attr("x", 0).attr("y", 38)
      .style("font-family", "var(--font-mono)").style("font-size", "11.5px")
      .style("fill", "var(--distractor)").text("tiny");
    g.append("rect").attr("class", "lbar-d")
      .attr("x", 36).attr("y", 28).attr("width", 0).attr("height", 14)
      .attr("rx", 2).attr("fill", "var(--distractor)").attr("opacity", 0.7);
    g.append("text").attr("class", "lval-d")
      .attr("x", 146).attr("y", 38).attr("text-anchor", "start")
      .style("font-family", "var(--font-mono)").style("font-size", "11px")
      .style("font-feature-settings", '"tnum"')
      .style("fill", "var(--text)").text("—");

    // Recovery R
    g.append("text").attr("x", 0).attr("y", 70)
      .style("font-family", "var(--font-mono)").style("font-size", "10.5px")
      .style("letter-spacing", "0.12em")
      .style("fill", "var(--text-mute)").text("RECOVERY R");
    g.append("text").attr("x", 0).attr("y", 96).attr("class", "rval")
      .style("font-family", "var(--font-display)").style("font-size", "32px")
      .style("font-style", "italic")
      .style("fill", "var(--accent)")
      .style("font-feature-settings", '"tnum"')
      .text("0.00");

    // Arrow defs
    if (!svg.select("defs").size()) {
      const defs = svg.append("defs");
      defs.append("marker")
        .attr("id", "arrow-end").attr("viewBox", "0 -5 10 10")
        .attr("refX", 8).attr("refY", 0).attr("markerWidth", 8).attr("markerHeight", 8)
        .attr("orient", "auto")
        .append("path").attr("d", "M0,-4 L8,0 L0,4").attr("fill", "var(--distractor)");
    }
  }

  function setLogits(vals, R, animate) {
    const mx = 12;
    const tw = (vals.t / mx) * 100;
    const dw = (vals.d / mx) * 100;
    const sel = svg.select(".logit-panel");
    if (animate) {
      sel.select(".lbar-t").transition().duration(700).attr("width", tw);
      sel.select(".lbar-d").transition().duration(700).attr("width", dw);
      animateNumber(sel.select(".lval-t").node(), +sel.select(".lval-t").text() || 0, vals.t, 700, v => v.toFixed(2));
      animateNumber(sel.select(".lval-d").node(), +sel.select(".lval-d").text() || 0, vals.d, 700, v => v.toFixed(2));
      animateNumber(sel.select(".rval").node(), +sel.select(".rval").text() || 0, R, 800, v => v.toFixed(2));
    } else {
      sel.select(".lbar-t").attr("width", tw);
      sel.select(".lbar-d").attr("width", dw);
      sel.select(".lval-t").text(vals.t.toFixed(2));
      sel.select(".lval-d").text(vals.d.toFixed(2));
      sel.select(".rval").text(R.toFixed(2));
    }
  }

  async function play() {
    // 1. Highlight source position(s) in clean block
    const sources = activeSource === "full_triplet"
      ? ["def_subject", "def_target", "query_word"]
      : [activeSource];

    const tokW = blockW / cleanTokens.length;
    const layerH = blockH / 8;
    const patchLayer = 3;   // middle-ish

    // Remove old particles
    svg.selectAll(".particle, .pulse-glow").remove();

    // For each source, draw a pulsing dot in clean block then animate to corrupted
    for (const src of sources) {
      const idx = tokIdx[src.replace("def_", "").replace("query_word", "query")] ?? tokIdx[src.split("_")[1]];
      const srcKey = src === "def_subject" ? "subject" : src === "def_target" ? "target" : "query";
      const srcIdx = tokIdx[srcKey];

      const sx = cleanX + srcIdx * tokW + tokW/2;
      const sy = blockY + patchLayer * layerH + layerH/2;
      const ex = corruptX + srcIdx * tokW + tokW/2;
      const ey = blockY + patchLayer * layerH + layerH/2;

      // Glow at source
      const glow = svg.append("circle").attr("class", "pulse-glow")
        .attr("cx", sx).attr("cy", sy).attr("r", 4)
        .attr("fill", "var(--accent)")
        .attr("opacity", 0);
      await glow.transition().duration(300).attr("r", 10).attr("opacity", 0.8).end();
      await glow.transition().duration(220).attr("r", 5).attr("opacity", 0.6).end();

      // Particle flying across (curved)
      const particle = svg.append("circle").attr("class", "particle")
        .attr("cx", sx).attr("cy", sy).attr("r", 6)
        .attr("fill", "var(--accent)")
        .attr("opacity", 1)
        .style("filter", "drop-shadow(0 0 6px rgba(204,120,92,0.5))");

      const midX = (sx + ex) / 2;
      const midY = sy - 80;

      const t0 = performance.now();
      const dur = 700;
      await new Promise(res => {
        function tick(t) {
          const p = Math.min(1, (t - t0) / dur);
          const eased = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2)/2;
          // Quadratic Bezier
          const x = (1-eased)*(1-eased)*sx + 2*(1-eased)*eased*midX + eased*eased*ex;
          const y = (1-eased)*(1-eased)*sy + 2*(1-eased)*eased*midY + eased*eased*ey;
          particle.attr("cx", x).attr("cy", y);
          if (p < 1) requestAnimationFrame(tick); else res();
        }
        requestAnimationFrame(tick);
      });

      // Impact: pulse at destination + ripple down through corrupted block
      const impact = svg.append("circle").attr("class", "particle")
        .attr("cx", ex).attr("cy", ey).attr("r", 6)
        .attr("fill", "var(--accent)").attr("opacity", 1);
      impact.transition().duration(400).attr("r", 18).attr("opacity", 0).remove();

      // Token highlight in corrupted block
      svg.append("rect").attr("class", "particle")
        .attr("x", corruptX + srcIdx * tokW + 1).attr("y", blockY)
        .attr("width", tokW - 2).attr("height", blockH)
        .attr("fill", "var(--accent)").attr("opacity", 0)
        .transition().duration(300).attr("opacity", 0.12)
        .transition().duration(900).attr("opacity", 0.04);

      // Layer band downstream wash
      for (let l = patchLayer; l < 8; l++) {
        svg.append("rect").attr("class", "particle")
          .attr("x", corruptX + srcIdx * tokW + 1)
          .attr("y", blockY + l * layerH)
          .attr("width", tokW - 2).attr("height", layerH - 1.5)
          .attr("fill", "var(--target)").attr("opacity", 0)
          .transition().delay((l - patchLayer) * 40).duration(160).attr("opacity", 0.25)
          .transition().duration(500).attr("opacity", 0.08);
      }

      particle.transition().duration(300).attr("opacity", 0).remove();
      glow.transition().duration(300).attr("opacity", 0).remove();
      await sleep(120);
    }

    // Update logits based on recovery
    const R = R_BY_SOURCE[activeSource];
    await sleep(300);
    setLogits(patchedLogits(R), R, true);
  }

  function init() {
    draw();
    updateHint();
    $$("#patch-source .btn-mini").forEach(b => {
      b.addEventListener("click", () => {
        $$("#patch-source .btn-mini").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        activeSource = b.dataset.src;
        draw();
        updateHint();
      });
    });
    $("#patch-play").addEventListener("click", play);
    onceVisible($("#patch-stage"), () => setTimeout(play, 500), 0.3);
  }

  return { init };
})();


// ============================================================
// 6. Animation 4 — Triplet binding triangle
// ============================================================
const Triplet = (function () {
  let modelId = "gemma-2-2b";
  let svg = null;

  // Three positions
  const W = 880, H = 380;
  const cx = W/2, cy = H/2 + 20;
  const radius = 130;
  const positions = [
    { id: "def_subject", label: "definition subject", example: "small", angle: -Math.PI/2 },
    { id: "def_target",  label: "definition target",  example: "big",   angle: -Math.PI/2 + 2*Math.PI/3 },
    { id: "query_word",  label: "query word",         example: "small", angle: -Math.PI/2 + 4*Math.PI/3 },
  ];

  function getPositions() {
    return positions.map(p => ({
      ...p,
      x: cx + Math.cos(p.angle) * radius,
      y: cy + Math.sin(p.angle) * radius,
    }));
  }

  function draw() {
    const container = $("#triplet-chart");
    d3.select(container).selectAll("*").remove();
    svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const pp = getPositions();

    // Triangle fill (initially invisible)
    svg.append("polygon").attr("class", "tri-fill")
      .attr("points", pp.map(p => `${p.x},${p.y}`).join(" "))
      .attr("fill", "var(--accent)")
      .attr("opacity", 0);

    // Edges
    [[0,1], [1,2], [0,2]].forEach(([a, b], i) => {
      svg.append("line").attr("class", `tri-edge edge-${i}`)
        .attr("x1", pp[a].x).attr("y1", pp[a].y)
        .attr("x2", pp[a].x).attr("y2", pp[a].y)
        .attr("stroke", "var(--text)")
        .attr("stroke-width", 1.6)
        .attr("opacity", 0)
        .attr("data-a", a).attr("data-b", b);
    });

    // Vertices — drawn at full size on initial draw
    pp.forEach((p, i) => {
      const g = svg.append("g").attr("transform", `translate(${p.x}, ${p.y})`).attr("class", `vertex v${i}`);
      g.append("circle").attr("class", "vertex-halo")
        .attr("r", 22).attr("fill", "var(--accent)").attr("opacity", 0);
      g.append("circle").attr("class", "vertex-dot")
        .attr("r", 24).attr("fill", "var(--bg-card)").attr("stroke", "var(--accent)").attr("stroke-width", 2);

      // Token "example" centered in dot
      g.append("text").attr("dy", "0.32em").attr("text-anchor", "middle")
        .attr("class", "vertex-text")
        .style("font-family", "var(--font-mono)").style("font-size", "13px").style("font-weight", "500")
        .style("fill", "var(--text)").style("opacity", 1)
        .text(p.example);

      // Position label below
      const labelY = p.y > cy ? 50 : -36;
      g.append("text").attr("y", labelY).attr("text-anchor", "middle")
        .attr("class", "vertex-label")
        .style("font-family", "var(--font-mono)").style("font-size", "11px")
        .style("fill", "var(--text-mute)").style("opacity", 1)
        .text(p.label);
    });

    // Center R readout
    svg.append("text").attr("class", "r-readout").attr("x", cx).attr("y", cy + 8)
      .attr("text-anchor", "middle")
      .style("font-family", "var(--font-display)").style("font-size", "44px")
      .style("font-style", "italic")
      .style("fill", "var(--accent)").style("opacity", 0)
      .text("R = 0.00");

    svg.append("text").attr("class", "r-label").attr("x", cx).attr("y", cy + 36)
      .attr("text-anchor", "middle")
      .style("font-family", "var(--font-mono)").style("font-size", "11px")
      .style("letter-spacing", "0.12em").style("fill", "var(--text-mute)")
      .style("opacity", 0)
      .text("RECOVERY");
  }

  async function play() {
    if (!svg) draw();
    const row = D.tripletVsPair.find(r => r.model === modelId);
    if (!row) return;

    // Reset edges & R only; vertices stay drawn
    svg.selectAll(".vertex-dot").attr("r", 24);
    svg.selectAll(".vertex-text, .vertex-label").style("opacity", 1);
    svg.selectAll(".tri-edge").attr("opacity", 0).each(function() {
      // collapse edges back to their start anchor
      const sel = d3.select(this);
      const a = +sel.attr("data-a");
      sel.attr("x2", +sel.attr("x1")).attr("y2", +sel.attr("y1"));
    });
    svg.select(".tri-fill").attr("opacity", 0);
    svg.select(".r-readout").style("opacity", 0).text("R = 0.00");
    svg.select(".r-label").style("opacity", 0);

    const pp = getPositions();

    // Re-anchor edges to their starting vertex
    svg.selectAll(".tri-edge").each(function() {
      const sel = d3.select(this);
      const a = +sel.attr("data-a");
      sel.attr("x1", pp[a].x).attr("y1", pp[a].y)
         .attr("x2", pp[a].x).attr("y2", pp[a].y);
    });

    await sleep(400);

    // Step 2: best pair connects (subject ↔ query, indices 0 ↔ 2)
    svg.select(".tri-edge.edge-2")
      .attr("opacity", 0.85)
      .transition().duration(700).ease(d3.easeCubicOut)
      .attr("x2", pp[2].x).attr("y2", pp[2].y);

    // R animates to best-pair value
    svg.select(".r-readout").style("opacity", 1);
    svg.select(".r-label").style("opacity", 1);
    const v0 = 0, v1 = row.Rpair, v2 = row.Rtrp;
    await animatePromise(svg.select(".r-readout").node(), v0, v1, 800, v => `R = ${v.toFixed(2)}`);

    // Brief pause showing "best pair" R
    svg.append("text").attr("class", "pair-label")
      .attr("x", (pp[0].x + pp[2].x)/2).attr("y", (pp[0].y + pp[2].y)/2 - 12)
      .attr("text-anchor", "middle")
      .style("font-family", "var(--font-mono)").style("font-size", "11px")
      .style("fill", "var(--text-mute)").style("opacity", 0)
      .text("best pair")
      .transition().duration(300).style("opacity", 1);
    await sleep(900);
    svg.select(".pair-label").transition().duration(300).style("opacity", 0).remove();

    // Step 3: add third vertex's edges (subject ↔ target, target ↔ query)
    svg.select(".tri-edge.edge-0")
      .attr("opacity", 0.85)
      .transition().duration(600).ease(d3.easeCubicOut)
      .attr("x2", pp[1].x).attr("y2", pp[1].y);
    svg.select(".tri-edge.edge-1")
      .attr("opacity", 0.85)
      .transition().delay(200).duration(600).ease(d3.easeCubicOut)
      .attr("x2", pp[2].x).attr("y2", pp[2].y);

    // Fill triangle
    svg.select(".tri-fill")
      .transition().delay(400).duration(700).attr("opacity", 0.10);

    // R climbs to full triplet value
    await sleep(700);
    await animatePromise(svg.select(".r-readout").node(), v1, v2, 800, v => `R = ${v.toFixed(2)}`);

    // Final "TRIPLET" label
    svg.append("text").attr("class", "triplet-final")
      .attr("x", cx).attr("y", cy - 70)
      .attr("text-anchor", "middle")
      .style("font-family", "var(--font-mono)").style("font-size", "11px")
      .style("letter-spacing", "0.2em").style("fill", "var(--accent)")
      .style("opacity", 0)
      .text("TRIPLET")
      .transition().duration(400).style("opacity", 1);
    setTimeout(() => svg.select(".triplet-final").transition().duration(400).style("opacity", 0).remove(), 2000);
  }

  async function playSwap() {
    if (!svg) draw();
    const row = D.tripletVsPair.find(r => r.model === modelId);
    const swapRow = (D.swapControl || []).find(r => r.model === modelId);
    if (!row) return;
    const swapR = swapRow ? swapRow.swap : -0.5;
    const matchedR = swapRow ? swapRow.matched : row.Rtrp;

    const pp = getPositions();
    const targetIdx = 1; // def_target is positions[1]

    // Reset to full-triplet state (all vertices, all edges, fill, R = matched)
    svg.selectAll(".vertex-dot")
      .attr("r", 24)
      .attr("fill", "var(--bg-card)")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2);
    svg.selectAll(".vertex-text").style("opacity", 1).style("fill", "var(--text)");
    svg.selectAll(".vertex-label").style("opacity", 1);
    svg.selectAll(".tri-edge").attr("opacity", 0.85)
      .attr("stroke", "var(--text)")
      .attr("stroke-dasharray", null)
      .each(function () {
        const sel = d3.select(this);
        const a = +sel.attr("data-a"), b = +sel.attr("data-b");
        sel.attr("x1", pp[a].x).attr("y1", pp[a].y)
           .attr("x2", pp[b].x).attr("y2", pp[b].y);
      });
    svg.select(".tri-fill").attr("opacity", 0.10);
    svg.select(".r-readout").style("opacity", 1).style("fill", "var(--accent)").text(`R = ${matchedR.toFixed(2)}`);
    svg.select(".r-label").style("opacity", 1).text("MATCHED");
    svg.selectAll(".swap-marker, .donor-text").remove();

    await sleep(600);

    // Step 1: target vertex briefly highlights ("about to swap"), then flips
    const targetG = svg.select(`.vertex.v${targetIdx}`);
    await targetG.select(".vertex-dot")
      .transition().duration(400)
      .attr("stroke", "#9d3a2f")  // distractor red
      .attr("stroke-width", 3)
      .end();

    // Step 2: target dot color flips, label changes to "donor"
    await targetG.select(".vertex-dot")
      .transition().duration(500)
      .attr("fill", "#9d3a2f")
      .attr("stroke", "#9d3a2f")
      .end();
    targetG.select(".vertex-text")
      .transition().duration(300)
      .style("fill", "white")
      .text("?");

    // Add a "DONOR" annotation near the target
    targetG.append("text")
      .attr("class", "donor-text")
      .attr("y", -52)
      .attr("text-anchor", "middle")
      .style("font-family", "var(--font-mono)")
      .style("font-size", "10px")
      .style("letter-spacing", "0.15em")
      .style("fill", "#9d3a2f")
      .style("font-weight", "500")
      .style("opacity", 0)
      .text("← DONOR (mismatched)")
      .transition().duration(400).style("opacity", 1);

    // Step 3: edges to target turn dashed/red (binding broken)
    svg.selectAll(".tri-edge").each(function () {
      const sel = d3.select(this);
      const a = +sel.attr("data-a"), b = +sel.attr("data-b");
      if (a === targetIdx || b === targetIdx) {
        sel.transition().duration(500)
          .attr("stroke", "#9d3a2f")
          .attr("stroke-dasharray", "6,4")
          .attr("opacity", 0.6);
      }
    });
    svg.select(".tri-fill").transition().duration(500).attr("opacity", 0.04);

    await sleep(600);

    // Step 4: R animates down from matched to swap value
    svg.select(".r-readout").style("fill", "#9d3a2f");
    svg.select(".r-label").text("SWAP").style("fill", "#9d3a2f");
    await animatePromise(svg.select(".r-readout").node(), matchedR, swapR, 1100, v => `R = ${(v >= 0 ? "+" : "")}${v.toFixed(2)}`);

    // Step 5: collapse caption appears
    svg.append("text").attr("class", "swap-marker")
      .attr("x", cx).attr("y", cy + 68)
      .attr("text-anchor", "middle")
      .style("font-family", "var(--font-mono)").style("font-size", "11px")
      .style("letter-spacing", "0.12em").style("fill", "#9d3a2f")
      .style("opacity", 0)
      .text(`COLLAPSE: ${(matchedR - swapR).toFixed(2)} nat drop`)
      .transition().duration(500).style("opacity", 1);
  }

  function init() {
    draw();
    onceVisible($("#triplet-stage"), () => setTimeout(play, 500), 0.3);

    $$("#triplet-model .btn-mini").forEach(b => {
      b.addEventListener("click", () => {
        $$("#triplet-model .btn-mini").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        modelId = b.dataset.model;
        play();
      });
    });
    $("#triplet-replay").addEventListener("click", play);
    const swapBtn = $("#triplet-swap");
    if (swapBtn) swapBtn.addEventListener("click", playSwap);
  }

  return { init };
})();

function animatePromise(el, from, to, dur, fmt) {
  return new Promise(res => {
    const t0 = performance.now();
    function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(tick); else res();
    }
    requestAnimationFrame(tick);
  });
}


// ============================================================
// 7. Layer-wise patching curves + triplet-vs-pair table
// ============================================================
const SOURCE_COLORS = {
  "def_target":            "#c98b3a",
  "query_word":            "#8a6db1",
  "def_subject":           "#5a8a7a",
  "def_target + query":    "#b85c44",
  "def_subj + def_target": "#7a8a3a",
  "def_subj + query":      "#3a7a8a",
  "Full triplet":          "#cc785c",
};
let layerModelId = "gemma-2-2b";
let layerVisible = new Set(Object.keys(SOURCE_COLORS));

function renderMechLegend() {
  const wrap = $("#mech-legend");
  wrap.innerHTML = "";
  Object.entries(SOURCE_COLORS).forEach(([name, color]) => {
    const row = document.createElement("div");
    row.className = "legend-row" + (layerVisible.has(name) ? "" : " off") + (name === "Full triplet" ? " triplet" : "");
    row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${name}</span>`;
    row.addEventListener("click", () => {
      if (layerVisible.has(name)) layerVisible.delete(name); else layerVisible.add(name);
      renderMechLegend();
      renderLayerChart();
    });
    wrap.appendChild(row);
  });
}

function renderLayerChart() {
  const container = $("#layer-chart");
  const rect = container.getBoundingClientRect();
  const margin = { top: 20, right: 28, bottom: 44, left: 48 };
  const W = Math.max(420, rect.width - margin.left - margin.right);
  const H = 340;

  let data = D.layerwise["gemma-2-2b"];
  // Other models: scale Gemma curves to match Table 2 endpoints
  const refRow = D.tripletVsPair.find(r => r.model === "gemma-2-2b");
  const thisRow = D.tripletVsPair.find(r => r.model === layerModelId);
  if (layerModelId !== "gemma-2-2b" && thisRow) {
    const scaleT = thisRow.Rtrp / refRow.Rtrp;
    const scaleP = thisRow.Rpair / refRow.Rpair;
    data = { layers: data.layers, series: {} };
    for (const [k, arr] of Object.entries(D.layerwise["gemma-2-2b"].series)) {
      const sc = k === "Full triplet" ? scaleT : scaleP;
      data.series[k] = arr.map(v => v * sc);
    }
  }

  d3.select(container).selectAll("*").remove();
  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, data.layers.length - 1]).range([0, W]);
  const y = d3.scaleLinear().domain([-0.15, 1.2]).range([H, 0]);

  // Grid
  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).tickSize(-W).tickFormat("").ticks(6))
    .call(g => g.select(".domain").remove());

  [0, 1].forEach(v => {
    g.append("line").attr("x1", 0).attr("x2", W).attr("y1", y(v)).attr("y2", y(v))
      .attr("stroke", "var(--line-strong)").attr("stroke-dasharray", "2,4");
  });

  const line = d3.line().x((d, i) => x(i)).y(d => y(d)).curve(d3.curveCatmullRom.alpha(0.5));
  for (const [name, arr] of Object.entries(data.series)) {
    if (!layerVisible.has(name)) continue;
    const isTrip = name === "Full triplet";
    const p = g.append("path")
      .attr("d", line(arr)).attr("fill", "none")
      .attr("stroke", SOURCE_COLORS[name])
      .attr("stroke-width", isTrip ? 2.8 : 1.6)
      .attr("opacity", isTrip ? 1 : 0.8);
    // Animate stroke draw
    const L = p.node().getTotalLength();
    p.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
      .transition().duration(900).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);
  }

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(8));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));
  g.append("text").attr("class", "axis-label")
    .attr("x", W/2).attr("y", H + 36).attr("text-anchor", "middle")
    .text("residual-stream layer");
  g.append("text").attr("class", "axis-label")
    .attr("transform", `translate(-34, ${H/2}) rotate(-90)`).attr("text-anchor", "middle")
    .text("recovery R");
}

function renderTripletTable() {
  const tb = $("#triplet-tbl tbody");
  tb.innerHTML = "";
  D.tripletVsPair.forEach(r => {
    const tr = document.createElement("tr");
    const m = D.models.find(x => x.id === r.model)?.label || r.model;
    tr.innerHTML = `
      <td class="term">${m}</td>
      <td>${r.site}</td>
      <td>${r.layer}</td>
      <td>${r.Rtrp.toFixed(2)}</td>
      <td>${r.Rpair.toFixed(2)}</td>
      <td class="pos">${fmt2(r.dR)}</td>
    `;
    tb.appendChild(tr);
  });
}


// ============================================================
// 8. Animation 5 — Target preservation vs distractor suppression
// ============================================================
const Dissociation = (function () {
  let modelId = "gemma-2-2b";
  let svg = null;
  let isPlaying = false;

  const W = 880, H = 380;
  const margin = { top: 60, right: 30, bottom: 60, left: 60 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const colW = innerW / 3;
  const barW = 32;
  const gap = 16;

  function getData() {
    return D.logitDecomp.find(r => r.model === modelId);
  }

  function draw(initial = true) {
    const container = $("#diss-chart");
    d3.select(container).selectAll("*").remove();
    svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Y scale — symmetric around 0
    const yMax = 18;
    const y = d3.scaleLinear().domain([-yMax, 2]).range([innerH, 0]);

    // Zero baseline
    g.append("line").attr("class", "baseline")
      .attr("x1", -10).attr("x2", innerW + 10)
      .attr("y1", y(0)).attr("y2", y(0))
      .attr("stroke", "var(--text)").attr("stroke-width", 1.2);

    // Y axis (left)
    g.append("g").attr("class", "axis")
      .call(d3.axisLeft(y).ticks(6).tickFormat(d => d === 0 ? "0" : d));
    g.append("text").attr("class", "axis-label")
      .attr("transform", `translate(-42, ${innerH/2}) rotate(-90)`).attr("text-anchor", "middle")
      .text("Δ logit (nats)");

    // Three columns: Matched / Swap / Random
    const conds = [
      { key: "M", label: "Matched",     sub: "(triplet)",            color: "var(--target)" },
      { key: "S", label: "Swap",        sub: "(def-target only)",    color: "var(--accent)" },
      { key: "R", label: "Random",      sub: "(item-mismatched)",    color: "var(--text-mute)" },
    ];

    conds.forEach((c, i) => {
      const xCol = i * colW + colW/2;

      // Column label
      g.append("text").attr("x", xCol).attr("y", -28)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "12px")
        .style("letter-spacing", "0.1em")
        .style("text-transform", "uppercase")
        .style("fill", c.color)
        .text(c.label);
      g.append("text").attr("x", xCol).attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "10.5px")
        .style("fill", "var(--text-mute)")
        .text(c.sub);

      // Two bars: target (left, green), distractor (right, red)
      const xT = xCol - barW - gap/2;
      const xD = xCol + gap/2;

      // Bars (initially zero-height, anchored at baseline)
      g.append("rect").attr("class", `bar-t bar-${c.key}-t`)
        .attr("x", xT).attr("y", y(0))
        .attr("width", barW).attr("height", 0)
        .attr("fill", "var(--target)").attr("opacity", 0.85)
        .attr("rx", 2);
      g.append("rect").attr("class", `bar-d bar-${c.key}-d`)
        .attr("x", xD).attr("y", y(0))
        .attr("width", barW).attr("height", 0)
        .attr("fill", "var(--distractor)").attr("opacity", 0.85)
        .attr("rx", 2);

      // Value labels
      g.append("text").attr("class", `lbl-${c.key}-t`)
        .attr("x", xT + barW/2).attr("y", y(0) - 8)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "10.5px")
        .style("fill", "var(--target)")
        .style("font-feature-settings", '"tnum"')
        .text("");
      g.append("text").attr("class", `lbl-${c.key}-d`)
        .attr("x", xD + barW/2).attr("y", y(0) - 8)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "10.5px")
        .style("fill", "var(--distractor)")
        .style("font-feature-settings", '"tnum"')
        .text("");

      // tick labels
      g.append("text").attr("x", xT + barW/2).attr("y", innerH + 18)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "10px")
        .style("fill", "var(--target)").text("Δℓt");
      g.append("text").attr("x", xD + barW/2).attr("y", innerH + 18)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-mono)").style("font-size", "10px")
        .style("fill", "var(--distractor)").text("Δℓd");

      // Δm readout
      g.append("text").attr("class", `dm-${c.key}`)
        .attr("x", xCol).attr("y", innerH + 44)
        .attr("text-anchor", "middle")
        .style("font-family", "var(--font-display)").style("font-size", "20px")
        .style("font-style", "italic")
        .style("opacity", 0)
        .text("Δm");
    });
  }

  async function play() {
    if (isPlaying) return;
    isPlaying = true;
    draw(false);
    // Reset captions
    ["diss-cap-1","diss-cap-2","diss-cap-3"].forEach(id => $("#"+id).classList.remove("active"));

    const data = getData();
    if (!data) { isPlaying = false; return; }

    const yMax = 18;
    const y = d3.scaleLinear().domain([-yMax, 2]).range([innerH, 0]);
    const conds = ["M", "S", "R"];
    const condData = { M: data.M, S: data.S, R: data.R };

    const g = svg.select("g");

    $("#diss-step").textContent = "distractor falls (everywhere)";
    $("#diss-cap-1").classList.add("active");

    // Step 1: All red bars fall simultaneously
    await Promise.all(conds.map(c => {
      const v = condData[c].dld;  // negative
      const finalY = y(v);     // larger pixel y (below 0)
      const h = finalY - y(0);
      const trans1 = g.select(`.bar-${c}-d`).transition().duration(900).ease(d3.easeCubicOut)
        .attr("y", y(0)).attr("height", h).end();
      g.select(`.lbl-${c}-d`)
        .transition().duration(900).ease(d3.easeCubicOut)
        .attr("y", finalY + 14)
        .tween("text", function() {
          const i = d3.interpolateNumber(0, v);
          return function(t) { this.textContent = fmt2(i(t)); };
        });
      return trans1;
    }));

    await sleep(600);
    $("#diss-step").textContent = "target — matched preserves, swap/random collapse";
    $("#diss-cap-2").classList.add("active");

    // Step 2: Target bars
    await Promise.all(conds.map(c => {
      const v = condData[c].dlt;
      const finalY = y(v);
      let h, yPos;
      if (v < 0) { h = finalY - y(0); yPos = y(0); }
      else       { h = y(0) - finalY; yPos = finalY; }
      const trans = g.select(`.bar-${c}-t`).transition().duration(1100).ease(d3.easeCubicOut)
        .attr("y", yPos).attr("height", h).end();
      g.select(`.lbl-${c}-t`)
        .transition().duration(1100).ease(d3.easeCubicOut)
        .attr("y", finalY + (v < 0 ? 14 : -8))
        .tween("text", function() {
          const i = d3.interpolateNumber(0, v);
          return function(t) { this.textContent = fmt2(i(t)); };
        });
      return trans;
    }));

    await sleep(500);
    $("#diss-step").textContent = "Δm = Δℓt − Δℓd — binding's signature";
    $("#diss-cap-3").classList.add("active");

    // Step 3: reveal Δm
    conds.forEach(c => {
      const dm = condData[c].dm;
      const el = g.select(`.dm-${c}`);
      el.style("opacity", 0)
        .style("fill", dm > 0 ? "var(--target)" : "var(--distractor)")
        .text(fmt2(dm))
        .transition().delay(200).duration(500).style("opacity", 1);
    });

    await sleep(900);
    $("#diss-step").textContent = "done. matched preserved target. swap/random did not.";

    isPlaying = false;
  }

  function reset() {
    draw(true);
    $("#diss-step").textContent = "at rest";
    ["diss-cap-1","diss-cap-2","diss-cap-3"].forEach(id => $("#"+id).classList.remove("active"));
  }

  function init() {
    draw();
    $("#diss-play").addEventListener("click", play);
    $("#diss-reset").addEventListener("click", reset);
    onceVisible($("#diss-stage"), () => setTimeout(play, 500), 0.3);
  }

  return { init };
})();


// ============================================================
// 9. Logit decomposition cards (per model summary)
// ============================================================
function renderDissRows() {
  const wrap = $("#diss-rows");
  wrap.innerHTML = "";
  D.logitDecomp.forEach(r => {
    const mlabel = D.models.find(m => m.id === r.model)?.label || r.model;
    const cell = (cond, key, label) => `
      <div class="diss-cell ${key}">
        <div class="cname">${label}</div>
        <div class="dm ${cond.dm > 0 ? "pos" : "neg"}">Δm = ${fmt2(cond.dm)}</div>
        <div class="dltdld"><span class="lt">Δℓt=${fmt2(cond.dlt)}</span> &nbsp; <span class="ld">Δℓd=${fmt2(cond.dld)}</span></div>
      </div>
    `;
    const row = document.createElement("div");
    row.className = "diss-row";
    row.innerHTML = `
      <div class="mname">${mlabel}</div>
      ${cell(r.M, "match", "Matched")}
      ${cell(r.S, "swap",  "Swap")}
      ${cell(r.R, "rand",  "Random")}
    `;
    wrap.appendChild(row);
  });
}


// ============================================================
// 10. BibTeX copy
// ============================================================
function initBibtex() {
  const btn = $("#bib-copy");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#bib-text").textContent);
      btn.textContent = "Copied";
      btn.classList.add("ok");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("ok"); }, 1600);
    } catch {
      btn.textContent = "Press ⌘+C";
    }
  });
}


// ============================================================
// Boot
// ============================================================
function boot() {
  // Each step is wrapped so a single failure (missing DOM, bad data, etc.)
  // doesn't abort the rest of initialization and leave the page as empty shells.
  const safe = (label, fn) => {
    try { fn(); } catch (e) { console.error(`[boot] ${label} failed:`, e); }
  };

  safe("reveal",        () => initReveal());
  safe("progress",      () => initProgress());

  safe("Stroop",        () => Stroop.init());
  safe("Scatter",       () => Scatter.init());
  safe("regression",    () => { if ($("#reg-tbl")) renderRegressionTable(); });
  safe("robustness",    () => { if ($("#robust-tbl")) renderRobustnessTable(); });

  safe("forest",        () => { if ($("#forest-chart"))   renderForest(); });
  safe("heatmap",       () => { if ($("#heatmap-chart"))  { renderHeatmap(); initHeatmapToggle(); } });

  safe("Patching",      () => Patching.init());
  safe("Triplet",       () => Triplet.init());

  safe("mech-legend",   () => { if ($("#mech-legend"))   renderMechLegend(); });
  safe("layer-chart",   () => { if ($("#layer-chart"))   renderLayerChart(); });
  safe("triplet-tbl",   () => { if ($("#triplet-tbl"))   renderTripletTable(); });

  safe("Dissociation",  () => Dissociation.init());
  safe("diss-rows",     () => { if ($("#diss-rows"))     renderDissRows(); });

  safe("bibtex",        () => initBibtex());

  // === New enhancements ===
  safe("hero-leak",      () => HeroLeak.init());
  safe("scatter-brush",  () => ScatterEnhance.init());
  safe("heatmap-sync",   () => HeatmapSync.init());
  safe("data-citations", () => DataCite.init());
  safe("layer-toggle",   () => LayerToggle.init());
  safe("mode-toggle",    () => ModeToggle.init());

  // Re-render charts on resize
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      safe("resize-forest",   () => { if ($("#forest-chart"))  renderForest(); });
      safe("resize-heatmap",  () => { if ($("#heatmap-chart")) renderHeatmap(); });
      safe("resize-layer",    () => { if ($("#layer-chart"))   renderLayerChart(); });
    }, 200);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}


// ============================================================
// A1. Hero leak animation (mini bars that oscillate between
// neutral and conflict states under the hero subtitle).
// ============================================================
const HeroLeak = (function () {
  // Real numbers from Gemma-2-2B-IT, glossary wrapper, doctor item, class neutral
  // (same numbers as Figure 1 of the paper).
  // Real numbers: Gemma-2-2B-IT, glossary wrapper, doctor item, class neutral.
  // Bar width maps |log p| to pixels (wider = more negative = less probable).
  // viewBox is 280 wide; bars start at x=66 with ~170px available before the
  // value text needs room (~40px). Max bar width allowed = 130px to keep the
  // value text from clipping at the right edge.
  const MAX_BAR = 130;
  const MAX_NAT = 30;        // largest |log p| we expect (~−26.77)
  const SCALE = MAX_BAR / MAX_NAT;  // ≈ 4.33 px per nat
  const states = [
    { label: "neutral control · class means forest",  tNum: -9.99,  dNum: -26.77, S: 16.78 },
    { label: "conflict prompt · doctor means forest", tNum: -10.80, dNum: -18.83, S: 8.03  },
  ];
  let i = 0;
  let timer = null;

  function fmt(n) { return (n >= 0 ? "+" : "") + n.toFixed(2); }
  function barW(n) { return Math.max(4, Math.min(MAX_BAR, Math.abs(n) * SCALE)); }

  function apply(s) {
    const state = document.querySelector("#hero-leak .leak-state");
    const tBar  = document.querySelector("#hero-leak .leak-target");
    const dBar  = document.querySelector("#hero-leak .leak-distractor");
    const tVal  = $("#leak-tval");
    const dVal  = $("#leak-dval");
    const delta = $("#leak-delta");
    if (!state || !tBar || !dBar) return;
    const tW = barW(s.tNum), dW = barW(s.dNum);
    state.textContent = s.label;
    tBar.setAttribute("width", tW);
    dBar.setAttribute("width", dW);
    // Value text floats just to the right of each bar end (bar starts at x=66)
    tVal.setAttribute("x", 66 + tW + 4);
    dVal.setAttribute("x", 66 + dW + 4);
    tVal.textContent = fmt(s.tNum);
    dVal.textContent = fmt(s.dNum);
    delta.textContent = `target − distractor margin  =  ${fmt(s.S)} nats`;
  }

  function cycle() {
    i = (i + 1) % states.length;
    apply(states[i]);
  }

  function init() {
    const root = $("#hero-leak");
    if (!root) return;
    apply(states[0]);
    timer = setInterval(cycle, 3200);
    // Pause when user is not looking at the hero
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { clearInterval(timer); timer = null; }
      else if (!timer) { timer = setInterval(cycle, 3200); }
    });
  }

  return { init };
})();


// ============================================================
// A2. Scatter brush + per-point tooltip.
// ============================================================
const ScatterEnhance = (function () {
  let tip = null, summary = null;

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "scatter-tip";
    document.body.appendChild(tip);
    return tip;
  }

  function ensureSummary(parent) {
    if (summary) return summary;
    summary = document.createElement("div");
    summary.className = "brush-summary";
    summary.innerHTML = `
      <div class="b-head">
        <span>Selected items</span>
        <span class="b-count">0</span>
        <button class="b-clear">clear</button>
      </div>
      <div class="b-items"></div>
    `;
    parent.appendChild(summary);
    summary.querySelector(".b-clear").addEventListener("click", clearBrush);
    return summary;
  }

  function familyLabel(famId) {
    const f = (D.conflictFamilies || []).find(x => x.id === famId);
    return f ? f.label : famId;
  }

  function showTip(d, evt) {
    const t = ensureTip();
    const fam = familyLabel(d.family);
    t.innerHTML = `
      <div><span class="item-w">${fam}</span> <span class="lbl">item</span></div>
      <div><span class="lbl">lex. advantage:</span> <span class="v">${d.x.toFixed(2)}</span> <span class="lbl">nats</span></div>
      <div><span class="lbl">Stroop Δ:</span> <span class="v">${d.y.toFixed(2)}</span> <span class="lbl">nats</span></div>
    `;
    t.classList.add("show");
    moveT(t, evt);
  }

  function moveT(t, evt) {
    t.style.left = (evt.pageX + 12) + "px";
    t.style.top  = (evt.pageY + 12) + "px";
  }

  function hideTip() { if (tip) tip.classList.remove("show"); }

  let brushGroup = null;
  let allCircles = null;
  let svgSel = null;

  function clearBrush() {
    if (allCircles) allCircles.attr("opacity", 0.28).attr("r", 1.3);
    if (summary) summary.classList.remove("active");
    if (brushGroup) brushGroup.call(d3.brush().move, null);
  }

  function applyBrush(extent) {
    if (!extent || !allCircles) {
      clearBrush();
      return;
    }
    const [[x0, y0], [x1, y1]] = extent;
    const inside = [];
    allCircles.each(function (d) {
      const cx = +d3.select(this).attr("cx");
      const cy = +d3.select(this).attr("cy");
      const hit = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
      d._brushed = hit;
      if (hit) inside.push(d);
    });
    allCircles
      .attr("opacity", d => d._brushed ? 0.85 : 0.06)
      .attr("r", d => d._brushed ? 2.2 : 1.3);
    showSummary(inside);
  }

  function showSummary(items) {
    if (!summary) return;
    summary.classList.add("active");
    summary.querySelector(".b-count").textContent = `n = ${items.length}`;
    if (items.length === 0) {
      summary.querySelector(".b-items").innerHTML =
        '<div class="b-item"><span class="d">(empty selection)</span></div>';
      return;
    }
    // Compute summary stats: mean x, mean y, family breakdown
    const mean = (arr, fn) => arr.reduce((s, d) => s + fn(d), 0) / arr.length;
    const meanX = mean(items, d => d.x);
    const meanY = mean(items, d => d.y);
    const minY  = d3.min(items, d => d.y);
    const maxY  = d3.max(items, d => d.y);
    const famCounts = {};
    items.forEach(d => { famCounts[d.family] = (famCounts[d.family] || 0) + 1; });
    const famSorted = Object.entries(famCounts).sort((a, b) => b[1] - a[1]);

    let html = `
      <div class="b-item"><span class="w">mean lex. advantage</span><span class="d">${meanX.toFixed(2)}</span></div>
      <div class="b-item"><span class="w">mean Δ</span><span class="d">${meanY.toFixed(2)}</span></div>
      <div class="b-item"><span class="w">Δ range</span><span class="d">[${minY.toFixed(2)}, ${maxY.toFixed(2)}]</span></div>
      <div class="b-item"><span class="w">positive Δ</span><span class="d">${(100 * items.filter(d => d.y > 0).length / items.length).toFixed(0)}%</span></div>
    `;
    famSorted.forEach(([fam, n]) => {
      html += `<div class="b-item"><span class="w">${familyLabel(fam)}</span><span class="d">${n} (${(100*n/items.length).toFixed(0)}%)</span></div>`;
    });
    summary.querySelector(".b-items").innerHTML = html;
  }

  function init() {
    const container = $("#scatter-chart");
    if (!container) return;

    // Wait one tick after Scatter draws (it draws on visibility)
    const tryInit = () => {
      const svgEl = container.querySelector("svg");
      if (!svgEl) return setTimeout(tryInit, 400);
      svgSel = d3.select(svgEl);
      const g = svgSel.select("g");
      allCircles = g.select(".points").selectAll("circle");
      if (!allCircles.size()) return setTimeout(tryInit, 400);

      // Get bounds for brush
      const W = +svgEl.viewBox.baseVal.width - 90;   // margin left+right
      const H = 440;
      const margin = { left: 60, top: 20 };

      // Per-circle hover handlers
      allCircles
        .style("pointer-events", "all")
        .on("mouseenter", function (evt, d) {
          d3.select(this).attr("r", 3).attr("opacity", 1);
          showTip(d, evt);
        })
        .on("mousemove", function (evt) {
          if (tip) moveT(tip, evt);
        })
        .on("mouseleave", function (evt, d) {
          if (!d._brushed) {
            d3.select(this).attr("r", 1.3).attr("opacity", 0.28);
          }
          hideTip();
        });

      // Brush layer (under the existing g, above grid)
      const brush = d3.brush()
        .extent([[0, 0], [W, H]])
        .on("brush end", (event) => applyBrush(event.selection));

      brushGroup = g.append("g").attr("class", "brush").lower();
      brushGroup.call(brush);
      // Move points back above brush overlay
      g.select(".points").raise();
      // Bring OLS line + decile means back to top
      g.selectAll("line, text.annot").raise();

      // Summary panel under chart
      const stage = $("#scatter-stage");
      ensureSummary(stage);
    };

    onceVisible($("#scatter-stage"), tryInit, 0.25);
  }

  return { init };
})();


// ============================================================
// A3. Heatmap synchronized hover with forest plot + cell click
// drill-down modal.
// ============================================================
const HeatmapSync = (function () {
  // Representative items per family (drawn from App A Table 4 / paper).
  const FAMILY_EXAMPLES = {
    "antonym":     [{ q: "small", t: "big",   d: "tiny"  },
                    { q: "hot",   t: "cold",  d: "warm"  }],
    "arbitrary":   [{ q: "doctor",  t: "forest",  d: "hospital" },
                    { q: "teacher", t: "ocean",   d: "school"   }],
    "polysemy":    [{ q: "jaguar", t: "car",         d: "animal" },
                    { q: "Python", t: "programming", d: "snake"  }],
    "domain-def":  [{ q: "port",   t: "socket",  d: "harbor" },
                    { q: "thread", t: "process", d: "sewing" }],
  };
  // Representative items per wrapper. Reuses arbitrary family for the example body.
  const STYLE_EXAMPLES = {
    "game-rule":          { wrapper: 'In this game, doctor means forest. Question: a word related to doctor is ___' },
    "glossary":           { wrapper: 'A glossary for this document defines "doctor" as "forest". Using only this glossary, a word related to "doctor" is ___' },
    "technical-document": { wrapper: 'In the following technical document, the term "doctor" refers to "forest". According to the document, a word related to "doctor" is ___' },
    "scoped-definition":  { wrapper: 'For this passage only, interpret "doctor" as "forest". Under this definition, a word related to "doctor" is ___' },
  };

  const modal = () => $("#drilldown");

  function openModal({ model, dim, key, value }) {
    const m = modal();
    if (!m) return;
    const modelLabel = (D.models.find(x => x.id === model) || {}).label || model;
    const cols = dim === "family" ? D.conflictFamilies : D.promptStyles;
    const col = cols.find(c => c.id === key);
    const colLabel = col ? col.label : key;

    $("#drill-eyebrow").textContent = `${dim === "family" ? "Conflict family" : "Prompt wrapper"} cell`;
    $("#drill-title").innerHTML = `${modelLabel} <span style="color:var(--text-mute)">×</span> <em>${colLabel}</em>`;

    const sign = value == null ? "—" : (value >= 0 ? "+" : "") + value.toFixed(2);
    $("#drill-meta").innerHTML = `
      <span class="chip">model: ${modelLabel}</span>
      <span class="chip">${dim}: ${colLabel}</span>
      <span class="chip delta">Δ = ${sign} nats</span>
    `;

    let body = "";
    if (dim === "family") {
      const ex = FAMILY_EXAMPLES[key] || [];
      body += `<p>Items in this family take the form <span class="w">&lt;query&gt; means &lt;target&gt;</span>, with a competing lexical-prior distractor. Examples from the stimulus set:</p>`;
      ex.forEach(it => {
        body += `
          <div class="ex">
            <div class="role">conflict prompt</div>
            <span class="w">${it.q}</span> <span style="color:var(--text-mute)">means</span> <span class="w">${it.t}</span>
            <div class="role" style="margin-top:6px">lexical-prior distractor</div>
            <span class="w">${it.d}</span>
          </div>`;
      });
      body += `<p style="margin-top:14px;">Under <em>${modelLabel}</em>, this family aggregates to <strong style="color:var(--accent)">Δ = ${sign} nats</strong> across all 4 prompt wrappers. Positive = the model leaks toward the distractor when overriding.</p>`;
    } else {
      const ex = STYLE_EXAMPLES[key];
      body += `<p>This wrapper presents the conflict as:</p>`;
      body += `<div class="ex"><div class="role">prompt template</div><span class="w">${ex ? ex.wrapper : "—"}</span></div>`;
      body += `<p style="margin-top:14px;">Under <em>${modelLabel}</em>, this wrapper aggregates to <strong style="color:var(--accent)">Δ = ${sign} nats</strong> across all 4 conflict families.</p>`;
    }
    $("#drill-body").innerHTML = body;

    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    const m = modal();
    if (!m) return;
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
  }

  function syncForestHighlight(modelId) {
    const rows = d3.select("#forest-chart").selectAll(".forest-row");
    if (rows.empty()) return;
    if (!modelId) {
      rows.classed("synced-hi", false).classed("synced-dim", false);
      return;
    }
    rows.classed("synced-hi", d => d.id === modelId)
        .classed("synced-dim", d => d.id !== modelId);
  }

  function init() {
    // Modal close handlers
    const m = modal();
    if (m) {
      $("#drill-close").addEventListener("click", closeModal);
      m.addEventListener("click", e => { if (e.target === m) closeModal(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
    }

    // Wait for heatmap to render then wire up rect events
    const attach = () => {
      const cells = d3.select("#heatmap-chart").selectAll("rect");
      if (cells.empty()) return setTimeout(attach, 300);

      cells.each(function () {
        const rectSel = d3.select(this);
        // Walk DOM to find model and column for this cell. The heatmap renders
        // each cell as a `g[transform="translate(x,y)"]` containing a rect+text;
        // we infer model index from y-position and column index from x.
        const parentG = this.parentNode;
        const tx = parentG.getAttribute("transform") || "";
        const match = tx.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        if (!match) return;
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);

        const cellW = 130, cellH = 36, labelW = 160, colH = 56;
        const colIdx = Math.round((x - labelW) / cellW);
        const rowIdx = Math.round((y - colH) / cellH);

        const dim = (typeof heatmapMode === "string") ? heatmapMode : "family";
        const cols = dim === "family" ? D.conflictFamilies : D.promptStyles;
        const model = D.models[rowIdx];
        const col = cols[colIdx];
        if (!model || !col) return;

        const dataSrc = dim === "family" ? D.cellByFamily : D.cellByStyle;
        const v = ((dataSrc[model.id]) || {})[col.id];

        rectSel.on("pointerenter.sync", () => syncForestHighlight(model.id))
               .on("pointerleave.sync", (evt) => {
                 if (evt.pointerType !== "touch") syncForestHighlight(null);
               })
               .on("click.drill", () => openModal({ model: model.id, dim, key: col.id, value: v }));
      });
    };

    onceVisible($("#heatmap-chart") || document.body, attach, 0.2);
    // Re-attach after heatmap mode toggle (renderHeatmap rebuilds rects)
    $$("#heatmap-mode .btn-mini").forEach(b => {
      b.addEventListener("click", () => setTimeout(attach, 50));
    });
    // Also re-attach after window resize re-renders the heatmap
    window.addEventListener("resize", () => setTimeout(attach, 250));
  }

  return { init };
})();


// ============================================================
// A5. Data citations — wrap key numbers with hoverable
// provenance tooltips (paper table/figure source).
// ============================================================
const DataCite = (function () {
  let tip = null;

  // Pairs: [substring match (regex or string), provenance text].
  // Order matters — first match wins per text node.
  const CITES = [
    [/8\.75\s*nats?/g,                "Single-neutral Δ for class · doctor → forest item, Gemma-2-2B-IT, glossary wrapper. Paper Figure 1."],
    [/8\.61\s*nats?/g,                "Six-control mean Δ for the doctor → forest item. Paper §3.2 worked example."],
    [/\+8\.03/g,                      "S(conflict) for doctor → forest, Gemma-2-2B-IT, glossary wrapper. Paper §3.2."],
    [/\+10\.59/g,                     "Mean S(neutral) across 6 controls, doctor → forest item. Paper §3.2."],
    [/\b7,744\b/g,                    "n = item × prompt × model observations = 176 × 4 × 11. Paper Table 1, App C."],
    [/176 (?:unique )?(?:lexical )?items?/gi, "176 unique lexical items distributed across 4 families (80/36/30/30). Paper App A."],
    [/11 (open-weight )?models?/gi,   "Qwen2.5-1.5B/7B (base/IT), Gemma-2-2B/9B (base/IT), OLMo-1B, Mistral-7B (base/IT). Paper §3.3, App B."],
    [/\+0\.114/g,                     "Main controlled regression coefficient for lexical-prior advantage. Paper Table 1."],
    [/p\s*<\s*10[\s−-]*9/gi,     "p-value from item-clustered SE main regression. Paper Table 1."],
    [/\+0\.026/g,                     "Within-antonym slope (family interaction). Not significant. Paper Table 13."],
    [/\bΔR\s*=\s*\+0\.11 to \+0\.36/g,"Triplet–pair recovery margin across 5/5 mechanism models. Paper Table 2."],
    [/\bR\s*≈\s*1\.05/g,              "Full-triplet recovery, Gemma-2-2B. Paper Table 2."],
    [/0\.83\s*[–-]\s*0\.95/g,    "200-fold held-out positive-Δ fraction in instruction-tuned mechanism models. Paper §5.2."],
    [/0\.97\s*[–-]\s*1\.00/g,    "200-fold held-out positive-Δ fraction in base mechanism models. Paper §5.2."],
    [/\b50 .*?mismatched.*?controls?\b/gi, "50 item-mismatched clean-source perturbations per mechanism model. Paper §5.4, App F Table 20."],
    [/\b−0\.58 to −4\.16\b/g, "Item-mismatched control recovery range across 5 mechanism models. Paper Fig 6, App F Table 20."],
    [/42 (?:of 44 )?model[×x]style cells/gi, "42 / 44 model × wrapper cells positive at CI > 0. Paper §4.3."],
  ];

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "data-cite-tip";
    document.body.appendChild(tip);
    return tip;
  }

  // Walk through prose text nodes and replace matched substrings with .data-cite spans
  function annotate(rootSel) {
    const targets = document.querySelectorAll(rootSel);
    targets.forEach(node => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      let cur;
      while ((cur = walker.nextNode())) {
        if (cur.parentElement.closest(".data-cite, .mono, pre, code, .formula, .bibtex, .pcard-foot")) continue;
        textNodes.push(cur);
      }
      textNodes.forEach(tn => annotateNode(tn));
    });
  }

  function annotateNode(textNode) {
    const text = textNode.nodeValue;
    let earliest = null;
    let provenance = null;
    let matchedText = null;

    for (const [pat, prov] of CITES) {
      pat.lastIndex = 0; // reset regex
      const m = pat.exec(text);
      if (m && (earliest === null || m.index < earliest)) {
        earliest = m.index;
        provenance = prov;
        matchedText = m[0];
      }
    }

    if (earliest === null) return;

    const before = text.slice(0, earliest);
    const after  = text.slice(earliest + matchedText.length);

    const parent = textNode.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), textNode);

    const span = document.createElement("span");
    span.className = "data-cite";
    span.textContent = matchedText;
    span.dataset.cite = provenance;
    span.addEventListener("mouseenter", e => showCiteTip(e, provenance));
    span.addEventListener("mousemove", moveCiteTip);
    span.addEventListener("mouseleave", hideCiteTip);
    parent.insertBefore(span, textNode);

    const afterNode = document.createTextNode(after);
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);

    // Recurse on afterNode for additional matches
    if (after) annotateNode(afterNode);
  }

  function showCiteTip(e, prov) {
    const t = ensureTip();
    t.textContent = prov;
    t.classList.add("show");
    moveCiteTip(e);
  }
  function moveCiteTip(e) {
    if (!tip) return;
    const off = 14;
    tip.style.left = (e.pageX + off) + "px";
    tip.style.top  = (e.pageY - tip.offsetHeight - off) + "px";
  }
  function hideCiteTip() { if (tip) tip.classList.remove("show"); }

  function init() {
    // Target prose-heavy sections only
    annotate(".prose, .takeaway, .pullquote");
  }

  return { init };
})();


// ============================================================
// B1. Layer-model toggle for the layer-wise patching chart.
// ============================================================
const LayerToggle = (function () {
  function init() {
    const wrap = $("#layer-model");
    if (!wrap) return;
    wrap.querySelectorAll(".btn-mini").forEach(btn => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".btn-mini").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        layerModelId = btn.dataset.model;
        renderLayerChart();
      });
    });
  }
  return { init };
})();


// ============================================================
// A4. Quick / Deep reading mode toggle.
// Stored in localStorage so the user's preference persists.
// ============================================================
const ModeToggle = (function () {
  const KEY = "stroop:mode";
  let current = "deep";

  function apply(mode) {
    current = mode;
    document.body.classList.toggle("mode-quick", mode === "quick");
    const wrap = $("#mode-toggle");
    if (wrap) {
      wrap.querySelectorAll(".mode-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === mode);
      });
    }
    try { localStorage.setItem(KEY, mode); } catch (e) { /* private mode */ }
    // Charts laid out within hidden sections may need a re-render once shown.
    // We trigger known re-renders here.
    setTimeout(() => {
      if ($("#forest-chart"))  renderForest();
      if ($("#heatmap-chart")) renderHeatmap();
      if ($("#layer-chart"))   renderLayerChart();
    }, 60);
  }

  function init() {
    const wrap = $("#mode-toggle");
    if (!wrap) return;
    // Restore from storage
    let saved = "deep";
    try { saved = localStorage.getItem(KEY) || "deep"; } catch (e) {}
    apply(saved);
    wrap.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => apply(btn.dataset.mode));
    });
  }

  return { init };
})();
