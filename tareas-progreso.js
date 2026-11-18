import { database } from "./firebase-config.js";
import { onValue, ref } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit"
});

export function dayKey(ms = Date.now()) {
  const parts = Object.fromEntries(dateFormat.formatToParts(ms).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function observeTaskProgress(onProgress, onError) {
  let legacy, grouped;
  function render() {
    if (!legacy || !grouped) return;
    const days = new Map();
    function count(uid, date, name) {
      if (!uid) return;
      if (!days.has(uid)) days.set(uid, { completed: 0, dates: new Map(), name });
      const person = days.get(uid);
      person.completed++;
      if (date) person.dates.set(date, (person.dates.get(date) || 0) + 1);
    }
    for (const task of Object.values(legacy)) {
      if (task.completada) count(task.completadaPorUid, task.fechaDia, task.completadaPor);
    }
    for (const [uid, groups] of Object.entries(grouped)) {
      for (const group of Object.values(groups)) {
        for (const ms of Object.values(group)) {
          if (typeof ms === "number") count(uid, dayKey(ms));
        }
      }
    }
    const today = dayKey();
    const progress = new Map();
    for (const [uid, { completed, dates, name }] of days) {
      const valid = [...dates.values()].reduce((sum, amount) => sum + Math.min(5, amount), 0);
      progress.set(uid, { completed, valid, today: Math.min(5, dates.get(today) || 0), name });
    }
    onProgress(progress);
  }
  onValue(ref(database, "grupos/desarrollo-web/tareas"), (snapshot) => {
    legacy = snapshot.val() || {};
    render();
  }, onError);
  onValue(ref(database, "avanceTareas"), (snapshot) => {
    grouped = snapshot.val() || {};
    render();
  }, onError);
}
