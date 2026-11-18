import { database } from "./firebase-config.js";
import { sessionUser, initials } from "./auth-session.js";
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
const otherMedals = document.querySelector("#other-medals");
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

function getTodayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRewardStats(userName) {
  const completed = tasks.filter((task) => task.completada && task.completadaPorUid === userName);
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
  const selectedName = sessionUser.displayName || "Usuario";
  const user = { initials: initials(selectedName), username: "Mi perfil" };
  const stats = getRewardStats(sessionUser.uid);
  const earnedCount = medals.filter((medal) => stats.valid >= medal.threshold).length;
  const nextMedal = medals.find((medal) => stats.valid < medal.threshold);

  topAvatar.textContent = user.initials;
  profileAvatar.textContent = user.initials;
  profileName.textContent = selectedName;
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

function renderOtherMedals() {
  const members = new Map();
  for (const task of tasks) {
    if (task.completada && task.completadaPorUid && task.completadaPorUid !== sessionUser.uid) {
      members.set(task.completadaPorUid, task.completadaPor || "Integrante");
    }
  }
  otherMedals.replaceChildren();
  const names = ["Bronce", "Plata", "Oro"];
  for (const [uid, name] of [...members].sort((a, b) => a[1].localeCompare(b[1], "es"))) {
    const { valid } = getRewardStats(uid);
    const earned = names.filter((_, index) => valid >= medals[index].threshold);
    if (!earned.length) continue;
    const item = document.createElement("li");
    const holder = document.createElement("strong");
    holder.textContent = name;
    item.append(holder, ` · ${earned.join(", ")}`);
    otherMedals.append(item);
  }
  if (!otherMedals.children.length) {
    const empty = document.createElement("li");
    empty.textContent = "Todavía no hay medallas de otros usuarios.";
    otherMedals.append(empty);
  }
}

onValue(tasksRef, (snapshot) => {
  tasks = [];

  snapshot.forEach((child) => {
    tasks.push({ id: child.key, ...child.val() });
  });

  renderProfile();
  renderOtherMedals();
}, () => {
  completedTotal.textContent = "-";
  validTotal.textContent = "-";
  validToday.textContent = "-";
  const error = document.createElement("li");
  error.textContent = "No se pudieron cargar las medallas.";
  otherMedals.replaceChildren(error);
});
