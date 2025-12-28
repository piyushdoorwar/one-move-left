export interface User {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

export interface GameState {
  level: number;
  score: number;
  best: number;
  soundOn: boolean;
  movesLeft: number;
  goal: Goal | null;
  gridColors: number[][];
  currentLevelGrid: number[][] | null;
  currentLevelGoal: Goal | null;
  currentLevelMoves: number;
  size: number;
  solutionMoves: string[] | null;
}

export interface Goal {
  type: 'popTotal' | 'clearColor' | 'clearMulti' | 'densityBelow';
  target?: number;
  remaining: number;
  color?: number;
  items?: { color: number; target: number; remaining: number }[];
  threshold?: number;
}

export interface Cluster {
  color: number;
  cells: [number, number][];
}

export const SYMBOLS = ["◆", "✦", "▲", "●", "✖"];
export const COLOR_NAMES = ["Cyan", "Purple", "Green", "Yellow", "Red"];
export const MIN_CLUSTER = 3;
export const COLORS = 5;