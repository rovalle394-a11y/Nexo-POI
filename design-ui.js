(() => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M7 10h9M7 14h6"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/>',
    task: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 4V2h6v2M8 12l3 3 5-6"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    logout: '<path d="M9 4H4v16h5M8 12h13m-4-4 4 4-4 4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    bell: '<path d="M5 17h14l-2-4V8A5 5 0 0 0 7 8v5ZM10 21h4"/>',
    heart: '<path d="M12 21 3 12a5 5 0 0 1 9-6 5 5 0 0 1 9 6Z"/>'
  };
  function icon(element, name) {
    element.innerHTML = `<svg class="nexo-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  }
  const routes = { 'home.html': 'home', 'chat-grupal.html': 'chat', 'chat-privado.html': 'chat', 'videollamada.html': 'video', 'tareas.html': 'task', 'perfil.html': 'profile', 'index.html': 'logout' };
  document.querySelectorAll('.sidebar a').forEach((link) => {
    const element = link.querySelector('.icon');
    if (element) icon(element, routes[link.getAttribute('href')] || 'chat');
  });
  document.querySelectorAll('.icon').forEach((element) => {
    if (element.textContent.trim() !== '?') return;
    icon(element, element.closest('.topbar') ? 'bell' : element.closest('.actions') ? (element.parentElement.textContent.includes('gusta') ? 'heart' : 'chat') : 'image');
  });
  document.querySelectorAll('.post-img').forEach((element) => {
    if (element.textContent.trim() !== '?') return;
    icon(element, 'image');
    const caption = document.createElement('span');
    caption.textContent = 'Sin imagen';
    element.append(caption);
  });
  document.querySelectorAll('.send').forEach((element) => { element.textContent = 'Enviar'; });
  const password = document.querySelector('#togglePass');
  if (password && password.textContent.trim() === '?') {
    password.textContent = 'Ver';
    password.setAttribute('aria-label', 'Mostrar u ocultar contraseña');
  }
  if (document.querySelector('#loginForm, #registerForm')) document.body.classList.add('auth-page');
})();
