const secretPhrase = "nexo-poi-chat-2026";
let keyPromise;

function bytesToBase64(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey() {
  if (!keyPromise) {
    keyPromise = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(secretPhrase))
      .then((hash) => crypto.subtle.importKey(
        "raw",
        hash,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      ));
  }

  return keyPromise;
}

export async function createTextPayload(text, encryptionEnabled) {
  if (!encryptionEnabled) {
    return {
      texto: text,
      cifrado: false
    };
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );

  return {
    texto: "Mensaje cifrado",
    cifrado: true,
    textoCifrado: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv)
  };
}

export async function readMessageText(message) {
  if (!message?.cifrado) {
    return typeof message?.texto === "string" ? message.texto : "";
  }

  if (!message.textoCifrado || !message.iv) {
    return "No se pudo descifrar el mensaje.";
  }

  try {
    const key = await getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(message.iv) },
      key,
      base64ToBytes(message.textoCifrado)
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return "No se pudo descifrar el mensaje.";
  }
}
