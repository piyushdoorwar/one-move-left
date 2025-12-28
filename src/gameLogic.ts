import type { Goal, Cluster } from './types';
import { COLORS, MIN_CLUSTER } from './types';

export const DIRS = {
  left: [0, -1],
  right: [0, 1],
  up: [-1, 0],
  down: [1, 0],
} as const;

export function inBounds(r: number, c: number, size: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size;
}

export function applyShift(grid: number[][], dir: keyof typeof DIRS, size: number): boolean {
  const [dr, dc] = DIRS[dir];
  const rows = [...Array(size).keys()];
  const cols = [...Array(size).keys()];
  if (dr > 0) rows.reverse();
  if (dc > 0) cols.reverse();

  let moved = false;
  for (const r of rows) {
    for (const c of cols) {
      const cell = grid[r][c];
      if (cell < 0) continue;

      let nr = r, nc = c;
      while (true) {
        const rr = nr + dr, cc = nc + dc;
        if (!inBounds(rr, cc, size)) break;
        if (grid[rr][cc] >= 0) break;
        nr = rr;
        nc = cc;
      }
      if (nr === r && nc === c) continue;

      grid[nr][nc] = cell;
      grid[r][c] = -1;
      moved = true;
    }
  }
  return moved;
}

export function findClusters(grid: number[][], size: number): Cluster[] {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const clusters: Cluster[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const color = grid[r][c];
      if (color < 0 || visited[r][c]) continue;

      const stack: [number, number][] = [[r, c]];
      const cells: [number, number][] = [];
      visited[r][c] = true;

      while (stack.length) {
        const [rr, cc] = stack.pop()!;
        cells.push([rr, cc]);
        for (const [nr, nc] of [
          [rr - 1, cc],
          [rr + 1, cc],
          [rr, cc - 1],
          [rr, cc + 1],
        ]) {
          if (!inBounds(nr, nc, size) || visited[nr][nc]) continue;
          if (grid[nr][nc] === color) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      if (cells.length >= MIN_CLUSTER) clusters.push({ color, cells });
    }
  }
  return clusters;
}

export function popClusters(grid: number[][], clusters: Cluster[]): { popped: number; poppedByColor: number[] } {
  const poppedByColor = Array(COLORS).fill(0);
  let popped = 0;

  for (const cl of clusters) {
    for (const [r, c] of cl.cells) {
      const v = grid[r][c];
      if (v >= 0) {
        popped++;
        poppedByColor[v]++;
        grid[r][c] = -1;
      }
    }
  }
  return { popped, poppedByColor };
}

export function resolveChain(grid: number[][], dir: keyof typeof DIRS, size: number): { totalPopped: number; totalByColor: number[] } {
  const totalByColor = Array(COLORS).fill(0);
  let totalPopped = 0;
  let safety = 0;
  while (true) {
    const clusters = findClusters(grid, size);
    if (!clusters.length) break;

    const res = popClusters(grid, clusters);
    totalPopped += res.popped;
    for (let i = 0; i < COLORS; i++) totalByColor[i] += res.poppedByColor[i];

    applyShift(grid, dir, size);
    safety++;
    if (safety > 12) break;
  }
  return { totalPopped, totalByColor };
}

export function currentFillPct(grid: number[][], size: number): number {
  let filled = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c] >= 0) filled++;
  return filled / (size * size);
}

export function goalSatisfied(goal: Goal | null, grid: number[][], size: number): boolean {
  if (!goal) return false;
  if (goal.type === "popTotal") return goal.remaining <= 0;
  if (goal.type === "clearColor") return goal.remaining <= 0;
  if (goal.type === "clearMulti") return goal.items!.every(it => it.remaining <= 0);
  if (goal.type === "densityBelow") return currentFillPct(grid, size) <= goal.threshold!;
  return false;
}

export function applyGoalProgress(goal: Goal | null, poppedTotal: number, poppedByColor: number[]): void {
  if (!goal) return;
  if (goal.type === "popTotal") {
    goal.remaining = Math.max(0, goal.remaining - poppedTotal);
  } else if (goal.type === "clearColor") {
    const hit = poppedByColor[goal.color!] || 0;
    goal.remaining = Math.max(0, goal.remaining - hit);
  } else if (goal.type === "clearMulti") {
    for (const it of goal.items!) {
      const hit = poppedByColor[it.color] || 0;
      it.remaining = Math.max(0, it.remaining - hit);
    }
  }
  // densityBelow doesn't decrement
}

export function cloneGrid(grid: number[][]): number[][] {
  return grid.map(row => row.slice());
}

export function generateRandomBoard(size: number, fill: number): number[][] {
  const grid = Array.from({ length: size }, () => Array(size).fill(-1));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (Math.random() < fill) {
        grid[r][c] = Math.floor(Math.random() * COLORS);
      }
    }
  }
  return grid;
}

// ===== Solver functions =====

export function simGridHash(g: number[][]): string {
  let s = "";
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[r].length; c++) {
      const v = g[r][c];
      s += (v < 0 ? "." : String.fromCharCode(65 + v));
    }
  }
  return s;
}

export function cloneSim(g: number[][]): number[][] {
  return g.map(row => row.slice());
}

export function applyShiftSim(g: number[][], dir: keyof typeof DIRS): boolean {
  const n = g.length;
  const [dr, dc] = DIRS[dir];

  const rows = [...Array(n).keys()];
  const cols = [...Array(n).keys()];
  if (dr > 0) rows.reverse();
  if (dc > 0) cols.reverse();

  let moved = false;

  for (const r of rows) {
    for (const c of cols) {
      const cell = g[r][c];
      if (cell < 0) continue;

      let nr = r, nc = c;
      while (true) {
        const rr = nr + dr, cc = nc + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) break;
        if (g[rr][cc] >= 0) break;
        nr = rr;
        nc = cc;
      }
      if (nr === r && nc === c) continue;

      g[nr][nc] = cell;
      g[r][c] = -1;
      moved = true;
    }
  }
  return moved;
}

