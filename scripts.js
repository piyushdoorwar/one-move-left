(() => {
  const qs = (s) => document.querySelector(s);

  // ===== UI =====
  const boardEl = qs("#board");
  const scoreEl = qs("#score");
  const bestEl  = qs("#best");
  const bannerEl = qs("#banner");

  const levelEl = qs("#level");
  const movesLeftEl = qs("#movesLeft");
  const goalTextEl = qs("#goalText");
  const goalRemainingEl = qs("#goalRemaining");

  const nextBtn = qs("#nextBtn");
  const retryBtn = qs("#retryBtn");
  const soundBtn = qs("#soundBtn");
  const howBtn = qs("#howBtn");
  const hintBtn = qs("#hintBtn");
  const themeBtn = qs("#themeBtn");

  const overlay = qs("#overlay");
  const overlayTitle = qs("#overlayTitle");
  const overlayBody = qs("#overlayBody");
  const closeOverlay = qs("#closeOverlay");
  const overlayPrimary = qs("#overlayPrimary");

  // ===== Persistence =====
  const LS_BEST = "onemoveleft:best";
  const LS_SOUND = "onemoveleft:soundOn";
  const LS_THEME = "onemoveleft:theme";

  let best = parseInt(localStorage.getItem(LS_BEST) || "0", 10);
  bestEl.textContent = best;

  let soundOn = (localStorage.getItem(LS_SOUND) ?? "1") === "1";
  refreshSoundBtn();

  let theme = localStorage.getItem(LS_THEME) || "default";
  if (theme === "ubuntu") document.body.classList.add("ubuntu-theme");

  // ===== Audio (no asset files) =====
  let ac = null;
  let unlocked = false;

  function initAudio() {
    if (!soundOn || unlocked) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      ac.resume?.();
      const buf = ac.createBuffer(1, 1, 22050);
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      src.start(0);
      unlocked = true;
    } catch {}
  }

  function beep(freq=520, ms=80, vol=0.09) {
    if (!soundOn) return;
    initAudio();
    if (!ac) return;

    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g).connect(ac.destination);

    const t0 = ac.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms/1000);

    o.start(t0);
    o.stop(t0 + ms/1000 + 0.02);
  }

  function popSound(popped, chainStep) {
    const intensity = Math.min(popped / 5 + chainStep, 8);
    beep(400 + intensity*30, 100 + intensity*20, (0.15 + intensity*0.03) * 2);
  }
  function goodSound() { beep(740, 120, 0.20); }
  function badSound() { beep(220, 140, 0.20); }

  // ===== Banner (no CLS) =====
  let bannerTimer = null;
  function banner(msg, kind="") {
    clearTimeout(bannerTimer);
    bannerEl.className = "banner show" + (kind ? ` ${kind}` : "");
    bannerEl.textContent = msg;
    bannerTimer = setTimeout(() => {
      bannerEl.className = "banner";
      bannerEl.textContent = "";
    }, 1400);
  }

  // ===== Symbols per color =====
  const SYMBOLS = ["◆", "✦", "▲", "●", "✖"];
  const COLOR_NAMES = ["Cyan","Purple","Green","Yellow","Red"];

  // ===== Game config =====
  const MIN_CLUSTER = 3;
  const COLORS = 5;

  // ===== Runtime state =====
  let level = 1;
  let size = 6;
  let score = 0;

  let movesLeft = 0;

  // goal types:
  //  - popTotal: {type, target, remaining}
  //  - clearColor: {type, target, remaining, color}
  //  - clearMulti: {type, items:[{color,target,remaining},...]}
  //  - densityBelow: {type, threshold, remainingPct?} (success when fill% <= threshold)
  let goal = null;

  // DOM grid model (for rendering + animation)
  let grid = [];          // grid[r][c] = {id,color} | null
  let orbs = new Map();   // id -> {el,r,c,color}
  let idCounter = 1;
  let animating = false;

  let currentLevelGrid = null;
  let currentLevelGoal = null;
  let currentLevelMoves = 0;
  let solutionMoves = null;
  function setScore(v) {
    score = v;
    scoreEl.textContent = v;
    if (v > best) {
      best = v;
      bestEl.textContent = v;
      localStorage.setItem(LS_BEST, String(v));
    }
  }
  function setLevel(v) { level = v; levelEl.textContent = String(v); }
  function setMoves(v) { movesLeft = v; movesLeftEl.textContent = String(v); }

  function goalToText(g) {
    if (g.type === "popTotal") return `Pop ${g.target} tiles`;
    if (g.type === "clearColor") return `Clear ${g.target} ${COLOR_NAMES[g.color]} (${SYMBOLS[g.color]})`;
    if (g.type === "clearMulti") {
      return g.items.map(it => `${it.target} ${COLOR_NAMES[it.color]} (${SYMBOLS[it.color]})`).join(" + ");
    }
    if (g.type === "densityBelow") return `Reduce board to ≤ ${Math.round(g.threshold*100)}% filled`;
    return "Goal";
  }

  function goalRemainingText(g) {
    if (g.type === "popTotal") return String(Math.max(0, g.remaining));
    if (g.type === "clearColor") return String(Math.max(0, g.remaining));
    if (g.type === "clearMulti") {
      return g.items.map(it => `${SYMBOLS[it.color]}:${Math.max(0,it.remaining)}`).join("  ");
    }
    if (g.type === "densityBelow") {
      const pct = currentFillPct(grid, size);
      return `${Math.round(pct*100)}%`;
    }
    return "";
  }

  function setGoal(g) {
    goal = g;
    goalTextEl.textContent = goalToText(g);
    goalRemainingEl.textContent = goalRemainingText(g);
  }

  function updateGoalUI() {
    goalRemainingEl.textContent = goalRemainingText(goal);
  }

  function showGenerating(msg="Generating solvable level…") {
    overlayTitle.textContent = "Generating…";
    overlayBody.innerHTML = `
      <div class="spinner"></div>
      <div style="text-align:center; color: rgba(255,255,255,.70)">${msg}</div>
    `;
    overlayPrimary.textContent = "Please wait";
    overlay.classList.add("show");
  }

  function hideOverlay() {
    overlay.classList.remove("show");
  }

  // ===== Layout: dynamic board size =====
  function buildBackgroundGrid() {
    boardEl.style.setProperty("--size", String(size));
    boardEl.innerHTML = "";
    const g = document.createElement("div");
    g.className = "grid";
    for (let i=0;i<size*size;i++){
      const cell = document.createElement("div");
      cell.className = "cell";
      g.appendChild(cell);
    }
    boardEl.appendChild(g);
  }

  function boardMetrics() {
    const pad = 10; // matches --gap
    const w = boardEl.clientWidth - pad*2;
    const tileSize = (w - (pad*(size-1))) / size;
    return { pad, tileSize };
  }

  function posToTransform(r,c) {
    const { pad, tileSize } = boardMetrics();
    const x = pad + c*(tileSize + pad);
    const y = pad + r*(tileSize + pad);
    return { x, y, tileSize };
  }

  function mountOrb(r,c,color) {
    const id = idCounter++;
    const orb = document.createElement("div");
    orb.className = "orb pop";
    orb.dataset.id = String(id);
    orb.dataset.c = String(color);
    orb.innerHTML = `<div class="sym">${SYMBOLS[color]}</div>`;
    boardEl.appendChild(orb);
    orbs.set(id, { el: orb, r, c, color });

    const { x,y,tileSize } = posToTransform(r,c);
    orb.style.width = `${tileSize}px`;
    orb.style.height = `${tileSize}px`;
    orb.style.transform = `translate(${x}px, ${y}px)`;

    setTimeout(() => orb.classList.remove("pop"), 180);
    return { id, color };
  }

  function updateOrb(id, r, c) {
    const o = orbs.get(id);
    if (!o) return;
    o.r = r; o.c = c;
    const { x,y,tileSize } = posToTransform(r,c);
    o.el.style.width = `${tileSize}px`;
    o.el.style.height = `${tileSize}px`;
    o.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function removeOrb(id) {
    const o = orbs.get(id);
    if (!o) return;
    o.el.remove();
    orbs.delete(id);
  }

  function emptyGrid() {
    grid = Array.from({length:size}, ()=>Array.from({length:size}, ()=>null));
    orbs.forEach(({el}) => el.remove());
    orbs.clear();
    idCounter = 1;
  }

  // ===== Core mechanics (DOM grid) =====
  const DIRS = {
    left:  [0,-1],
    right: [0, 1],
    up:    [-1,0],
    down:  [1, 0],
  };
  function inBounds(r,c){ return r>=0 && r<size && c>=0 && c<size; }

  function applyShift(dir) {
    const [dr,dc] = DIRS[dir];
    const before = hashGridDOM(grid);

    const rows = [...Array(size).keys()];
    const cols = [...Array(size).keys()];
    if (dr>0) rows.reverse();
    if (dc>0) cols.reverse();

    for (const r of rows){
      for (const c of cols){
        const cell = grid[r][c];
        if (!cell) continue;

        let nr=r, nc=c;
        while (true) {
          const rr = nr+dr, cc = nc+dc;
          if (!inBounds(rr,cc)) break;
          if (grid[rr][cc]) break;
          nr=rr; nc=cc;
        }
        if (nr===r && nc===c) continue;

        grid[nr][nc] = cell;
        grid[r][c] = null;
      }
    }

    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        const cell = grid[r][c];
        if (cell) updateOrb(cell.id, r, c);
      }
    }

    const after = hashGridDOM(grid);
    return before !== after;
  }

  function findClustersDOM() {
    const visited = Array.from({length:size}, ()=>Array.from({length:size}, ()=>false));
    const clusters = [];
    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        const cell = grid[r][c];
        if (!cell || visited[r][c]) continue;

        const color = cell.color;
        const stack = [[r,c]];
        const group = [];
        visited[r][c] = true;

        while (stack.length){
          const [rr,cc] = stack.pop();
          group.push([rr,cc]);
          for (const [nr,nc] of [[rr-1,cc],[rr+1,cc],[rr,cc-1],[rr,cc+1]]) {
            if (!inBounds(nr,nc) || visited[nr][nc]) continue;
            const ncell = grid[nr][nc];
            if (ncell && ncell.color === color){
              visited[nr][nc] = true;
              stack.push([nr,nc]);
            }
          }
        }

        if (group.length >= MIN_CLUSTER) clusters.push({ color, cells: group });
      }
    }
    return clusters;
  }

  function applyGoalProgress(poppedTotal, poppedByColorMap) {
    if (!goal) return;

    if (goal.type === "popTotal") {
      goal.remaining = Math.max(0, goal.remaining - poppedTotal);
    } else if (goal.type === "clearColor") {
      const hit = poppedByColorMap.get(goal.color) || 0;
      goal.remaining = Math.max(0, goal.remaining - hit);
    } else if (goal.type === "clearMulti") {
      for (const it of goal.items) {
        const hit = poppedByColorMap.get(it.color) || 0;
        it.remaining = Math.max(0, it.remaining - hit);
      }
    } else if (goal.type === "densityBelow") {
      // nothing to decrement; evaluated from fill%
    }
    updateGoalUI();
  }

  function goalSatisfiedDOM() {
    if (!goal) return false;
    if (goal.type === "popTotal") return goal.remaining <= 0;
    if (goal.type === "clearColor") return goal.remaining <= 0;
    if (goal.type === "clearMulti") return goal.items.every(it => it.remaining <= 0);
    if (goal.type === "densityBelow") return currentFillPct(grid, size) <= goal.threshold;
    return false;
  }

  async function popClustersDOM(clusters, chainStep) {
    let totalPopped = 0;
    const totalPoppedByColor = new Map();
    let totalScoreGained = 0;

    for (const cl of clusters) {
      const toPop = new Map(); // "r,c" -> {id,color}
      for (const [r,c] of cl.cells){
        const cell = grid[r][c];
        if (cell) toPop.set(`${r},${c}`, { id: cell.id, color: cell.color });
      }

      const poppedByColor = new Map();
      for (const v of toPop.values()){
        poppedByColor.set(v.color, (poppedByColor.get(v.color)||0) + 1);
      }

      const popped = toPop.size;

      // score for this cluster
      const base = popped * 10;
      const bonus = Math.max(0, popped - MIN_CLUSTER) * 5;
      const scoreGained = (base + bonus) * chainStep;
      setScore(score + scoreGained);
      totalScoreGained += scoreGained;

      // floating score
      let sumR = 0, sumC = 0;
      for (const [r,c] of cl.cells) { sumR += r; sumC += c; }
      const avgR = sumR / cl.cells.length;
      const avgC = sumC / cl.cells.length;
      const { x, y } = posToTransform(avgR, avgC);
      const floatEl = document.createElement("div");
      floatEl.className = "float-score";
      floatEl.textContent = "+" + scoreGained;
      floatEl.style.left = `${x}px`;
      floatEl.style.top = `${y}px`;
      boardEl.appendChild(floatEl);
      setTimeout(() => floatEl.classList.add("animate"), 10);
      setTimeout(() => boardEl.removeChild(floatEl), 1100);

      popSound(popped, chainStep);

      // animate: first glow
      for (const key of toPop.keys()){
        const [r,c] = key.split(",").map(Number);
        const cell = grid[r][c];
        if (!cell) continue;
        const o = orbs.get(cell.id);
        if (o) o.el.classList.add("glow");
      }

      await sleep(200); // glow time

      // then burst
      for (const key of toPop.keys()){
        const [r,c] = key.split(",").map(Number);
        const cell = grid[r][c];
        if (!cell) continue;
        const o = orbs.get(cell.id);
        if (o) {
          o.el.classList.remove("glow");
          o.el.classList.add("blast");
        }
      }

      await sleep(300); // blast time

      for (const key of toPop.keys()){
        const [r,c] = key.split(",").map(Number);
        const cell = grid[r][c];
        if (!cell) continue;
        removeOrb(cell.id);
        grid[r][c] = null;
      }

      totalPopped += popped;
      for (const [color, count] of poppedByColor) {
        totalPoppedByColor.set(color, (totalPoppedByColor.get(color) || 0) + count);
      }

      // small delay between clusters
      await sleep(100);
    }

    return { popped: totalPopped, poppedByColor: totalPoppedByColor, scoreGained: totalScoreGained };
  }

  async function resolveChainDOM(dir) {
    animating = true;
    let chain = 1;
    let totalGained = 0;

    while (true) {
      const clusters = findClustersDOM();
      if (!clusters.length) break;

      const res = await popClustersDOM(clusters, chain);
      applyGoalProgress(res.popped, res.poppedByColor);
      totalGained += res.scoreGained;

      applyShift(dir);
      await sleep(200);

      chain++;
      if (chain > 12) break;
    }

    animating = false;

    // Show move notification
    const chainCount = chain - 1;
    if (chainCount > 0) {
      banner(`Chain x${chainCount}! +${totalGained} pts`, "move");
    } else {
      banner("No pops. Next move.", "move");
    }

    if (goalSatisfiedDOM()) return onWin();
    if (movesLeft <= 0) return onLose();
  }

  // ===== PHASE 2: Solvable generator + solver (pure simulation) =====

  // We simulate on a compact grid representation: int color or -1 empty
  function domToSimGrid(domGrid) {
    const g = Array.from({length:size}, () => Array.from({length:size}, () => -1));
    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        const cell = domGrid[r][c];
        if (cell) g[r][c] = cell.color;
      }
    }
    return g;
  }

  function simGridHash(g) {
    // fast-ish hash string, acceptable for <= 8x8
    let s = "";
    for (let r=0;r<g.length;r++){
      for (let c=0;c<g.length;c++){
        const v = g[r][c];
        s += (v < 0 ? "." : String.fromCharCode(65+v));
      }
    }
    return s;
  }

  function cloneSim(g) {
    return g.map(row => row.slice());
  }

  function applyShiftSim(g, dir) {
    const n = g.length;
    const [dr,dc] = DIRS[dir];

    const rows = [...Array(n).keys()];
    const cols = [...Array(n).keys()];
    if (dr>0) rows.reverse();
    if (dc>0) cols.reverse();

    let moved = false;

    for (const r of rows){
      for (const c of cols){
        const cell = g[r][c];
        if (cell < 0) continue;

        let nr=r, nc=c;
        while (true) {
          const rr = nr+dr, cc = nc+dc;
          if (rr<0 || rr>=n || cc<0 || cc>=n) break;
          if (g[rr][cc] >= 0) break;
          nr=rr; nc=cc;
        }
        if (nr===r && nc===c) continue;

        g[nr][nc] = cell;
        g[r][c] = -1;
        moved = true;
      }
    }
    return moved;
  }

  function findClustersSim(g) {
    const n = g.length;
    const vis = Array.from({length:n}, ()=>Array.from({length:n}, ()=>false));
    const clusters = [];

    for (let r=0;r<n;r++){
      for (let c=0;c<n;c++){
        const color = g[r][c];
        if (color < 0 || vis[r][c]) continue;

        const stack = [[r,c]];
        const cells = [];
        vis[r][c] = true;

        while (stack.length){
          const [rr,cc] = stack.pop();
          cells.push([rr,cc]);
          for (const [nr,nc] of [[rr-1,cc],[rr+1,cc],[rr,cc-1],[rr,cc+1]]) {
            if (nr<0||nr>=n||nc<0||nc>=n||vis[nr][nc]) continue;
            if (g[nr][nc] === color){
              vis[nr][nc] = true;
              stack.push([nr,nc]);
            }
          }
        }

        if (cells.length >= MIN_CLUSTER) clusters.push({ color, cells });
      }
    }
    return clusters;
  }

  function popClustersSim(g, clusters) {
    const poppedByColor = Array(COLORS).fill(0);
    let popped = 0;

    for (const cl of clusters) {
      for (const [r,c] of cl.cells) {
        const v = g[r][c];
        if (v >= 0) {
          popped++;
          poppedByColor[v]++;
          g[r][c] = -1;
        }
      }
    }
    return { popped, poppedByColor };
  }

  function resolveChainSim(g, dir) {
    // returns counts popped in this move across all chain steps, and final grid
    const totalByColor = Array(COLORS).fill(0);
    let totalPopped = 0;

    let safety = 0;
    while (true) {
      const clusters = findClustersSim(g);
      if (!clusters.length) break;

      const res = popClustersSim(g, clusters);
      totalPopped += res.popped;
      for (let i=0;i<COLORS;i++) totalByColor[i] += res.poppedByColor[i];

      applyShiftSim(g, dir);
      safety++;
      if (safety > 12) break;
    }

    return { totalPopped, totalByColor, grid: g };
  }

  function currentFillPct(domGrid, n) {
    let filled = 0;
    for (let r=0;r<n;r++) for (let c=0;c<n;c++) if (domGrid[r][c]) filled++;
    return filled / (n*n);
  }

  function currentFillPctSim(g) {
    const n = g.length;
    let filled = 0;
    for (let r=0;r<n;r++) for (let c=0;c<n;c++) if (g[r][c] >= 0) filled++;
    return filled / (n*n);
  }

  function hashGridDOM(domGrid) {
    let s = "";
    for (let r=0;r<domGrid.length;r++){
      for (let c=0;c<domGrid.length;c++){
        const cell = domGrid[r][c];
        s += cell ? String.fromCharCode(65+cell.color) : ".";
      }
    }
    return s;
  }

  // Convert goal object -> a compact requirement structure for solver
  function normalizeGoalForSolver(g) {
    if (g.type === "popTotal") return { type:"popTotal", remaining: g.remaining };
    if (g.type === "clearColor") return { type:"clearColor", remainingByColor: withOneColor(g.color, g.remaining) };
    if (g.type === "clearMulti") {
      const arr = Array(COLORS).fill(0);
      for (const it of g.items) arr[it.color] = it.remaining;
      return { type:"clearMulti", remainingByColor: arr };
    }
    if (g.type === "densityBelow") return { type:"densityBelow", threshold: g.threshold };
    return { type:"popTotal", remaining: 999 };
  }

  function withOneColor(color, remaining) {
    const arr = Array(COLORS).fill(0);
    arr[color] = remaining;
    return arr;
  }

  function goalSatisfiedSim(goalN, g) {
    if (goalN.type === "popTotal") return goalN.remaining <= 0;
    if (goalN.type === "clearColor") return goalN.remainingByColor.every(v => v <= 0);
    if (goalN.type === "clearMulti") return goalN.remainingByColor.every(v => v <= 0);
    if (goalN.type === "densityBelow") return currentFillPctSim(g) <= goalN.threshold;
    return false;
  }

  function applyGoalSim(goalN, poppedTotal, poppedByColor) {
    if (goalN.type === "popTotal") {
      const ng = { ...goalN, remaining: Math.max(0, goalN.remaining - poppedTotal) };
      return ng;
    }
    if (goalN.type === "clearColor" || goalN.type === "clearMulti") {
      const nb = goalN.remainingByColor.slice();
      for (let i=0;i<COLORS;i++) {
        if (nb[i] > 0) nb[i] = Math.max(0, nb[i] - poppedByColor[i]);
      }
      return { ...goalN, remainingByColor: nb };
    }
    if (goalN.type === "densityBelow") {
      return goalN; // evaluated from grid
    }
    return goalN;
  }

  function goalKey(goalN) {
    if (goalN.type === "popTotal") return `P${goalN.remaining}`;
    if (goalN.type === "densityBelow") return `D${Math.round(goalN.threshold*100)}`;
    // color arrays
    return `C${goalN.remainingByColor.join(",")}`;
  }

  // Solver: DFS with memo. Returns moves array if solvable, else null.
  function isSolvable(simGridStart, goalObj, moves) {
    const goalN = normalizeGoalForSolver(goalObj);

    const memo = new Set();
    const dirs = ["up","down","left","right"];

    function dfs(g, goalState, mLeft, movesSoFar) {
      if (goalSatisfiedSim(goalState, g)) return movesSoFar.slice();
      if (mLeft <= 0) return null;

      const key = simGridHash(g) + "|" + goalKey(goalState) + "|" + mLeft;
      if (memo.has(key)) return null;
      memo.add(key);

      // quick prune for popTotal: not enough tiles exist
      if (goalState.type === "popTotal") {
        const maxPossible = countFilledSim(g);
        if (goalState.remaining > maxPossible) return null;
      }

      // try all 4 moves
      for (const d of dirs) {
        const g2 = cloneSim(g);
        const moved = applyShiftSim(g2, d);
        if (!moved) continue;

        const res = resolveChainSim(g2, d);
        const nextGoal = applyGoalSim(goalState, res.totalPopped, res.totalByColor);

        const result = dfs(res.grid, nextGoal, mLeft - 1, [...movesSoFar, d]);
        if (result) return result;
      }
      return null;
    }

    return dfs(cloneSim(simGridStart), goalN, moves, []);
  }

  function countFilledSim(g) {
    const n = g.length;
    let filled = 0;
    for (let r=0;r<n;r++) for (let c=0;c<n;c++) if (g[r][c] >= 0) filled++;
    return filled;
  }

  // ===== Strategy pool (15+ templates) =====
  // We generate candidate goals based on level difficulty.
  function strategiesForLevel(lv) {
    // difficulty band 0..3
    const band = lv <= 3 ? 0 : lv <= 10 ? 1 : lv <= 25 ? 2 : 3;

    const list = [];

    // Pop totals
    list.push({ type:"popTotal", target: 15 + band*10 + Math.min(30, lv*2), remaining: 15 + band*10 + Math.min(30, lv*2) });
    list.push({ type:"popTotal", target: 20 + band*12 + Math.floor(lv*1.5), remaining: 20 + band*12 + Math.floor(lv*1.5) });

    // Clear single color
    for (let c=0;c<COLORS;c++){
      list.push({ type:"clearColor", color:c, target: 10 + band*5, remaining: 10 + band*5 });
    }

    // Combos (two colors)
    list.push({
      type:"clearMulti",
      items: [
        { color:2, target: 12 + band*4, remaining: 12 + band*4 }, // green
        { color:4, target: 8 + band*3, remaining: 8 + band*3 }, // red
      ]
    });
    list.push({
      type:"clearMulti",
      items: [
        { color:0, target: 10 + band*4, remaining: 10 + band*4 }, // cyan
        { color:1, target: 10 + band*4, remaining: 10 + band*4 }, // purple
      ]
    });

    // Density goals
    list.push({ type:"densityBelow", threshold: band === 0 ? 0.55 : band === 1 ? 0.48 : band === 2 ? 0.42 : 0.38 });

    // Additional variations for more diversity
    // More popTotal options
    list.push({ type:"popTotal", target: 25 + band*8, remaining: 25 + band*8 });
    list.push({ type:"popTotal", target: 30 + band*10 + lv, remaining: 30 + band*10 + lv });

    // More clearColor with varied targets
    for (let c=0;c<COLORS;c++){
      list.push({ type:"clearColor", color:c, target: 12 + band*3, remaining: 12 + band*3 });
      list.push({ type:"clearColor", color:c, target: 15 + band*4, remaining: 15 + band*4 });
    }

    // More multi-color combos
    list.push({
      type:"clearMulti",
      items: [
        { color:1, target: 12 + band*3, remaining: 12 + band*3 }, // purple
        { color:3, target: 10 + band*3, remaining: 10 + band*3 }, // yellow
      ]
    });
    list.push({
      type:"clearMulti",
      items: [
        { color:2, target: 15 + band*4, remaining: 15 + band*4 }, // green
        { color:4, target: 10 + band*3, remaining: 10 + band*3 }, // red
      ]
    });

    // “Harder” combos
    if (band >= 2) {
      list.push({
        type:"clearMulti",
        items: [
          { color:3, target: 15 + band*3, remaining: 15 + band*3 }, // yellow
          { color:4, target: 12 + band*3, remaining: 12 + band*3 },  // red
        ]
      });
      list.push({ type:"popTotal", target: 35 + band*8, remaining: 35 + band*8 });
    }

    return list;
  }

  // ===== Level sizing rules from you =====
  function pickSizeForLevel(lv) {
    // first 3: 5x5 / 6x6
    if (lv <= 3) return Math.random() < 0.5 ? 5 : 6;

    // next 7: 6x6 / 7x7  (levels 4..10)
    if (lv <= 10) return Math.random() < 0.5 ? 6 : 7;

    // rest: 7x7 / 8x8
    return Math.random() < 0.5 ? 7 : 8;
  }

  function movesForLevel(lv) {
    // minimum 4 moves, longer rounds
    if (lv <= 2) return 4;
    if (lv <= 6) return 5;
    if (lv <= 14) return 6;
    return 7;
  }

  function fillForLevel(lv) {
    // slightly denser as levels grow
    return Math.min(0.92, 0.78 + lv*0.006);
  }

  // ===== Generate a solvable level =====
  async function generateSolvableLevel(lv) {
    showGenerating(`Generating level ${lv} (solvable)…`);

    size = pickSizeForLevel(lv);
    buildBackgroundGrid();
    emptyGrid();

    const moves = movesForLevel(lv);
    const fill = fillForLevel(lv);

    // choose 6 candidate goals per attempt
    const candidates = strategiesForLevel(lv);

    const MAX_ATTEMPTS = 120;

    for (let attempt=1; attempt<=MAX_ATTEMPTS; attempt++) {
      // create random board
      newRandomBoardDOM(fill);

      // convert to sim grid once
      const sim = domToSimGrid(grid);

      // choose a subset of candidate goals to test this attempt
      const picked = pickRandomSubset(candidates, 6);

      for (const g of picked) {
        // clone goal so solver doesn't mutate shared refs
        const goalCopy = deepCloneGoal(g);

        // run solver
        const solution = isSolvable(sim, goalCopy, moves);
        if (solution) {
          // accept this board + this goal
          hideOverlay();
          setLevel(lv);
          setMoves(moves);
          // setScore(0); // remove to carry score forward

          // set live goal state fresh (copy again)
          setGoal(deepCloneGoal(g));

          currentLevelGrid = cloneSim(sim);
          currentLevelGoal = deepCloneGoal(g);
          currentLevelMoves = moves;
          solutionMoves = solution;

          banner(`Level ${lv} ready. ${moves} moves.`, "move");
          return;
        }
      }

      // keep UI alive if generation takes long
      if (attempt % 10 === 0) {
        overlayBody.innerHTML = `
          <div class="spinner"></div>
          <div style="text-align:center; color: rgba(255,255,255,.70)">
            Generating level ${lv}… (attempt ${attempt}/${MAX_ATTEMPTS})
          </div>
        `;
        await sleep(0); // yield
      }
    }

    // fallback (should be rare): accept a random board + easy goal
    hideOverlay();
    setLevel(lv);
    setMoves(moves);
    // setScore(0); // carry forward
    setGoal({ type:"popTotal", target: 10, remaining: 10 });
    solutionMoves = null;
    banner("Fallback level (could be easier).", "move");
  }

  function newRandomBoardDOM(fill) {
    buildBackgroundGrid();
    emptyGrid();

    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        if (Math.random() < fill) {
          const color = Math.floor(Math.random()*COLORS);
          grid[r][c] = mountOrb(r,c,color);
        }
      }
    }
  }

  function loadStoredLevel() {
    hideOverlay();
    emptyGrid();

    size = currentLevelGrid.length;
    buildBackgroundGrid();

    // load grid
    for (let r=0; r<size; r++) {
      for (let c=0; c<size; c++) {
        const color = currentLevelGrid[r][c];
        if (color >= 0) {
          grid[r][c] = mountOrb(r, c, color);
        }
      }
    }

    setMoves(currentLevelMoves);
    setGoal(deepCloneGoal(currentLevelGoal));
    setScore(0);

    banner(`Retrying level ${level}. ${currentLevelMoves} moves left.`, "move");
  }

  function pickRandomSubset(arr, k) {
    const copy = arr.slice();
    // Fisher-Yates partial
    for (let i=copy.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(k, copy.length));
  }

  function deepCloneGoal(g) {
    if (g.type === "clearMulti") {
      return { type:"clearMulti", items: g.items.map(it => ({...it})) };
    }
    return { ...g };
  }

  // ===== Win/Lose =====
  function goalSatisfiedDOM() {
    if (!goal) return false;
    if (goal.type === "popTotal") return goal.remaining <= 0;
    if (goal.type === "clearColor") return goal.remaining <= 0;
    if (goal.type === "clearMulti") return goal.items.every(it => it.remaining <= 0);
    if (goal.type === "densityBelow") return currentFillPct(grid, size) <= goal.threshold;
    return false;
  }

  function onWin() {
    goodSound();
    banner("Mission cleared!", "move");
    overlayTitle.textContent = "Level Complete";
    overlayBody.innerHTML = `
      You cleared the mission.<br><br>
      <b>Level:</b> ${level}<br>
      <b>Score:</b> ${score}<br>
      <b>Best:</b> ${best}<br><br>
      Next level in <span id="countdown">5</span> seconds...
    `;
    closeOverlay.style.display = 'none';
    overlayPrimary.style.display = 'none';
    overlay.classList.add("show");

    let count = 5;
    const countdownEl = qs("#countdown");
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        countdownEl.textContent = count;
      } else {
        clearInterval(timer);
        overlay.classList.remove("show");
        setLevel(level + 1);
        generateSolvableLevel(level);
      }
    }, 1000);

    // clear stored level for next new level
    currentLevelGrid = null;
    currentLevelGoal = null;
    currentLevelMoves = 0;
    solutionMoves = null;
  }

  function onLose() {
    badSound();
    banner("Out of moves.", "move");
    overlayTitle.textContent = "Mission Failed";
    overlayBody.innerHTML = `
      You ran out of moves.<br><br>
      <b>Goal:</b> ${goalToText(goal)}<br>
      <b>Remaining:</b> ${goalRemainingText(goal)}<br><br>
      Retry this level?
    `;
    overlayPrimary.textContent = "Retry";
    overlay.classList.add("show");
  }

  // ===== Move input =====
  let startX=0, startY=0, touching=false;

  function attemptMove(dir) {
    initAudio();
    if (animating) return;
    if (movesLeft <= 0) return banner("No moves left.", "move");

    const moved = applyShift(dir);
    if (!moved) return banner("No movement that way.", "move");

    setMoves(movesLeft - 1);
    banner(`Resolving… (${movesLeft} left)`, "move");

    resolveChainDOM(dir);
  }

  // ===== Buttons & overlay actions =====
  nextBtn.addEventListener("click", () => generateSolvableLevel(level));
  retryBtn.addEventListener("click", () => {
    if (currentLevelGrid && currentLevelGoal && currentLevelMoves > 0) {
      loadStoredLevel();
    } else {
      generateSolvableLevel(level);
    }
  });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
    refreshSoundBtn();
    if (soundOn) { initAudio(); goodSound(); banner("Sound on", "move"); }
    else banner("Muted", "move");
  });

  themeBtn.addEventListener("click", () => {
    theme = theme === "default" ? "ubuntu" : "default";
    localStorage.setItem(LS_THEME, theme);
    document.body.classList.toggle("ubuntu-theme");
    banner(theme === "ubuntu" ? "Ubuntu theme" : "Default theme", "move");
  });

  howBtn.addEventListener("click", () => {
    overlayTitle.textContent = "How to Play";
    overlayBody.innerHTML = `
      <ul style="margin:0; padding-left:18px;">
        <li>Each level has a <b>move limit</b>.</li>
        <li>Swipe to slide orbs.</li>
        <li>Groups of <b>3+</b> connected same-color orbs pop.</li>
        <li>Pops can chain automatically.</li>
        <li>Levels are <b>generated solvable</b>.</li>
      </ul>
    `;
    overlayPrimary.textContent = "Close";
    closeOverlay.style.display = '';
    overlayPrimary.style.display = 'none';
    overlay.classList.add("show");
  });

  hintBtn.addEventListener("click", () => {
    if (!goal) return;
    overlayTitle.textContent = "Hint";
    let body = `
      <b>Goal:</b> ${goalToText(goal)}<br>
      <b>Remaining:</b> ${goalRemainingText(goal)}<br>
      <b>Moves left:</b> ${movesLeft}<br><br>
    `;
    if (solutionMoves && solutionMoves.length > 0) {
      body += `<b>Solution moves:</b><br>${solutionMoves.map((m, i) => `${i+1}. ${m}`).join('<br>')}<br><br>`;
    }
    body += `Keep trying!`;
    overlayBody.innerHTML = body;
    overlayPrimary.textContent = "Close";
    closeOverlay.style.display = '';
    overlayPrimary.style.display = 'none';
    overlay.classList.add("show");
  });

  closeOverlay.addEventListener("click", () => overlay.classList.remove("show"));

  overlayPrimary.addEventListener("click", () => {
    overlay.classList.remove("show");
    if (!goal) return;

    if (goalSatisfiedDOM()) {
      setLevel(level + 1);
      generateSolvableLevel(level);
    } else {
      // retry
      if (currentLevelGrid && currentLevelGoal && currentLevelMoves > 0) {
        loadStoredLevel();
      } else {
        generateSolvableLevel(level);
      }
    }
  });

  function refreshSoundBtn() {
    soundBtn.textContent = soundOn ? "🔊 Sound" : "🔇 Muted";
    soundBtn.setAttribute("aria-pressed", String(!soundOn));
  }

  // Touch input
  boardEl.addEventListener("touchstart", (e) => {
    initAudio();
    touching = true;
    const t = e.changedTouches[0];
    startX=t.clientX; startY=t.clientY;
  }, {passive:true});

  boardEl.addEventListener("touchend", (e) => {
    if (!touching) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const TH = 24;
    if (adx < TH && ady < TH) return;

    if (adx > ady) attemptMove(dx>0 ? "right" : "left");
    else attemptMove(dy>0 ? "down" : "up");

    touching = false;
  }, {passive:true});

  // Keyboard input
  document.addEventListener("keydown", (e) => {
    initAudio();
    const k = e.key.toLowerCase();
    if (k==="arrowleft" || k==="a") attemptMove("left");
    if (k==="arrowright"|| k==="d") attemptMove("right");
    if (k==="arrowup"   || k==="w") attemptMove("up");
    if (k==="arrowdown" || k==="s") attemptMove("down");
  });

  // Audio unlock
  document.addEventListener("pointerdown", initAudio, {passive:true});
  document.addEventListener("touchstart", initAudio, {passive:true});

  // Resize: keep orb positions correct
  window.addEventListener("resize", () => {
    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        const cell = grid[r][c];
        if (cell) updateOrb(cell.id, r, c);
      }
    }
  });

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  // ===== PWA Service Worker Registration =====
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }

  // ===== Start =====
  generateSolvableLevel(1);
})();
