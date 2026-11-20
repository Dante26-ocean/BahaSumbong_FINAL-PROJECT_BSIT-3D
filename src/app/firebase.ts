
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDO4D6JEURnL7z7a45kU06s7VxMox8E7NU",
  authDomain: "bahasumbong.firebaseapp.com",
  projectId: "bahasumbong",
  storageBucket: "bahasumbong.firebasestorage.app",
  messagingSenderId: "98544668591",
  appId: "1:98544668591:web:e6800a673c0abac872e95a",
  measurementId: "G-2R56RL2ETB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase Authentication
export const auth = getAuth(app);

// Cloud Firestore
export const db = getFirestore(app);
