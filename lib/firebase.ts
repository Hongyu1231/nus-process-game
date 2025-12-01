// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyByAY399gYc6kMW4Wbh5rriPGqKKJ2Bfzk",
  authDomain: "nus-process-game.firebaseapp.com",
  projectId: "nus-process-game",
  storageBucket: "nus-process-game.firebasestorage.app",
  messagingSenderId: "470288676406",
  appId: "1:470288676406:web:2c00e1c6fcec14e76cca97",
  measurementId: "G-F3YND9GSLC",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
