import { database } from "./firebase-config.js";
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
const messagesRef = ref(database, "chats/chat-grupal/desarrollo-web/mensajes");
const recentMessages = query(messagesRef, limitToLast(100));

const initialsByUser = {
  "Ana Torres": "AT",
  "Mariana Lopez": "ML",
  "Diego Martinez": "DM"
};

currentUser.value = localStorage.getItem("nexo-group-current-user") || "Ana Torres";

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

function showMessage(message) {
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

  container.className = "msg";
  container.dataset.sender = message.usuario;
  avatar.className = "av";
  avatar.textContent = initialsByUser[message.usuario] || "US";
  bubble.className = "bubble";
  sender.textContent = message.usuario;
  sender.style.fontSize = "11px";
  text.textContent = message.texto;
  time.textContent = formatTime(message.fecha);

  bubble.append(sender, lineBreak, text, time);
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
    await push(messagesRef, {
      grupo: "Desarrollo Web",
      usuario: currentUser.value,
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
