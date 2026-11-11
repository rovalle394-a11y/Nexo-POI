import { database } from "./firebase-config.js";
import { sessionUser, directoryReady } from "./auth-session.js";
import {
  get,
  onChildAdded,
  onValue,
  push,
  ref,
  remove,
  set,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const userSelect = document.querySelector("#call-user");
const startButton = document.querySelector("#start-call");
const joinButton = document.querySelector("#join-call");
const endButton = document.querySelector("#end-call");
const microphoneButton = document.querySelector("#toggle-microphone");
const cameraButton = document.querySelector("#toggle-camera");
const status = document.querySelector("#call-status");
const localVideo = document.querySelector("#local-video");
const remoteVideo = document.querySelector("#remote-video");
const localName = document.querySelector("#local-name");
const remoteName = document.querySelector("#remote-name");
const remoteEmpty = document.querySelector("#remote-empty");

const otherUid = new URLSearchParams(window.location.search).get("usuario");
const validPeer = Boolean(otherUid && otherUid !== sessionUser.uid && !/[.#$\[\]/]/.test(otherUid));
if (!validPeer) {
  window.location.replace("chat-privado.html");
  await new Promise(() => {});
}
await directoryReady;
const otherProfile = await get(ref(database, `usuarios/${otherUid}`));
if (!otherProfile.exists()) {
  window.location.replace("chat-privado.html");
  await new Promise(() => {});
}
const otherName = otherProfile.val().nombre;
const pair = [sessionUser.uid, otherUid].sort();
const conversationPath = `conversacionesPrivadas/${pair.join("_")}`;
const conversationRef = ref(database, conversationPath);
const conversation = await get(conversationRef);
if (!conversation.exists()) {
  await set(conversationRef, {
    usuario1: pair[0], usuario2: pair[1],
    participantes: { [pair[0]]: true, [pair[1]]: true }
  });
}
const roomPath = `${conversationPath}/llamada`;
const roomRef = ref(database, roomPath);
const callerCandidatesRef = ref(database, `${roomPath}/callerCandidates`);
const calleeCandidatesRef = ref(database, `${roomPath}/calleeCandidates`);
const rtcConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let isCaller = false;
let pendingCandidates = [];
let unsubscribeRoom = null;
let unsubscribeCandidates = null;
let unsubscribeAnswer = null;
let ringTimer = null;
let callBusy = false;
let activeSession = null;

userSelect.replaceChildren(new Option(sessionUser.displayName || "Usuario", sessionUser.uid));
userSelect.disabled = true;
updateParticipantNames();

userSelect.addEventListener("change", () => {
  localStorage.setItem("nexo-call-user", userSelect.value);
  updateParticipantNames();
});

function updateParticipantNames() {
  localName.textContent = `${sessionUser.displayName || "Usuario"} (Tu)`;
  remoteName.textContent = otherName;
}

function setStatus(message) {
  status.textContent = message;
}

function setCallButtons(inCall) {
  startButton.disabled = inCall;
  joinButton.disabled = inCall;
  userSelect.disabled = true;
  endButton.disabled = !inCall;
  microphoneButton.disabled = !inCall;
  cameraButton.disabled = !inCall;
  endButton.textContent = inCall && isCaller ? "Cancelar" : "Colgar";
}

async function prepareMedia() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite usar camara y microfono.");
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  localVideo.srcObject = localStream;

  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  peerConnection = new RTCPeerConnection(rtcConfiguration);
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.addEventListener("track", (event) => {
    event.streams[0].getTracks().forEach((track) => {
      if (!remoteStream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });
    remoteEmpty.hidden = true;
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    const connectionState = peerConnection?.connectionState;
    if (connectionState === "connected") {
      clearTimeout(ringTimer);
      endButton.textContent = "Colgar";
      setStatus("Videollamada conectada.");
      remoteEmpty.hidden = true;
    } else if (["failed", "disconnected"].includes(connectionState)) {
      setStatus("Se perdio la conexion con el otro participante.");
    }
  });
}

async function addRemoteCandidate(candidateData) {
  if (!candidateData || !peerConnection) {
    return;
  }

  if (!peerConnection.remoteDescription) {
    pendingCandidates.push(candidateData);
    return;
  }

  await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
}

async function flushPendingCandidates() {
  const candidates = [...pendingCandidates];
  pendingCandidates = [];
  for (const candidate of candidates) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

function listenForEnd() {
  unsubscribeRoom = onValue(roomRef, (snapshot) => {
    const room = snapshot.val();
    if (["ended", "rejected", "missed"].includes(room?.status) && peerConnection) {
      closeCall(false);
      setStatus(room.status === "rejected" ? "La otra persona rechazó la llamada." : room.status === "missed" ? "La otra persona no respondió." : "La llamada fue finalizada.");
      startButton.hidden = false;
    }
  });
}

async function startCall() {
  if (callBusy || peerConnection) return;
  callBusy = true;
  try {
    setStatus("Solicitando acceso a camara y microfono...");
    isCaller = true;
    setCallButtons(true);
    endButton.disabled = true;
    pendingCandidates = [];
    const existing = (await get(roomRef)).val();
    if (existing && (existing.status === "active" || (existing.status === "ringing" && Date.now() - existing.createdAt < 60000))) {
      setCallButtons(false);
      setStatus("Ya hay una llamada en curso. Vuelve al chat para atenderla.");
      return;
    }
    await remove(roomRef);
    await prepareMedia();
    setCallButtons(true);
    activeSession = crypto.randomUUID();

    peerConnection.addEventListener("icecandidate", async (event) => {
      if (event.candidate) {
        await push(callerCandidatesRef, event.candidate.toJSON());
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await set(ref(database, `${roomPath}/offer`), {
      type: offer.type,
      sdp: offer.sdp
    });
    await update(roomRef, {
      caller: sessionUser.uid,
      sessionId: activeSession,
      status: "ringing",
      createdAt: Date.now()
    });

    unsubscribeAnswer = onValue(ref(database, `${roomPath}/answer`), async (snapshot) => {
      const answer = snapshot.val();
      if (answer && peerConnection && !peerConnection.currentRemoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates();
      }
    });

    unsubscribeCandidates = onChildAdded(calleeCandidatesRef, async (snapshot) => {
      await addRemoteCandidate(snapshot.val());
    });
    listenForEnd();
    startButton.hidden = true;
    setStatus(`Llamando a ${otherName}...`);
    ringTimer = setTimeout(async () => {
      const current = (await get(roomRef)).val();
      if (current?.sessionId === activeSession && current.status === "ringing") {
        await update(roomRef, { status: "missed" });
      }
    }, 60000);
  } catch (error) {
    await closeCall(false);
    startButton.hidden = false;
    setStatus(error.message || "No se pudo iniciar la videollamada.");
  } finally {
    callBusy = false;
  }
}

async function joinCall() {
  if (callBusy || peerConnection) return;
  callBusy = true;
  try {
    setStatus("Buscando una llamada disponible...");
    const snapshot = await get(roomRef);
    const room = snapshot.val();

    if (!room?.offer || room.status !== "ringing" || Date.now() - room.createdAt > 60000) {
      setStatus("La llamada ya no está disponible. Vuelve al chat.");
      return;
    }
    if (room.caller === sessionUser.uid || room.status === "active") {
      setStatus("Solo la otra cuenta puede unirse a una llamada pendiente.");
      return;
    }

    isCaller = false;
    setCallButtons(true);
    endButton.disabled = true;
    pendingCandidates = [];
    await prepareMedia();
    const latest = (await get(roomRef)).val();
    if (latest?.status !== "ringing" || latest.sessionId !== room.sessionId) {
      await closeCall(false);
      setStatus("La llamada fue cancelada mientras abrías la cámara.");
      return;
    }
    activeSession = room.sessionId;
    setCallButtons(true);

    peerConnection.addEventListener("icecandidate", async (event) => {
      if (event.candidate) {
        await push(calleeCandidatesRef, event.candidate.toJSON());
      }
    });

    unsubscribeCandidates = onChildAdded(callerCandidatesRef, async (candidateSnapshot) => {
      await addRemoteCandidate(candidateSnapshot.val());
    });

    await peerConnection.setRemoteDescription(new RTCSessionDescription(room.offer));
    await flushPendingCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await set(ref(database, `${roomPath}/answer`), {
      type: answer.type,
      sdp: answer.sdp
    });
    await update(roomRef, {
      callee: sessionUser.uid,
      status: "active"
    });
    listenForEnd();
    setStatus("Conectando la videollamada...");
  } catch (error) {
    closeCall(false);
    setStatus(error.message || "No se pudo unir a la videollamada.");
  } finally {
    callBusy = false;
  }
}

async function closeCall(updateFirebase = true) {
  clearTimeout(ringTimer);
  if (updateFirebase && peerConnection) {
    try {
      await update(roomRef, { status: "ended", endedAt: Date.now() });
    } catch (error) {
      setStatus("La llamada termino, pero no se pudo actualizar Firebase.");
    }
  }

  unsubscribeRoom?.();
  unsubscribeCandidates?.();
  unsubscribeAnswer?.();
  unsubscribeRoom = null;
  unsubscribeCandidates = null;
  unsubscribeAnswer = null;
  peerConnection?.close();
  peerConnection = null;
  localStream?.getTracks().forEach((track) => track.stop());
  remoteStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  remoteStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  remoteEmpty.hidden = false;
  microphoneButton.classList.remove("off");
  cameraButton.classList.remove("off");
  microphoneButton.textContent = "Mic";
  cameraButton.textContent = "Cam";
  setCallButtons(false);
  isCaller = false;
  activeSession = null;
}

microphoneButton.addEventListener("click", () => {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  microphoneButton.classList.toggle("off", !track.enabled);
  microphoneButton.textContent = track.enabled ? "Mic" : "Mic off";
});

cameraButton.addEventListener("click", () => {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  cameraButton.classList.toggle("off", !track.enabled);
  cameraButton.textContent = track.enabled ? "Cam" : "Cam off";
});

startButton.addEventListener("click", startCall);
joinButton.addEventListener("click", joinCall);
endButton.addEventListener("click", async () => {
  await closeCall(true);
  setStatus("Llamada finalizada.");
  startButton.hidden = false;
});

window.addEventListener("pagehide", () => {
  if (peerConnection) update(roomRef, { status: "ended", endedAt: Date.now() }).catch(() => {});
  localStream?.getTracks().forEach((track) => track.stop());
  peerConnection?.close();
});

const action = new URLSearchParams(location.search).get("accion");
if (action === "aceptar") await joinCall();
else if (action === "llamar") await startCall();
else {
  startButton.hidden = false;
  setStatus(`Videollamada con ${otherName}.`);
}
