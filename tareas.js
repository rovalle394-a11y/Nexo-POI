import { database } from "./firebase-config.js";
import {
  onValue,
  push,
  ref,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const users = {
  "Ana Torres": "AT",
  "Mariana Lopez": "ML",
  "Diego Martinez": "DM"
};

const tasksRef = ref(database, "grupos/desarrollo-web/tareas");
const currentUser = document.querySelector("#task-current-user");
const topAvatar = document.querySelector(".top-right .avatar");
const newTaskButton = document.querySelector("#new-task-button");
const cancelTaskButton = document.querySelector("#cancel-task-button");
const taskForm = document.querySelector("#task-form");
const taskTitle = document.querySelector("#task-title");
const taskDate = document.querySelector("#task-date");
const tasksList = document.querySelector("#tasks-list");
const tasksStatus = document.querySelector("#tasks-status");
const dailyCount = document.querySelector("#daily-count");
const dailyProgress = document.querySelector("#daily-progress");
const filterButtons = document.querySelectorAll("[data-filter]");

let tasks = [];
let activeFilter = "all";

currentUser.value = localStorage.getItem("nexo-group-current-user") || "Ana Torres";
topAvatar.textContent = users[currentUser.value];

function getDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function updateDailyProgress() {
  const today = getDayKey();
  const completedToday = tasks.filter((task) => (
    task.completadaPor === currentUser.value &&
    task.fechaDia === today
  )).length;
  const validToday = Math.min(5, completedToday);

  dailyCount.textContent = `${validToday} de 5 tareas validas hoy`;
  dailyProgress.style.width = `${validToday * 20}%`;
}

function createTaskRow(task) {
  const row = document.createElement("div");
  const checkbox = document.createElement("input");
  const title = document.createElement("b");
  const group = document.createElement("span");
  const date = document.createElement("time");
  const status = document.createElement("em");
  const creator = document.createElement("strong");

  row.className = "task-row";
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(task.completada);
  checkbox.disabled = Boolean(task.completada);
  checkbox.setAttribute("aria-label", `Completar ${task.titulo}`);
  title.textContent = task.titulo;
  group.textContent = task.completada
    ? `Por ${task.completadaPor}`
    : "Desarrollo Web";
  date.textContent = formatDate(task.fechaLimite);
  status.className = task.completada ? "done" : "pending";
  status.textContent = task.completada ? "Completada" : "Pendiente";
  creator.textContent = task.creador ? users[task.creador] || "US" : "US";
  creator.title = task.creador ? `Creada por ${task.creador}` : "Creador";

  checkbox.addEventListener("change", async () => {
    if (!checkbox.checked || task.completada) return;

    checkbox.disabled = true;

    try {
      await update(ref(database, `grupos/desarrollo-web/tareas/${task.id}`), {
        completada: true,
        completadaEn: Date.now(),
        completadaPor: currentUser.value,
        fechaDia: getDayKey()
      });
    } catch {
      checkbox.checked = false;
      checkbox.disabled = false;
      window.alert("No se pudo completar la tarea. Revisa la conexion.");
    }
  });

  row.append(checkbox, title, group, date, status, creator);
  return row;
}

function renderTasks() {
  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === "pending") return !task.completada;
    if (activeFilter === "completed") return task.completada;
    return true;
  });

  tasksList.replaceChildren();

  if (!filteredTasks.length) {
    const empty = document.createElement("p");
    empty.className = "tasks-status";
    empty.textContent = activeFilter === "all"
      ? "Aun no hay tareas en este grupo."
      : "No hay tareas en esta categoria.";
    tasksList.append(empty);
  } else {
    filteredTasks.forEach((task) => tasksList.append(createTaskRow(task)));
  }

  updateDailyProgress();
}

currentUser.addEventListener("change", () => {
  localStorage.setItem("nexo-group-current-user", currentUser.value);
  topAvatar.textContent = users[currentUser.value];
  renderTasks();
});

newTaskButton.addEventListener("click", () => {
  taskForm.hidden = false;
  taskTitle.focus();
});

cancelTaskButton.addEventListener("click", () => {
  taskForm.reset();
  taskForm.hidden = true;
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskTitle.value.trim();

  if (!title) return;

  try {
    await push(tasksRef, {
      titulo: title,
      fechaLimite: taskDate.value || "",
      grupo: "Desarrollo Web",
      creador: currentUser.value,
      creadaEn: Date.now(),
      completada: false
    });
    taskForm.reset();
    taskForm.hidden = true;
  } catch {
    window.alert("No se pudo crear la tarea. Revisa la conexion.");
  }
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderTasks();
  });
});

onValue(tasksRef, (snapshot) => {
  tasks = [];

  snapshot.forEach((child) => {
    tasks.push({ id: child.key, ...child.val() });
  });

  tasks.sort((a, b) => (b.creadaEn || 0) - (a.creadaEn || 0));
  renderTasks();
}, () => {
  tasksStatus.textContent = "No se pudieron cargar las tareas.";
});
