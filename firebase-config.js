import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBRfLjTJuRYXC10KqQXHO0C8gl8J2JW49A",
  authDomain: "nexo-13d0c.firebaseapp.com",
  databaseURL: "https://nexo-13d0c-default-rtdb.firebaseio.com",
  projectId: "nexo-13d0c",
  storageBucket: "nexo-13d0c.firebasestorage.app",
  messagingSenderId: "43616799149",
  appId: "1:43616799149:web:bdaa5e5f515683cbbeb924"
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);
