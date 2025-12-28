import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, User } from './types';

interface AppState {
  user: User | null;
  gameState: GameState;
  showOverlay: boolean;
  overlayType: 'settings' | 'how' | 'hint' | null;
  overlayTitle: string;
  overlayPrimaryText: string;
  overlayOnPrimary: (() => void) | null;
  overlaySecondaryText: string;
  overlayOnSecondary: (() => void) | null;

  // Actions
  setUser: (user: User | null) => void;
  setGameState: (gameState: Partial<GameState>) => void;
  setShowOverlay: (show: boolean) => void;
  setOverlayType: (type: 'settings' | 'how' | 'hint' | null) => void;
  setOverlayTitle: (title: string) => void;
  setOverlayPrimaryText: (text: string) => void;
  setOverlayOnPrimary: (fn: (() => void) | null) => void;
  setOverlaySecondaryText: (text: string) => void;
  setOverlayOnSecondary: (fn: (() => void) | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      gameState: {
        level: 1,
        score: 0,
        best: 0,
        soundOn: true,
        movesLeft: 0,
        goal: null,
        gridColors: [],
        currentLevelGrid: null,
        currentLevelGoal: null,
        currentLevelMoves: 0,
        size: 6,
        solutionMoves: null,
      },
      showOverlay: false,
      overlayType: null,
      overlayTitle: '',
      overlayPrimaryText: '',
      overlayOnPrimary: null,
      overlaySecondaryText: '',
      overlayOnSecondary: null,

      setUser: (user) => set({ user }),
      setGameState: (updates) => set((state) => ({
        gameState: { ...state.gameState, ...updates }
      })),
      setShowOverlay: (show) => set({ showOverlay: show }),
      setOverlayType: (type) => set({ overlayType: type }),
      setOverlayTitle: (title) => set({ overlayTitle: title }),
      setOverlayPrimaryText: (text) => set({ overlayPrimaryText: text }),
      setOverlayOnPrimary: (fn) => set({ overlayOnPrimary: fn }),
      setOverlaySecondaryText: (text) => set({ overlaySecondaryText: text }),
      setOverlayOnSecondary: (fn) => set({ overlayOnSecondary: fn }),
    }),
    {
      name: 'one-move-left-storage',
      partialize: (state) => ({
        gameState: {
          best: state.gameState.best,
          soundOn: state.gameState.soundOn,
        },
      }),
    }
  )
);