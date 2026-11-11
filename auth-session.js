import { auth } from "./firebase-config.js";
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

const user = await requireUser();
const name = user.displayName || "Usuario";
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
