import { database } from "./firebase-config.js";
import { sessionUser, directoryReady, initials } from "./auth-session.js";
import { appendChatFile, uploadChatFile } from "./chat-files.js";
import { createTextPayload, readMessageText } from "./chat-crypto.js";
import {
  limitToLast,
  get,
  onValue,
  push,
  query,
  ref,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const messages = document.querySelector("#group-messages");
const status = document.querySelector("#group-status");
const form = document.querySelector("#group-message-form");
const input = document.querySelector("#group-message-input");
const attachButton = document.querySelector("#group-attach-button");
const fileInput = document.querySelector("#group-file-input");
const encryptionInput = document.querySelector("#group-encryption");
const legacyRef = ref(database, "chats/chat-grupal/desarrollo-web/mensajes");
let messagesRef = legacyRef;
let activeName = "Desarrollo Web";
let unsubscribe = () => {};
let renderEpoch = 0;

const accountName = sessionUser.displayName || "Usuario";
encryptionInput.checked = localStorage.getItem("nexo-encryption-enabled") === "true";

encryptionInput.addEventListener("change", () => {
  localStorage.setItem("nexo-encryption-enabled", String(encryptionInput.checked));
});

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function updateMessageSides() {
  document.querySelectorAll(".msg[data-sender]").forEach((message) => {
    message.classList.toggle("me", message.dataset.sender === sessionUser.uid);
  });
}

async function showMessage(message, epoch) {
  if (!message || typeof message.texto !== "string" || typeof message.usuario !== "string") {
    return;
  }

  const container = document.createElement("div");
  const avatar = document.createElement("div");
  const bubble = document.createElement("div");
  const sender = document.createElement("b");
  const lineBreak = document.createElement("br");
  const text = document.createElement("span");
  const time = document.createElement("small");
  const encryptionLabel = document.createElement("span");

  container.className = "msg";
  container.dataset.sender = message.usuarioUid || "";
  avatar.className = "av";
  avatar.textContent = initials(message.usuario);
  bubble.className = "bubble";
  sender.textContent = message.usuarioUid ? message.usuario : `${message.usuario} · historial anterior`;
  sender.style.fontSize = "11px";
  text.textContent = await readMessageText(message);
  if (epoch !== renderEpoch) return;
  time.textContent = formatTime(message.fecha);
  encryptionLabel.className = "encrypted-label";
  encryptionLabel.textContent = "Mensaje cifrado";

  bubble.append(sender, lineBreak, text);
  appendChatFile(bubble, message);
  if (message.cifrado) {
    bubble.append(encryptionLabel);
  }
  bubble.append(time);
  container.append(avatar, bubble);
  messages.append(container);
  updateMessageSides();
  messages.scrollTop = messages.scrollHeight;
}

function openGroup(button, id, group) {
  unsubscribe();
  ++renderEpoch;
  messages.replaceChildren(status);
  status.textContent = "Cargando mensajes...";
  messagesRef = id ? ref(database, `mensajesGrupales/${id}`) : legacyRef;
  activeName = group?.nombre || "Desarrollo Web";
  document.querySelector("#active-group-name").textContent = activeName;
  document.querySelector("#active-group-avatar").textContent = initials(activeName);
  document.querySelector("#active-group-members").textContent = group
    ? memberNames(group).join(", ")
    : "Chat grupal compartido";
  document.querySelectorAll(".group-entry").forEach((entry) => {
    entry.classList.toggle("active", entry === button);
    if (entry === button) entry.setAttribute("aria-current", "true");
    else entry.removeAttribute("aria-current");
  });
  unsubscribe = onValue(query(messagesRef, limitToLast(100)), async (snapshot) => {
    const epoch = ++renderEpoch;
    messages.replaceChildren();
    const records = [];
    snapshot.forEach((child) => { records.push(child.val()); });
    if (!records.length) {
      status.textContent = "Aún no hay mensajes. Escribe el primero.";
      messages.append(status);
    }
    for (const record of records) {
      try { await showMessage(record, epoch); } catch (error) { console.warn(error); }
      if (epoch !== renderEpoch) break;
    }
  }, () => {
    ++renderEpoch;
    status.textContent = "No se pudo abrir el chat. Revisa las reglas de Firebase.";
    messages.replaceChildren(status);
  });
}

const legacyButton = document.querySelector("#legacy-group");
let directory = {};
let selectedGroup = null;
const memberNames = (group) => Object.keys(group.miembros).map((uid) => directory[uid]?.nombre || "Integrante");
legacyButton.addEventListener("click", () => {
  selectedGroup = null;
  openGroup(legacyButton);
});
openGroup(legacyButton);

const createForm = document.querySelector("#create-group");
const people = document.querySelector("#group-people");
const feedback = document.querySelector("#create-group-status");
const createButton = createForm.querySelector("button");
const groupsList = document.querySelector("#my-groups");
let saving = false;

function reportGroupError() {
  feedback.textContent = "No se pudieron cargar los grupos o las cuentas. Revisa las reglas de Firebase.";
  createForm.closest("details").open = true;
}

directoryReady.then(() => {
  onValue(ref(database, "usuarios"), (snapshot) => {
    const checked = new Set(new FormData(createForm).getAll("integrante"));
    directory = snapshot.val() || {};
    people.replaceChildren();
    for (const [uid, person] of Object.entries(directory)) {
      if (uid === sessionUser.uid) continue;
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "integrante";
      checkbox.value = uid;
      checkbox.checked = checked.has(uid);
      label.append(checkbox, person.nombre);
      people.append(label);
    }
    createButton.disabled = saving || people.childElementCount < 2;
    if (people.childElementCount < 2) people.append("Se necesitan otras dos cuentas registradas.");
    if (selectedGroup) document.querySelector("#active-group-members").textContent = memberNames(selectedGroup).join(", ");
  }, reportGroupError);
  onValue(ref(database, `gruposPorUsuario/${sessionUser.uid}`), async (snapshot) => {
    for (const id of Object.keys(snapshot.val() || {})) {
      if (document.getElementById(`group-${id}`)) continue;
      try {
        const group = (await get(ref(database, `chatsGrupales/${id}`))).val();
        if (!group || document.getElementById(`group-${id}`)) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.id = `group-${id}`;
        button.className = "chat-item group-entry";
        const avatar = document.createElement("span");
        avatar.className = "av";
        avatar.textContent = initials(group.nombre);
        const label = document.createElement("span");
        const title = document.createElement("b");
        title.textContent = group.nombre;
        const count = document.createElement("small");
        count.textContent = `${Object.keys(group.miembros).length} integrantes`;
        label.append(title, count);
        button.append(avatar, label);
        button.addEventListener("click", () => {
          selectedGroup = group;
          openGroup(button, id, group);
        });
        groupsList.append(button);
      } catch { reportGroupError(); }
    }
  }, reportGroupError);
}).catch(reportGroupError);

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saving) return;
  const fields = new FormData(createForm);
  const name = fields.get("nombre").trim();
  const invited = fields.getAll("integrante");
  if (!name || invited.length < 2) {
    feedback.textContent = "Escribe un nombre y elige al menos dos personas.";
    return;
  }
  saving = true;
  createButton.disabled = true;
  const id = push(ref(database, "chatsGrupales")).key;
  const members = [sessionUser.uid, ...invited];
  const writes = {
    [`chatsGrupales/${id}`]: {
      nombre: name, creador: sessionUser.uid, invitado1: invited[0], invitado2: invited[1],
      miembros: Object.fromEntries(members.map((uid) => [uid, true]))
    }
  };
  for (const uid of members) writes[`gruposPorUsuario/${uid}/${id}`] = true;
  try {
    await update(ref(database), writes);
    createForm.reset();
    feedback.textContent = "Grupo creado. Ábrelo desde tu lista.";
  } catch {
    feedback.textContent = "No se pudo crear el grupo. Revisa la conexión y las reglas.";
  } finally {
    saving = false;
    createButton.disabled = people.childElementCount < 2;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    return;
  }

  input.disabled = true;
  const target = messagesRef;
  const groupName = activeName;

  try {
    const textPayload = await createTextPayload(text, encryptionInput.checked);
    await push(target, {
      grupo: groupName,
      usuario: accountName,
      usuarioUid: sessionUser.uid,
      ...textPayload,
      fecha: Date.now()
    });
    input.value = "";
  } catch (error) {
    window.alert("No se pudo enviar el mensaje. Revisa la conexion y las reglas de Firebase.");
  } finally {
    input.disabled = false;
    input.focus();
  }
});

attachButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const target = messagesRef;
  const groupName = activeName;

  attachButton.disabled = true;
  attachButton.textContent = "Subiendo...";

  try {
    const fileData = await uploadChatFile(file);
    const textPayload = await createTextPayload(
      `Adjunto: ${file.name}`,
      encryptionInput.checked
    );
    await push(target, {
      grupo: groupName,
      usuario: accountName,
      usuarioUid: sessionUser.uid,
      ...textPayload,
      fecha: Date.now(),
      ...fileData
    });
  } catch (error) {
    window.alert(error.message || "No se pudo subir el archivo.");
  } finally {
    fileInput.value = "";
    attachButton.disabled = false;
    attachButton.textContent = "Adjuntar";
  }
});
