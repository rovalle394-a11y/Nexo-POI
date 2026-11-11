import { database } from "./firebase-config.js";
import {
  onValue,
  ref
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const users = {
  "Ana Torres": { initials: "AT", username: "@anatorres" },
  "Mariana Lopez": { initials: "ML", username: "@marianalopez" },
  "Diego Martinez": { initials: "DM", username: "@diegomartinez" }
};

const tasksRef = ref(database, "grupos/desarrollo-web/tareas");
const userSelect = document.querySelector("#profile-user-select");
const topAvatar = document.querySelector(".top-right .avatar");
const profileAvatar = document.querySelector("#profile-avatar");
const profileName = document.querySelector("#profile-name");
const profileUsername = document.querySelector("#profile-username");
const completedTotal = document.querySelector("#completed-total");
const validTotal = document.querySelector("#valid-total");
const validToday = document.querySelector("#valid-today");
const earnedMedalsCount = document.querySelector("#earned-medals-count");
const nextMedalName = document.querySelector("#next-medal-name");
const nextMedalCount = document.querySelector("#next-medal-count");
const medalProgress = document.querySelector("#medal-progress");

const medals = [
  { threshold: 5, card: "bronze-card", status: "bronze-status" },
  { threshold: 15, card: "silver-card", status: "silver-status" },
  { threshold: 30, card: "gold-card", status: "gold-status" }
];

let tasks = [];

userSelect.value = localStorage.getItem("nexo-profile-user") || "Ana Torres";

function getTodayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRewardStats(userName) {
  const completed = tasks.filter((task) => task.completadaPor === userName);
  const completedByDay = {};

  completed.forEach((task) => {
    if (!task.fechaDia) return;
    completedByDay[task.fechaDia] = (completedByDay[task.fechaDia] || 0) + 1;
  });

  const valid = Object.values(completedByDay)
    .reduce((total, count) => total + Math.min(5, count), 0);

  return {
    completed: completed.length,
    valid,
    today: Math.min(5, completedByDay[getTodayKey()] || 0)
  };
}

function updateMedalCard(medal, validTasks) {
  const card = document.querySelector(`#${medal.card}`);
  const status = document.querySelector(`#${medal.status}`);
  const earned = validTasks >= medal.threshold;

  card.classList.toggle("locked", !earned);
  status.className = earned ? "earned" : "pending-medal";
  status.textContent = earned
    ? "Ganada"
    : `${medal.threshold - validTasks} tareas restantes`;
}

function renderProfile() {
  const selectedUser = userSelect.value;
  const user = users[selectedUser];
  const stats = getRewardStats(selectedUser);
  const earnedCount = medals.filter((medal) => stats.valid >= medal.threshold).length;
  const nextMedal = medals.find((medal) => stats.valid < medal.threshold);

  topAvatar.textContent = user.initials;
  profileAvatar.textContent = user.initials;
  profileName.textContent = selectedUser;
  profileUsername.textContent = user.username;
  completedTotal.textContent = stats.completed;
  validTotal.textContent = stats.valid;
  validToday.textContent = `${stats.today} de 5`;
  earnedMedalsCount.textContent = `${earnedCount} ${earnedCount === 1 ? "medalla ganada" : "medallas ganadas"}`;

  medals.forEach((medal) => updateMedalCard(medal, stats.valid));

  if (nextMedal) {
    const names = { 5: "Bronce", 15: "Plata", 30: "Oro" };
    const previousThreshold = nextMedal.threshold === 5 ? 0 : nextMedal.threshold === 15 ? 5 : 15;
    const currentRange = Math.max(0, stats.valid - previousThreshold);
    const rangeSize = nextMedal.threshold - previousThreshold;

    nextMedalName.textContent = `Proxima medalla: ${names[nextMedal.threshold]}`;
    nextMedalCount.textContent = `${stats.valid} de ${nextMedal.threshold} tareas`;
    medalProgress.style.width = `${Math.min(100, (currentRange / rangeSize) * 100)}%`;
  } else {
    nextMedalName.textContent = "Todas las medallas obtenidas";
    nextMedalCount.textContent = `${stats.valid} tareas validas`;
    medalProgress.style.width = "100%";
  }
}

userSelect.addEventListener("change", () => {
  localStorage.setItem("nexo-profile-user", userSelect.value);
  renderProfile();
});

onValue(tasksRef, (snapshot) => {
  tasks = [];

  snapshot.forEach((child) => {
    tasks.push({ id: child.key, ...child.val() });
  });

  renderProfile();
}, () => {
  completedTotal.textContent = "-";
  validTotal.textContent = "-";
  validToday.textContent = "-";
});
