import { storage } from "./firebase-config.js";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";

const maxFileSize = 5 * 1024 * 1024;

function isTextFile(file) {
  return file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
}

export function validateChatFile(file) {
  if (!file) {
    throw new Error("Selecciona un archivo.");
  }

  if (file.size > maxFileSize) {
    throw new Error("El archivo no puede superar 5 MB.");
  }

  if (!file.type.startsWith("image/") && !isTextFile(file)) {
    throw new Error("Solo se permiten imagenes y archivos TXT.");
  }
}

export async function uploadChatFile(file, chatFolder) {
  validateChatFile(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `adjuntos/${chatFolder}/${Date.now()}-${safeName}`;
  const contentType = file.type || "text/plain";
  const fileReference = storageRef(storage, path);

  await uploadBytes(fileReference, file, { contentType });
  const downloadUrl = await getDownloadURL(fileReference);

  return {
    archivoUrl: downloadUrl,
    archivoNombre: file.name,
    archivoTipo: contentType,
    archivoTamano: file.size
  };
}

export function appendChatFile(bubble, message) {
  if (!message.archivoUrl || !message.archivoNombre) {
    return;
  }

  if (typeof message.archivoTipo === "string" && message.archivoTipo.startsWith("image/")) {
    const image = document.createElement("img");
    image.className = "message-image";
    image.src = message.archivoUrl;
    image.alt = message.archivoNombre;
    image.loading = "lazy";
    bubble.append(image);
    return;
  }

  const link = document.createElement("a");
  link.className = "message-file";
  link.href = message.archivoUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = `Abrir archivo: ${message.archivoNombre}`;
  bubble.append(link);
}
