import { database } from "./firebase-config.js";
import { appendChatFile, uploadChatFile } from "./chat-files.js";
import { createTextPayload, readMessageText } from "./chat-crypto.js";
import {
  limitToLast,
  onChildAdded,
  onValue,
  push,
  query,
  ref
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const messages = document.querySelector("#group-messages");
const status = document.querySelector("#group-status");
const form = document.querySelector("#group-message-form");
const input = document.querySelector("#group-message-input");
const currentUser = document.querySelector("#group-current-user");
const attachButton = document.querySelector("#group-attach-button");
const fileInput = document.querySelector("#group-file-input");
const encryptionInput = document.querySelector("#group-encryption");
const messagesRef = ref(database, "chats/chat-grupal/desarrollo-web/mensajes");
const recentMessages = query(messagesRef, limitToLast(100));

const initialsByUser = {
  "Ana Torres": "AT",
  "Mariana Lopez": "ML",
  "Diego Martinez": "DM"
};

currentUser.value = localStorage.getItem("nexo-group-current-user") || "Ana Torres";
encryptionInput.checked = localStorage.getItem("nexo-encryption-enabled") === "true";

encryptionInput.addEventListener("change", () => {
  localStorage.setItem("nexo-encryption-enabled", String(encryptionInput.checked));
});

currentUser.addEventListener("change", () => {
  localStorage.setItem("nexo-group-current-user", currentUser.value);
  updateMessageSides();
});

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function updateMessageSides() {
  document.querySelectorAll(".msg[data-sender]").forEach((message) => {
    message.classList.toggle("me", message.dataset.sender === currentUser.value);
  });
}

async function showMessage(message) {
  if (!message || typeof message.texto !== "string" || typeof message.usuario !== "string") {
    return;
  }

  status?.remove();

  const container = document.createElement("div");
  const avatar = document.createElement("div");
  const bubble = document.createElement("div");
  const sender = document.createElement("b");
  const lineBreak = document.createElement("br");
  const text = document.createElement("span");
  const time = document.createElement("small");
  const encryptionLabel = document.createElement("span");

  container.className = "msg";
  container.dataset.sender = message.usuario;
  avatar.className = "av";
  avatar.textContent = initialsByUser[message.usuario] || "US";
  bubble.className = "bubble";
  sender.textContent = message.usuario;
  sender.style.fontSize = "11px";
  text.textContent = await readMessageText(message);
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

onChildAdded(recentMessages, (snapshot) => {
  showMessage(snapshot.val());
}, () => {
  if (status) {
    status.textContent = "No se pudo conectar. Revisa las reglas de Firebase.";
  }
});

onValue(recentMessages, (snapshot) => {
  if (!snapshot.exists() && status) {
    status.textContent = "Aun no hay mensajes. Escribe el primero.";
  }
}, { onlyOnce: true });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    return;
  }

  input.disabled = true;

  try {
    const textPayload = await createTextPayload(text, encryptionInput.checked);
    await push(messagesRef, {
      grupo: "Desarrollo Web",
      usuario: currentUser.value,
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

  attachButton.disabled = true;
  attachButton.textContent = "Subiendo...";

  try {
    const fileData = await uploadChatFile(file);
    const textPayload = await createTextPayload(
      `Adjunto: ${file.name}`,
      encryptionInput.checked
    );
    await push(messagesRef, {
      grupo: "Desarrollo Web",
      usuario: currentUser.value,
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
