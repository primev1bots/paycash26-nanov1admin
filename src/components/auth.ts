// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
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



const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export default app;
