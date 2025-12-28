import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAnalytics, type Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDCnS3kCen2frvfnmi2v4yBwJXmb2853s0",
  authDomain: "one-move-left.firebaseapp.com",
  projectId: "one-move-left",
  storageBucket: "one-move-left.firebasestorage.app",
  messagingSenderId: "14531706738",
  appId: "1:14531706738:web:7a2ea894d0ecd9c63d67eb",
  measurementId: "G-52NBE5ELJJ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  analytics = getAnalytics(app);
}
export { analytics };

export { signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp };