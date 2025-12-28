import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, signInWithPopup, signOut, provider, db, doc, setDoc, serverTimestamp } from './firebase';
import { useAppStore } from './store';
import type { GameState, Goal } from './types';
import { applyShift, resolveChain, goalSatisfied, applyGoalProgress, generateRandomBoard, isSolvable, cloneGrid } from './gameLogic';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, ThemeProvider, createTheme } from '@mui/material';
import { motion } from 'framer-motion';
import Confetti from 'react-confetti';
import { ErrorBoundary } from 'react-error-boundary';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ClipLoader } from 'react-spinners';
import {
  MdDiamond,
  MdStar,
  MdChangeHistory,
  MdRadioButtonUnchecked,
  MdClose,
  MdPlayArrow,
  MdRefresh,
  MdSettings,
  MdHelp,
  MdLightbulb
} from 'react-icons/md';
import './App.css';

const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div style={{ padding: '20px', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
    <h2>🚨 Something went wrong!</h2>
    <p style={{ marginBottom: '20px' }}>{error.message}</p>
    <Button variant="contained" onClick={resetErrorBoundary}>Try again</Button>
  </div>
);

const App: React.FC = () => {
  const [user] = useAuthState(auth);
  const {
    gameState,
    showOverlay,
    overlayType,
    overlayTitle,
    overlayPrimaryText,
    overlayOnPrimary,
    overlaySecondaryText,
    overlayOnSecondary,
    setUser,
    setGameState,
    setShowOverlay,
    setOverlayType,
    setOverlayTitle,
    setOverlayPrimaryText,
    setOverlayOnPrimary,
    setOverlaySecondaryText,
    setOverlayOnSecondary,
  } = useAppStore();

  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);

  const muiTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#00e5ff',
      },
      secondary: {
        main: '#b700ff',
      },
      background: {
        default: '#0a0a0a',
        paper: '#1a1a1a',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h3: {
        fontWeight: 700,
        fontSize: '1.5rem',
      },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
            padding: '8px 16px',
          },
          contained: {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
    },
  });

  useEffect(() => {
    if (user) {
      setUser({
        uid: user.uid,
        email: user.email || undefined,
        displayName: user.displayName || undefined,
      });
    } else {
      setUser(null);
    }
  }, [user, setUser]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.changedTouches && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      setTouchStart({ x: touch.clientX, y: touch.clientY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart || !e.changedTouches || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    const minSwipe = 50;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > minSwipe) {
        attemptMove(deltaX > 0 ? 'right' : 'left');
      }
    } else {
      if (Math.abs(deltaY) > minSwipe) {
        attemptMove(deltaY > 0 ? 'down' : 'up');
      }
    }
    setTouchStart(null);
  };

  const cloneGrid = (grid: number[][]): number[][] => grid.map(row => row.slice());

  // Initialize game
  useEffect(() => {
    const size = 6;
    const fill = 0.8;
    const grid = generateRandomBoard(size, fill);
    const initialState: GameState = {
      level: 1,
      score: 0,
      best: 0,
      soundOn: true,
      movesLeft: 5,
      goal: { type: 'popTotal', target: 20, remaining: 20 },
      gridColors: grid,
      currentLevelGrid: cloneGrid(grid),
      currentLevelGoal: { type: 'popTotal', target: 20, remaining: 20 },
      currentLevelMoves: 5,
      size,
    };
    setGameState(initialState);
  }, [setGameState]);


  const saveGameState = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'progress', user.uid);
      await setDoc(docRef, {
        level: gameState.level,
        score: gameState.score,
        best: gameState.best,
        soundOn: gameState.soundOn,
        lastSaved: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const generateLevel = (level: number) => {
    const size = Math.min(6 + Math.floor(level / 5), 8);
    const fill = Math.min(0.8 + level * 0.005, 0.92);
    const grid = generateRandomBoard(size, fill);
    const moves = Math.min(4 + Math.floor(level / 3), 7);
    const goal: Goal = { type: 'popTotal', target: 15 + level * 2, remaining: 15 + level * 2 };

    // Check if solvable
    const solution = isSolvable(grid, goal, moves);

    setGameState({
      level,
      movesLeft: moves,
      goal,
      gridColors: grid,
      currentLevelGrid: cloneGrid(grid),
      currentLevelGoal: goal,
      currentLevelMoves: moves,
      size,
      solutionMoves: solution,
    });
  };

  const hideOverlay = () => {
    setShowOverlay(false);
    setOverlayType(null);
  };

  const showSettingsOverlay = () => {
    setOverlayType('settings');
    setOverlayTitle('Settings');
    setOverlayPrimaryText('');
    setOverlayOnPrimary(null);
    setOverlaySecondaryText('Close');
    setOverlayOnSecondary(hideOverlay);
    setShowOverlay(true);
  };

  const showHowOverlay = () => {
    setOverlayType('how');
    setOverlayTitle('How to Play');
    setOverlayPrimaryText('Close');
    setOverlayOnPrimary(hideOverlay);
    setOverlaySecondaryText('');
    setOverlayOnSecondary(null);
    setShowOverlay(true);
  };

  const showHintOverlay = () => {
    setOverlayType('hint');
    setOverlayTitle('Hint');
    setOverlayPrimaryText('Close');
    setOverlayOnPrimary(hideOverlay);
    setOverlaySecondaryText('');
    setOverlayOnSecondary(null);
    setShowOverlay(true);
  };

  const signIn = async () => {
    setSignInLoading(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      console.error('Sign-in error:', error);
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code === 'auth/popup-blocked') {
        alert('Please allow popups for this site to sign in with Google.');
      } else if (firebaseError.code === 'auth/popup-closed-by-user') {
        // User closed popup, do nothing
      } else {
        alert('Sign-in failed. Please try again.');
      }
    } finally {
      setSignInLoading(false);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  const attemptMove = (dir: 'left' | 'right' | 'up' | 'down') => {
    if (animating || gameState.movesLeft <= 0) return;

    const grid = cloneGrid(gameState.gridColors);
    const moved = applyShift(grid, dir, gameState.size);
    if (!moved) {
      toast.error('No movement that way.');
      return;
    }

    setAnimating(true);
    const res = resolveChain(grid, dir, gameState.size);
    applyGoalProgress(gameState.goal, res.totalPopped, res.totalByColor);

    setGameState({
      gridColors: grid,
      movesLeft: gameState.movesLeft - 1,
      score: gameState.score + res.totalPopped * 10,
      best: Math.max(gameState.best, gameState.score + res.totalPopped * 10),
    });

    setTimeout(() => {
      setAnimating(false);
      if (goalSatisfied(gameState.goal, grid, gameState.size)) {
        // Win
        toast.success('🎉 Mission cleared!');
        setShowConfetti(true);
        setTimeout(() => {
          setShowConfetti(false);
          const newLevel = gameState.level + 1;
          setGameState({ level: newLevel });
          generateLevel(newLevel);
          saveGameState();
        }, 2000);
      } else if (gameState.movesLeft - 1 <= 0) {
        // Lose
        toast.error('💔 Out of moves.');
      }
    }, 500);
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider theme={muiTheme}>
        <div className="app">
          {showConfetti && <Confetti recycle={false} numberOfPieces={200} />}
          <ToastContainer
            position="top-center"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
          />
      <header>
        <motion.div
          className="brand"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="title">ONE MOVE LEFT</div>
          <div className="sub">Limited moves. Clear the mission.</div>
        </motion.div>
        <div className="stats">
          <motion.div
            className="pill"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="label">SCORE</div>
            <div className="value" id="score">{gameState.score}</div>
          </motion.div>
          <motion.div
            className="pill"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="label">BEST</div>
            <div className="value" id="best">{gameState.best}</div>
          </motion.div>
        </div>
      </header>

      <div className="toolbar">
          <Button variant="contained" startIcon={<MdPlayArrow />} onClick={() => generateLevel(gameState.level || 1)}>Start / Next</Button>
          <Button startIcon={<MdRefresh />} onClick={() => generateLevel(gameState.level || 1)}>Retry</Button>
        <Button startIcon={<MdSettings />} onClick={showSettingsOverlay}>Settings</Button>
        <Button startIcon={<MdHelp />} onClick={showHowOverlay}>How</Button>
        <Button startIcon={<MdLightbulb />} onClick={showHintOverlay}>Hint</Button>
      </div>

      <div className="layout">
        <aside className="missionCard">
          <div className="missionCard">
            <div className="mTop">
              <div className="mTitle">Mission</div>
              <div className="mLevel">Level {gameState.level || 1}</div>
            </div>
            <div className="mRow">
              <div className="mLabel">Moves left</div>
              <div className="mValue neon">{gameState.movesLeft || 0}</div>
            </div>
            <div className="mRow">
              <div className="mLabel">Goal</div>
              <div className="mValue">{gameState.goal?.type === 'popTotal' ? `Pop ${gameState.goal.target || 0} tiles` : 'Goal'}</div>
            </div>
            <div className="mRow">
              <div className="mLabel">Remaining</div>
              <div className="mValue neon">{gameState.goal?.remaining || 0}</div>
            </div>
          </div>
        </aside>

        <main className="boardWrap">
          <div
            className="board"
            style={{ '--size': gameState.size } as React.CSSProperties}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="grid">
              {Array.from({ length: (gameState.size || 6) * (gameState.size || 6) }, (_, i) => (
                <div key={i} className="cell"></div>
              ))}
            </div>
            {gameState.gridColors?.flatMap((row, r) =>
              Array.isArray(row) ? row.map((color, c) => {
                if (color < 0) return null;
                const iconComponents = [MdDiamond, MdStar, MdChangeHistory, MdRadioButtonUnchecked, MdClose];
                const IconComponent = iconComponents[color] || MdDiamond;
                return (
                  <div
                    key={`${r}-${c}`}
                    className="orb"
                    data-c={color}
                    style={{
                      left: `${(c / (gameState.size || 6)) * 100}%`,
                      top: `${(r / (gameState.size || 6)) * 100}%`,
                      width: `calc(${100 / (gameState.size || 6)}% - var(--gap))`,
                      height: `calc(${100 / (gameState.size || 6)}% - var(--gap))`,
                    }}
                  >
                    <IconComponent className="sym" />
                  </div>
                );
              }) : []
            )}
          </div>
        </main>
      </div>

      <footer>
        <div className="hint">Tip: One swipe can trigger multiple pops. Look for chain setups.</div>
      </footer>

      <Dialog open={showOverlay} onClose={hideOverlay} maxWidth="sm" fullWidth>
        <DialogTitle>{overlayTitle}</DialogTitle>
        <DialogContent>
          {overlayType === 'settings' && (
            <div>
              <p>Sign in to save your progress:</p>
              <Button
                variant="outlined"
                onClick={signIn}
                disabled={signInLoading}
                fullWidth
                startIcon={
                  signInLoading ? (
                    <ClipLoader size={20} color="#667eea" />
                  ) : (
                    <img
                      src="https://developers.google.com/identity/images/g-logo.png"
                      alt="Google"
                      style={{ width: 20, height: 20 }}
                    />
                  )
                }
                sx={{
                  borderColor: '#dadce0',
                  color: '#3c4043',
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  padding: '12px 24px',
                  borderRadius: '8px',
                  '&:hover': {
                    backgroundColor: '#f8f9fa',
                    borderColor: '#dadce0',
                  },
                  '&.Mui-disabled': {
                    color: '#3c4043',
                    opacity: 0.6,
                  },
                }}
              >
                {signInLoading ? 'Signing in...' : 'Sign in with Google'}
              </Button>
              {user && (
                <div style={{ marginTop: '20px', borderTop: '1px solid rgba(0,0,0,0.12)', paddingTop: '10px' }}>
                  <p><strong>Signed in as:</strong> {user.displayName || user.email}</p>
                  <p style={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    Your progress and score are automatically saved to the cloud and will sync across devices.
                  </p>
                  <Button onClick={signOutUser} style={{ marginTop: '8px' }}>Sign Out</Button>
                </div>
              )}
            </div>
          )}
          {overlayType === 'how' && (
            <div>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                <li>Each level has a <strong>move limit</strong>.</li>
                <li>Swipe to slide orbs.</li>
                <li>Groups of <strong>3+</strong> connected same-color orbs pop.</li>
                <li>Pops can chain automatically.</li>
                <li>Levels are <strong>generated solvable</strong>.</li>
              </ul>
              {user && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.12)', paddingTop: '10px', marginTop: '10px' }}>
                  <strong>Signed in as:</strong> {user.displayName || user.email}<br />
                  <p style={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    Your progress and score are automatically saved to the cloud and will sync across devices.
                  </p>
                  <Button onClick={signOutUser} style={{ marginTop: '8px' }}>Sign Out</Button>
                </div>
              )}
            </div>
          )}
          {overlayType === 'hint' && (
            <div>
              <p><strong>Goal:</strong> {gameState.goal?.type === 'popTotal' ? `Pop ${gameState.goal.target || 0} tiles` : 'Goal'}</p>
              <p><strong>Remaining:</strong> {gameState.goal?.remaining || 0}</p>
              <p><strong>Moves left:</strong> {gameState.movesLeft || 0}</p>
              <p>Keep trying!</p>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          {overlaySecondaryText && (
            <Button onClick={overlayOnSecondary || undefined}>
              {overlaySecondaryText}
            </Button>
          )}
          {overlayPrimaryText && (
            <Button variant="contained" onClick={overlayOnPrimary || undefined}>
              {overlayPrimaryText}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      </div>
    </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