export function findClustersSim(g: number[][]): Cluster[] {
  const n = g.length;
  const vis = Array.from({ length: n }, () => Array(n).fill(false));
  const clusters: Cluster[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const color = g[r][c];
      if (color < 0 || vis[r][c]) continue;

      const stack = [[r, c]];
      const cells: [number, number][] = [];
      vis[r][c] = true;

      while (stack.length) {
        const [rr, cc] = stack.pop()!;
        cells.push([rr, cc]);
        for (const [nr, nc] of [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]]) {
          if (nr < 0 || nr >= n || nc < 0 || nc >= n || vis[nr][nc]) continue;
          if (g[nr][nc] === color) {
            vis[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      if (cells.length >= MIN_CLUSTER) clusters.push({ color, cells });
    }
  }
  return clusters;
}

export function popClustersSim(g: number[][], clusters: Cluster[]): { popped: number; poppedByColor: number[] } {
  const poppedByColor = Array(COLORS).fill(0);
  let popped = 0;

  for (const cl of clusters) {
    for (const [r, c] of cl.cells) {
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

export function resolveChainSim(g: number[][], dir: keyof typeof DIRS): { totalPopped: number; totalByColor: number[]; grid: number[][] } {
  const totalByColor = Array(COLORS).fill(0);
  let totalPopped = 0;

  let safety = 0;
  while (true) {
    const clusters = findClustersSim(g);
    if (!clusters.length) break;

    const res = popClustersSim(g, clusters);
    totalPopped += res.popped;
    for (let i = 0; i < COLORS; i++) totalByColor[i] += res.poppedByColor[i];

    applyShiftSim(g, dir);
    safety++;
    if (safety > 12) break;
  }

  return { totalPopped, totalByColor, grid: g };
}

export function currentFillPctSim(g: number[][]): number {
  const n = g.length;
  let filled = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] >= 0) filled++;
  return filled / (n * n);
}

export interface NormalizedGoal {
  type: 'popTotal' | 'clearColor' | 'clearMulti' | 'densityBelow';
  remaining?: number;
  remainingByColor?: number[];
  threshold?: number;
}

export function normalizeGoalForSolver(g: Goal): NormalizedGoal {
  if (g.type === 'popTotal') return { type: 'popTotal', remaining: g.remaining };
  if (g.type === 'clearColor') return { type: 'clearColor', remainingByColor: withOneColor(g.color!, g.remaining) };
  if (g.type === 'clearMulti') {
    const arr = Array(COLORS).fill(0);
    for (const it of g.items!) arr[it.color] = it.remaining;
    return { type: 'clearMulti', remainingByColor: arr };
  }
  if (g.type === 'densityBelow') return { type: 'densityBelow', threshold: g.threshold };
  return { type: 'popTotal', remaining: 999 };
}

function withOneColor(color: number, remaining: number): number[] {
  const arr = Array(COLORS).fill(0);
  arr[color] = remaining;
  return arr;
}

export function goalSatisfiedSim(goalN: NormalizedGoal, g: number[][]): boolean {
  if (goalN.type === 'popTotal') return goalN.remaining! <= 0;
  if (goalN.type === 'clearColor') return goalN.remainingByColor!.every(v => v <= 0);
  if (goalN.type === 'clearMulti') return goalN.remainingByColor!.every(v => v <= 0);
  if (goalN.type === 'densityBelow') return currentFillPctSim(g) <= goalN.threshold!;
  return false;
}

export function applyGoalSim(goalN: NormalizedGoal, poppedTotal: number, poppedByColor: number[]): NormalizedGoal {
  if (goalN.type === 'popTotal') {
    return { ...goalN, remaining: Math.max(0, goalN.remaining! - poppedTotal) };
  }
  if (goalN.type === 'clearColor' || goalN.type === 'clearMulti') {
    const nb = goalN.remainingByColor!.slice();
    for (let i = 0; i < COLORS; i++) {
      if (nb[i] > 0) nb[i] = Math.max(0, nb[i] - poppedByColor[i]);
    }
    return { ...goalN, remainingByColor: nb };
  }
  if (goalN.type === 'densityBelow') {
    return goalN;
  }
  return goalN;
}

export function goalKey(goalN: NormalizedGoal): string {
  if (goalN.type === 'popTotal') return `P${goalN.remaining}`;
  if (goalN.type === 'densityBelow') return `D${Math.round(goalN.threshold! * 100)}`;
  return `C${goalN.remainingByColor!.join(',')}`;
}

export function isSolvable(simGridStart: number[][], goalObj: Goal, moves: number): string[] | null {
  const goalN = normalizeGoalForSolver(goalObj);

  const memo = new Set<string>();
  const dirs: (keyof typeof DIRS)[] = ['up', 'down', 'left', 'right'];

  function dfs(g: number[][], goalState: NormalizedGoal, mLeft: number, movesSoFar: string[]): string[] | null {
    if (goalSatisfiedSim(goalState, g)) return movesSoFar.slice();
    if (mLeft <= 0) return null;

    const key = simGridHash(g) + '|' + goalKey(goalState) + '|' + mLeft;
    if (memo.has(key)) return null;
    memo.add(key);

    if (goalState.type === 'popTotal') {
      const maxPossible = countFilledSim(g);
      if (goalState.remaining! > maxPossible) return null;
    }

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

function countFilledSim(g: number[][]): number {
  const n = g.length;
  let filled = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] >= 0) filled++;
  return filled;
}

// Add more functions as needed from the original code