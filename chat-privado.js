import { database } from "./firebase-config.js";
import { sessionUser, directoryReady, initials } from "./auth-session.js";
import { appendChatFile, uploadChatFile } from "./chat-files.js";
import { createTextPayload, readMessageText } from "./chat-crypto.js";
import { ref, get, set, onValue, push, query, limitToLast } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const messages = document.querySelector("#messages");
const form = document.querySelector("#message-form");
const input = document.querySelector("#message-input");
const attach = document.querySelector("#private-attach-button");
const files = document.querySelector("#private-file-input");
const encryption = document.querySelector("#private-encryption");
const contacts = document.querySelector("#private-contacts");
const search = document.querySelector("#contact-search");
let users = [];
let target = null;
let selected = null;
let stop = null;
let generation = 0;
let revision = 0;
let busy = false;

function status(text) {
  const p = document.createElement("p");
  p.className = "chat-status";
  p.textContent = text;
  messages.replaceChildren(p);
}

function controls() {
  input.disabled = !target || busy;
  attach.disabled = !target || busy;
  form.querySelector('[type="submit"]').disabled = !target || busy;
}

function listUsers() {
  contacts.replaceChildren();
  for (const user of users.filter((item) => item.nombre.toLowerCase().includes(search.value.toLowerCase()))) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-item${selected === user.uid ? " active" : ""}`;
    const avatar = document.createElement("span");
    avatar.className = "av";
    avatar.textContent = initials(user.nombre);
    const name = document.createElement("b");
    name.textContent = user.nombre;
    button.append(avatar, name);
    button.addEventListener("click", () => openChat(user));
    contacts.append(button);
  }
  if (!users.length) contacts.textContent = "La otra persona debe iniciar sesion con esta version para aparecer aqui.";
}

async function render(snapshot, token) {
  const version = ++revision;
  const fragment = document.createDocumentFragment();
  const records = [];
  snapshot.forEach((child) => records.push(child.val()));
  for (const message of records) {
    const row = document.createElement("div");
    row.className = message.usuarioUid === sessionUser.uid ? "msg me" : "msg";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const sender = document.createElement("b");
    sender.textContent = `${message.usuario}: `;
    const text = document.createElement("span");
    text.textContent = await readMessageText(message);
    bubble.append(sender, text);
    appendChatFile(bubble, message);
    if (message.cifrado) {
      const label = document.createElement("span");
      label.className = "encrypted-label";
      label.textContent = "Mensaje cifrado";
      bubble.append(label);
    }
    const time = document.createElement("small");
    time.textContent = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.fecha));
    bubble.append(time);
    row.append(bubble);
    fragment.append(row);
  }
  if (token !== generation || version !== revision) return;
  if (records.length) messages.replaceChildren(fragment);
  else status("Aun no hay mensajes. Escribe el primero.");
  messages.scrollTop = messages.scrollHeight;
}

async function openChat(user) {
  if (busy) return;
  const token = ++generation;
  stop?.();
  target = null;
  selected = user.uid;
  input.value = "";
  document.querySelector("#recipient-name").textContent = user.nombre;
  document.querySelector("#recipient-avatar").textContent = initials(user.nombre);
  listUsers();
  controls();
  status("Abriendo conversacion...");
  const pair = [sessionUser.uid, user.uid].sort();
  const path = `conversacionesPrivadas/${pair.join("_")}`;
  try {
    const room = await get(ref(database, path));
    if (!room.exists()) await set(ref(database, path), {
      usuario1: pair[0], usuario2: pair[1],
      participantes: { [pair[0]]: true, [pair[1]]: true }
    });
    if (token !== generation) return;
    target = ref(database, `${path}/mensajes`);
    stop = onValue(query(target, limitToLast(100)), (snapshot) => {
      render(snapshot, token).catch(() => status("No se pudieron mostrar los mensajes."));
    }, () => {
      if (token !== generation) return;
      target = null;
      controls();
      status("No tienes acceso. Revisa las reglas de conversaciones privadas.");
    });
    controls();
  } catch {
    if (token === generation) status("No se pudo abrir el chat. Revisa la conexion y las reglas.");
  }
}

async function send(text, file) {
  if (!target || busy) return;
  const destination = target;
  const encrypt = encryption.checked;
  busy = true;
  controls();
  try {
    const attachment = file ? await uploadChatFile(file) : {};
    const payload = await createTextPayload(text, encrypt);
    await push(destination, {
      usuario: sessionUser.displayName || "Usuario",
      usuarioUid: sessionUser.uid,
      fecha: Date.now(),
      ...payload,
      ...attachment
    });
    if (!file) input.value = "";
  } catch (error) {
    window.alert(error.message || "No se pudo enviar el mensaje.");
  } finally {
    busy = false;
    files.value = "";
    controls();
  }
}

encryption.checked = localStorage.getItem("nexo-encryption-enabled") === "true";
encryption.addEventListener("change", () => localStorage.setItem("nexo-encryption-enabled", String(encryption.checked)));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (input.value.trim()) send(input.value.trim());
});
attach.addEventListener("click", () => files.click());
files.addEventListener("change", () => {
  const file = files.files[0];
  if (file) send(`Adjunto: ${file.name}`, file);
});
search.addEventListener("input", listUsers);
controls();
status("Selecciona una persona para conversar.");
try {
  await directoryReady;
  onValue(ref(database, "usuarios"), (snapshot) => {
    users = [];
    snapshot.forEach((child) => {
      if (child.key !== sessionUser.uid && typeof child.val()?.nombre === "string") {
        users.push({ uid: child.key, nombre: child.val().nombre });
      }
    });
    users.sort((a, b) => a.nombre.localeCompare(b.nombre));
    listUsers();
  }, () => status("No se pudo leer el directorio. Publica las reglas nuevas."));
} catch {
  status("No se pudo registrar tu nombre. Publica las reglas nuevas de usuarios.");
}
