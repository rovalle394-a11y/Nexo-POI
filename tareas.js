import { database } from "./firebase-config.js";
import { sessionUser, directoryReady, initials } from "./auth-session.js";
import { observeTaskProgress } from "./tareas-progreso.js?v=actual";
import {
  get,
  onValue,
  push,
  ref,
  serverTimestamp,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const groupSelect = document.querySelector("#task-group");
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
const dailyCount = document.querySelector("#daily-count");
const dailyProgress = document.querySelector("#daily-progress");
const filterButtons = document.querySelectorAll("[data-filter]");

let tasks = [];
let activeFilter = "all";
let members = new Map();
let savingTask = false;
let groups = new Map();
let directory = {};
let groupId = "";
let unsubscribeTasks;
let groupRequest = 0;
let boardMessage = "Cargando grupos…";

const accountName = sessionUser.displayName || "Usuario";
topAvatar.textContent = initials(accountName);

function formatDate(value) {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

observeTaskProgress((progress) => {
  const validToday = progress.get(sessionUser.uid)?.today || 0;
  dailyCount.textContent = `${validToday} de 5 tareas válidas hoy`;
  dailyProgress.style.width = `${validToday * 20}%`;
}, () => { dailyCount.textContent = "Progreso no disponible"; });

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
  const taskGroup = groupId;
  const canComplete = task.creadorUid === sessionUser.uid;
  checkbox.disabled = Boolean(task.completada) || !canComplete;
  checkbox.title = canComplete ? "Marcar como terminada" : "Solo quien creó la tarea puede marcarla como terminada";
  checkbox.setAttribute("aria-label", `Marcar como terminada: ${task.titulo}`);
  title.textContent = task.titulo;
  group.className = "task-assignment";
  group.textContent = task.completada
    ? `Terminada por ${task.completadaPor}`
    : task.asignadoUid
      ? `Para ${task.asignadoNombre}${task.asignadoUid === sessionUser.uid ? " (tú)" : ""}`
      : "Sin asignar";
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
      const completedAt = serverTimestamp();
      const path = `tareasPorGrupo/${taskGroup}/${task.id}`;
      await update(ref(database), {
        [`${path}/completada`]: true,
        [`${path}/completadaEn`]: completedAt,
        [`${path}/completadaPor`]: task.asignadoNombre,
        [`avanceTareas/${task.asignadoUid}/${taskGroup}/${task.id}`]: completedAt
      });
    } catch {
      checkbox.checked = false;
      checkbox.disabled = !canComplete;
      window.alert("No se pudo completar la tarea. Puede que ya esté terminada o no tengas permiso.");
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
    empty.textContent = boardMessage || (activeFilter === "all"
      ? "Aun no hay tareas en este grupo."
      : "No hay tareas en esta categoría.");
    tasksList.append(empty);
  } else {
    filteredTasks.forEach((task) => tasksList.append(createTaskRow(task)));
  }

}

newTaskButton.addEventListener("click", () => {
  if (!groups.has(groupId)) return;
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
  const group = groups.get(groupId);
  const target = groupId;

  if (!title || !group || savingTask) return;
  if (!assigneeName || assigneeUid === sessionUser.uid) {
    window.alert("Selecciona otra persona para asignarle la tarea.");
    return;
  }
  savingTask = true;
  saveButton.disabled = true;

  try {
    await push(ref(database, `tareasPorGrupo/${target}`), {
      titulo: title,
      fechaLimite: taskDate.value || "",
      creador: directory[sessionUser.uid]?.nombre || accountName,
      creadorUid: sessionUser.uid,
      asignadoUid: assigneeUid,
      asignadoNombre: assigneeName,
      creadaEn: Date.now(),
      completada: false
    });
    if (groupId === target) {
      taskForm.reset();
      taskForm.hidden = true;
    }
  } catch {
    window.alert("No se pudo crear la tarea. Revisa la conexion.");
  } finally {
    savingTask = false;
    saveButton.disabled = taskAssignee.disabled;
  }
});

function updateAssignees() {
  const previous = taskAssignee.value;
  const group = groups.get(groupId);
  members = new Map(Object.entries(group?.miembros || {})
    .filter(([uid, member]) => uid !== sessionUser.uid && member === true && directory[uid]?.nombre)
    .map(([uid]) => [uid, directory[uid].nombre]));
  const options = [...members].sort((a, b) => a[1].localeCompare(b[1], "es"));
  taskAssignee.replaceChildren(new Option("Selecciona una persona", ""),
    ...options.map(([uid, name]) => new Option(name, uid)));
  if (members.has(previous)) taskAssignee.value = previous;
  newTaskButton.disabled = taskAssignee.disabled = !options.length;
  saveButton.disabled = savingTask || !options.length;
  assignmentHelp.textContent = group
    ? "Quien creó la tarea puede marcarla como terminada. El avance cuenta para la persona asignada."
    : "Crea un grupo desde Chats para asignar tareas a sus integrantes.";
}

function listTasks(snapshot) {
  return Object.entries(snapshot.val() || {}).map(([id, task]) => ({ ...task, id }))
    .sort((a, b) => (b.creadaEn || 0) - (a.creadaEn || 0));
}

function openBoard(id, message) {
  unsubscribeTasks?.();
  groupId = id;
  taskForm.reset();
  taskForm.hidden = true;
  tasks = [];
  boardMessage = message || (groups.has(id) ? "Cargando tareas…" : "");
  updateAssignees();
  renderTasks();
  if (!groups.has(id)) return;
  unsubscribeTasks = onValue(ref(database, `tareasPorGrupo/${id}`), (snapshot) => {
    if (groupId !== id) return;
    tasks = listTasks(snapshot);
    boardMessage = "";
    renderTasks();
  }, () => {
    if (groupId !== id) return;
    tasks = [];
    boardMessage = "No se pudieron cargar las tareas de este grupo.";
    renderTasks();
  });
}

function refreshGroupOptions() {
  const options = [new Option(groups.size ? "Selecciona un grupo" : "No tienes grupos", "")];
  for (const [id, group] of groups) options.push(new Option(group.nombre, id));
  groupSelect.replaceChildren(...options);
  groupSelect.disabled = options.length === 1;
  const next = options.some((option) => option.value === groupId && groupId) ? groupId
    : groups.keys().next().value || "";
  groupSelect.value = next;
  if (groupId !== next || !next) openBoard(next, next ? "" : "Todavía no tienes grupos.");
  else updateAssignees();
}

groupSelect.addEventListener("change", () => openBoard(groupSelect.value, groupSelect.value ? "" : "Selecciona un grupo."));

directoryReady.then(() => {
  onValue(ref(database, "usuarios"), (snapshot) => {
    directory = snapshot.val() || {};
    updateAssignees();
  });
  onValue(ref(database, `gruposPorUsuario/${sessionUser.uid}`), async (snapshot) => {
    const request = ++groupRequest;
    try {
      const entries = await Promise.all(Object.keys(snapshot.val() || {}).map(async (id) => {
        const group = (await get(ref(database, `chatsGrupales/${id}`))).val();
        return [id, group];
      }));
      if (request !== groupRequest) return;
      groups = new Map(entries.filter(([, group]) => group?.miembros?.[sessionUser.uid] === true)
        .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es")));
      refreshGroupOptions();
    } catch {
      if (request === groupRequest) openBoard("", "No se pudieron cargar tus grupos.");
    }
  }, () => openBoard("", "No se pudieron cargar tus grupos."));
}).catch(() => openBoard("", "No se pudo cargar tu cuenta. Vuelve a iniciar sesión."));

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderTasks();
  });
});

