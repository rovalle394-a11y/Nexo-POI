import { database } from "./firebase-config.js";
import { sessionUser, directoryReady, initials } from "./auth-session.js";
import {
  onValue,
  push,
  ref,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const tasksRef = ref(database, "grupos/desarrollo-web/tareas");
const currentUser = document.querySelector("#task-current-user");
const topAvatar = document.querySelector(".top-right .avatar");
const newTaskButton = document.querySelector("#new-task-button");
const cancelTaskButton = document.querySelector("#cancel-task-button");
const taskForm = document.querySelector("#task-form");
const taskTitle = document.querySelector("#task-title");
const taskDate = document.querySelector("#task-date");
const taskAssignee = document.querySelector("#task-assignee");
const saveButton = taskForm.querySelector('button[type="submit"]');
const assignmentHelp = document.querySelector("#assignment-help");
const tasksList = document.querySelector("#tasks-list");
const tasksStatus = document.querySelector("#tasks-status");
const dailyCount = document.querySelector("#daily-count");
const dailyProgress = document.querySelector("#daily-progress");
const filterButtons = document.querySelectorAll("[data-filter]");

let tasks = [];
let activeFilter = "all";
let members = new Map();
let savingTask = false;

const accountName = sessionUser.displayName || "Usuario";
currentUser.replaceChildren(new Option(accountName, accountName));
currentUser.disabled = true;
currentUser.closest("label").hidden = true;
topAvatar.textContent = initials(accountName);

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
    task.completadaPorUid === sessionUser.uid &&
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
  const canComplete = !task.asignadoUid || task.asignadoUid === sessionUser.uid;
  checkbox.disabled = Boolean(task.completada) || !canComplete;
  checkbox.title = canComplete ? "Marcar como terminada" : "Solo la persona asignada puede completar esta tarea";
  checkbox.setAttribute("aria-label", `Completar ${task.titulo}`);
  title.textContent = task.titulo;
  group.className = "task-assignment";
  group.textContent = task.completada
    ? `Terminada por ${task.completadaPor}`
    : task.asignadoUid
      ? `Para ${task.asignadoNombre}${task.asignadoUid === sessionUser.uid ? " (tú)" : ""}`
      : "Compartida (tarea anterior)";
  group.title = `Creada por ${task.creador || "Usuario"}`;
  date.textContent = formatDate(task.fechaLimite);
  status.className = task.completada ? "done" : "pending";
  status.textContent = task.completada ? "Completada" : "Pendiente";
  creator.textContent = initials(task.creador || "Usuario");
  creator.title = task.creador ? `Creada por ${task.creador}` : "Creador";

  checkbox.addEventListener("change", async () => {
    if (!checkbox.checked || task.completada || !canComplete) return;

    checkbox.disabled = true;

    try {
      const completedAt = Date.now();
      const result = await runTransaction(ref(database, `grupos/desarrollo-web/tareas/${task.id}`), (latest) => {
        if (!latest || latest.completada || (latest.asignadoUid && latest.asignadoUid !== sessionUser.uid)) return;
        return {
          ...latest,
          completada: true,
          completadaEn: completedAt,
          completadaPor: accountName,
          completadaPorUid: sessionUser.uid,
          fechaDia: getDayKey(completedAt)
        };
      });
      if (!result.committed) {
        window.alert("La tarea ya fue completada o no está asignada a tu cuenta.");
        renderTasks();
      }
    } catch {
      checkbox.checked = false;
      checkbox.disabled = !canComplete;
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
  const assigneeUid = taskAssignee.value;
  const assigneeName = members.get(assigneeUid);

  if (!title || savingTask) return;
  if (!assigneeName || assigneeUid === sessionUser.uid) {
    window.alert("Selecciona otra persona para asignarle la tarea.");
    return;
  }
  savingTask = true;
  saveButton.disabled = true;

  try {
    await push(tasksRef, {
      titulo: title,
      fechaLimite: taskDate.value || "",
      grupo: "Desarrollo Web",
      creador: currentUser.value,
      creadorUid: sessionUser.uid,
      asignadoUid: assigneeUid,
      asignadoNombre: assigneeName,
      creadaEn: Date.now(),
      completada: false
    });
    taskForm.reset();
    taskForm.hidden = true;
  } catch {
    window.alert("No se pudo crear la tarea. Revisa la conexion.");
  } finally {
    savingTask = false;
    saveButton.disabled = taskAssignee.disabled;
  }
});

directoryReady.then(() => {
  onValue(ref(database, "usuarios"), (snapshot) => {
    const previous = taskAssignee.value;
    members = new Map();
    snapshot.forEach((child) => {
      if (child.key !== sessionUser.uid && child.val()?.nombre) {
        members.set(child.key, child.val().nombre);
      }
    });
    const options = [...members].sort((a, b) => a[1].localeCompare(b[1], "es"));
    taskAssignee.replaceChildren(new Option(options.length ? "Selecciona una persona" : "No hay otra persona disponible", ""), ...options.map(([uid, name]) => new Option(name, uid)));
    if (members.has(previous)) taskAssignee.value = previous;
    taskAssignee.disabled = options.length === 0;
    saveButton.disabled = savingTask || options.length === 0;
    assignmentHelp.textContent = options.length
      ? "Las nuevas tareas se asignan a otra persona del grupo. Solo esa persona puede marcarlas como terminadas."
      : "Para asignar una tarea, otra persona debe iniciar sesión en Nexo. Las tareas siguen perteneciendo al grupo Desarrollo Web.";
  }, () => {
    taskAssignee.disabled = true;
    saveButton.disabled = true;
    assignmentHelp.textContent = "No se pudieron cargar las personas. Revisa la conexión y las reglas de Firebase.";
  });
}).catch(() => {
  assignmentHelp.textContent = "No se pudo cargar tu cuenta. Vuelve a iniciar sesión.";
  saveButton.disabled = true;
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
