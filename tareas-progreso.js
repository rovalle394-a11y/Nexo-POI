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
  onValue(ref(database, "avanceTareas"), (snapshot) => {
    const grouped = snapshot.val() || {};
    const days = new Map();
    function count(uid, date) {
      if (!uid) return;
      if (!days.has(uid)) days.set(uid, { completed: 0, dates: new Map() });
      const person = days.get(uid);
      person.completed++;
      if (date) person.dates.set(date, (person.dates.get(date) || 0) + 1);
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
    for (const [uid, { completed, dates }] of days) {
      const valid = [...dates.values()].reduce((sum, amount) => sum + Math.min(5, amount), 0);
      progress.set(uid, { completed, valid, today: Math.min(5, dates.get(today) || 0) });
    }
    onProgress(progress);
  }, onError);
}
