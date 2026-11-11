const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "mobile.css";
document.head.append(stylesheet);
function fitViewport() {
  document.documentElement.style.setProperty("--viewport-height", `${window.visualViewport?.height || window.innerHeight}px`);
}
fitViewport();
window.visualViewport?.addEventListener("resize", fitViewport);
window.addEventListener("resize", fitViewport);
document.querySelectorAll(".send").forEach((button) => { button.textContent = "Enviar"; });

const sidebar = document.querySelector(".sidebar");
const topbar = document.querySelector(".topbar");
if (sidebar && topbar) {
  sidebar.id = "site-navigation";
  const menu = document.createElement("button");
  menu.className = "mobile-menu";
  menu.textContent = "Menú";
  menu.setAttribute("aria-controls", sidebar.id);
  menu.setAttribute("aria-expanded", "false");
  topbar.prepend(menu);
  menu.addEventListener("click", () => {
    const open = document.body.classList.toggle("navigation-open");
    menu.setAttribute("aria-expanded", String(open));
  });
}

const chats = document.querySelector(".chats");
const header = document.querySelector(".chat-head");
if (chats && header) {
  document.body.classList.add("mobile-chat");
  const back = document.createElement("button");
  back.className = "mobile-back";
  back.textContent = "Volver";
  header.prepend(back);
  back.addEventListener("click", () => document.body.classList.remove("conversation-open"));
  chats.addEventListener("click", (event) => {
    if (event.target.closest(".chat-item")) {
      document.body.classList.add("conversation-open");
    }
  });
}
