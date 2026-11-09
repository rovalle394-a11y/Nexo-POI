const maxFileSize = 5 * 1024 * 1024;
const cloudName = "lavb4mgz";
const uploadPreset = "nexo_archivos";
const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

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

export async function uploadChatFile(file) {
  validateChatFile(file);
  const contentType = file.type || "text/plain";
  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  if (!response.ok || !result.secure_url) {
    const detail = result?.error?.message;
    throw new Error(detail || "Cloudinary no pudo guardar el archivo.");
  }

  return {
    archivoUrl: result.secure_url,
    archivoNombre: file.name,
    archivoTipo: contentType,
    archivoTamano: file.size,
    archivoPublicId: result.public_id,
    archivoProveedor: "cloudinary"
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
