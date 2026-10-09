import { database } from "./firebase-config.js";
import {
  limitToLast,
  onChildAdded,
  onValue,
  push,
  query,
  ref
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const messages = document.querySelector("#messages");
const form = document.querySelector("#message-form");
const input = document.querySelector("#message-input");
const currentUserSelect = document.querySelector("#current-user");
const messagesRef = ref(database, "chats/chat-privado/mensajes");
const recentMessages = query(messagesRef, limitToLast(100));

currentUserSelect.value = localStorage.getItem("nexo-current-user") || "Ana Torres";

currentUserSelect.addEventListener("change", () => {
  localStorage.setItem("nexo-current-user", currentUserSelect.value);
  document.querySelectorAll(".msg[data-sender]").forEach((message) => {
    message.classList.toggle("me", message.dataset.sender === currentUserSelect.value);
  });
});

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function showStatus(text) {
  messages.replaceChildren();
  const container = document.createElement("div");
  const bubble = document.createElement("div");

  container.className = "msg";
  bubble.className = "bubble";
  bubble.textContent = text;
  container.append(bubble);
  messages.append(container);
}

function showMessage(message) {
  if (!message || typeof message.texto !== "string" || typeof message.usuario !== "string") {
    return;
  }

  if (messages.dataset.loaded !== "true") {
    messages.replaceChildren();
    messages.dataset.loaded = "true";
  }

  const container = document.createElement("div");
  const bubble = document.createElement("div");
  const sender = document.createElement("b");
  const text = document.createElement("span");
  const time = document.createElement("small");

  container.className = message.usuario === currentUserSelect.value ? "msg me" : "msg";
  container.dataset.sender = message.usuario;
  bubble.className = "bubble";
  sender.textContent = `${message.usuario}: `;
  text.textContent = message.texto;
  time.textContent = formatTime(message.fecha);

  bubble.append(sender, text, time);
  container.append(bubble);
  messages.append(container);
  messages.scrollTop = messages.scrollHeight;
}

onChildAdded(recentMessages, (snapshot) => {
  showMessage(snapshot.val());
}, () => {
  showStatus("No se pudo conectar. Revisa las reglas de Firebase.");
});

onValue(recentMessages, (snapshot) => {
  if (!snapshot.exists()) {
    showStatus("Aun no hay mensajes. Escribe el primero.");
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
    await push(messagesRef, {
      usuario: currentUserSelect.value,
      texto: text,
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
