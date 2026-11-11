import { auth } from "./firebase-config.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const form = document.querySelector("#loginForm, #registerForm");
const registering = form.id === "registerForm";
const submit = form.querySelector('button[type="submit"]');
const status = document.createElement("p");
status.setAttribute("role", "status");
status.style.cssText = "font-size:12px;margin-top:12px;color:#923b32;";
form.append(status);

document.querySelector("#togglePass")?.addEventListener("click", () => {
  const password = document.querySelector("#password");
  password.type = password.type === "password" ? "text" : "password";
});

function errorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Inicia sesion.",
    "auth/invalid-email": "Revisa el correo electronico.",
    "auth/weak-password": "La contrasena debe tener al menos 6 caracteres.",
    "auth/invalid-credential": "Correo o contrasena incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera y vuelve a intentarlo.",
    "auth/network-request-failed": "Revisa tu conexion a internet.",
    "auth/operation-not-allowed": "Habilita correo y contrasena en Firebase Authentication."
  };
  return messages[error.code] || "No se pudo completar la operacion. Intenta de nuevo.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const name = document.querySelector("#full-name")?.value.trim();
  if (registering && (!name || password !== document.querySelector("#confirm-password").value)) {
    status.textContent = !name ? "Escribe tu nombre." : "Las contrasenas no coinciden.";
    return;
  }
  submit.disabled = true;
  try {
    await setPersistence(auth, registering || document.querySelector("#remember").checked
      ? browserLocalPersistence : browserSessionPersistence);
    if (registering) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    window.location.replace("home.html");
  } catch (error) {
    status.textContent = errorMessage(error);
  } finally {
    submit.disabled = false;
  }
});
