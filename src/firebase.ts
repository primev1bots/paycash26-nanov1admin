// src/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as dbRef,
  onValue as dbOnValue,
  get as dbGet,
  set as dbSet,
} from "firebase/database";
import { getStorage } from "firebase/storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDxCJzoya9ncucqJFAcIe8ocIXAIsMl6BE",
  authDomain: "paycash26-nanov1.firebaseapp.com",
  databaseURL: "https://paycash26-nanov1-default-rtdb.firebaseio.com",
  projectId: "paycash26-nanov1",
  storageBucket: "paycash26-nanov1.firebasestorage.app",
  messagingSenderId: "307223058212",
  appId: "1:307223058212:web:525ee735f268c6584b85b1",
  measurementId: "G-Y3FSY4QXKK"
};
// Initialize Firebase (ensure it's only initialized once)
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database & Storage
const database = getDatabase(app);
const storage = getStorage(app);

// Export everything you need
export {
  app,
  database,
  storage,
  dbRef as ref,
  dbOnValue as onValue,
  dbGet as get,
  dbSet as set,
};

export default app;
