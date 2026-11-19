import { database } from "./firebase-config.js";
import { sessionUser, initials } from "./auth-session.js";
import { observeTaskProgress } from "./tareas-progreso.js?v=actual";
import {
  onValue,
  ref
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

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

let progress = new Map();
let directory = {};

function getRewardStats(uid) {
  return progress.get(uid) || { completed: 0, valid: 0, today: 0 };
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
  for (const uid of progress.keys()) {
    if (uid !== sessionUser.uid) members.set(uid, directory[uid]?.nombre || "Integrante");
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

onValue(ref(database, "usuarios"), (snapshot) => {
  directory = snapshot.val() || {};
  if (progress.size) renderOtherMedals();
});
observeTaskProgress((value) => {
  progress = value;
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
