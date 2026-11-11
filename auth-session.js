import { auth, database } from "./firebase-config.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

export function requireUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (!user) {
        window.location.replace("index.html");
        return;
      }
      resolve(user);
    });
  });
}

export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export const sessionUser = await requireUser();
const user = sessionUser;
const name = user.displayName || "Usuario";
export const directoryReady = set(ref(database, `usuarios/${user.uid}`), { nombre: name });
directoryReady.catch(() => console.warn("Revisa las reglas del directorio de usuarios."));
import("./mobile-ui.js");
document.querySelectorAll(".topbar .av, .topbar .avatar").forEach((avatar) => {
  avatar.textContent = initials(name);
  avatar.title = name;
});

document.querySelectorAll('.sidebar a[href="index.html"]').forEach((link) => {
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await signOut(auth);
      window.location.replace("index.html");
    } catch {
      window.alert("No se pudo cerrar la sesion. Intenta de nuevo.");
    }
  });
});
