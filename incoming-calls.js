import { database } from "./firebase-config.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

export function startIncomingCalls(user) {
  if (location.pathname.endsWith("videollamada.html")) return;
  const listeners = new Map();
  const pending = new Map();
  const banner = document.createElement("section");
  banner.className = "incoming-call";
  banner.setAttribute("role", "alert");
  banner.hidden = true;
  const label = document.createElement("p");
  const accept = document.createElement("button");
  accept.className = "accept";
  accept.textContent = "Aceptar";
  const reject = document.createElement("button");
  reject.className = "reject";
  reject.textContent = "Rechazar";
  banner.append(label, accept, reject);
  document.body.append(banner);
  let selected;
  function render() {
    selected = [...pending.values()].find((call) => Date.now() - call.createdAt < 60000);
    banner.hidden = !selected;
    if (selected) label.textContent = `Llamada entrante de ${selected.nombre}`;
  }
  onValue(ref(database, "usuarios"), (snapshot) => {
    snapshot.forEach((child) => {
      const uid = child.key;
      if (uid === user.uid || listeners.has(uid)) return;
      const path = `conversacionesPrivadas/${[uid, user.uid].sort().join("_")}/llamada`;
      listeners.set(uid, onValue(ref(database, path), (roomSnapshot) => {
        const room = roomSnapshot.val();
        if (room?.status === "ringing" && room.caller === uid) {
          pending.set(uid, { ...room, uid, path, nombre: child.val().nombre });
        } else pending.delete(uid);
        render();
      }, () => { pending.delete(uid); render(); }));
    });
  });
  accept.addEventListener("click", () => {
    if (!selected) return;
    location.href = `videollamada.html?usuario=${encodeURIComponent(selected.uid)}&accion=aceptar`;
  });
  reject.addEventListener("click", async () => {
    if (!selected) return;
    try { await update(ref(database, selected.path), { status: "rejected" }); }
    catch { label.textContent = "No se pudo rechazar. Intenta de nuevo."; }
  });
  setInterval(render, 1000);
}
