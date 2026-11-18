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

localName.textContent = `${sessionUser.displayName || "Usuario"} (Tu)`;
remoteName.textContent = otherName;

function setStatus(message) {
  status.textContent = message;
}

function setCallButtons(inCall) {
  startButton.disabled = inCall;
  joinButton.disabled = inCall;
  endButton.disabled = !inCall;
  microphoneButton.disabled = !inCall;
  cameraButton.disabled = !inCall;
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

  peerConnection.addEventListener("track", ({ track }) => {
    if (!remoteStream || remoteStream.getTrackById(track.id)) return;
    remoteStream.addTrack(track);
    remoteEmpty.hidden = true;
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    const connectionState = peerConnection?.connectionState;
    if (connectionState === "connected") {
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

  try {
    await peerConnection.addIceCandidate(candidateData);
  } catch (error) {
    console.warn("No se pudo aplicar un candidato ICE remoto.", error.name);
  }
}

async function flushPendingCandidates() {
  const candidates = [...pendingCandidates];
  pendingCandidates = [];
  for (const candidate of candidates) {
    await addRemoteCandidate(candidate);
  }
}

function watchIceCandidates(connection, destination) {
  const status = document.createElement("p");
  status.id = "ice-diagnostics";
  status.hidden = true;
  status.setAttribute("role", "status");
  document.querySelector("#ice-diagnostics")?.remove();
  document.querySelector("#call-status").after(status);

  let generated = 0;
  let saved = 0;
  let errors = 0;
  let lastError = "";
  let browserError = "";
  let publish;
  const published = new Promise((resolve) => { publish = resolve; });
  function render() {
    status.textContent = `ICE (${connection.iceGatheringState} / ${connection.iceConnectionState}): ${generated} generados, ${saved} guardados, ${errors} errores de guardado. Señalización: ${connection.signalingState}.${lastError ? ` ${lastError}` : ""}${browserError ? ` ${browserError}` : ""}`;
  }
  for (const event of ["icegatheringstatechange", "iceconnectionstatechange", "signalingstatechange"]) {
    connection.addEventListener(event, render);
  }
  connection.addEventListener("icecandidateerror", ({ errorCode }) => {
    browserError = `Error ICE del navegador: ${errorCode}.`;
    render();
  });
  connection.addEventListener("icecandidate", async ({ candidate }) => {
    if (!candidate?.candidate) return;
    generated++;
    render();
    try {
      await published;
      if (peerConnection !== connection) return;
      await push(destination, candidate.toJSON());
      saved++;
    } catch (error) {
      errors++;
      lastError = error.code || "No se pudo guardar en Firebase.";
    }
    render();
  });
  render();
  setTimeout(() => {
    if (peerConnection === connection && generated === 0 && !browserError) {
      browserError = "El navegador no entregó candidatos en 15 segundos.";
      render();
    }
  }, 15000);
  return publish;
}

function listenForEnd() {
  unsubscribeRoom = onValue(roomRef, (snapshot) => {
    const room = snapshot.val();
    if (room?.status === "ended" && peerConnection) {
      closeCall(false);
      setStatus("La llamada fue finalizada.");
    }
  });
}

async function startCall() {
  try {
    setStatus("Solicitando acceso a camara y microfono...");
    setCallButtons(true);
    isCaller = true;
    pendingCandidates = [];
    const existing = (await get(roomRef)).val();
    if (existing && existing.status !== "ended") {
      setCallButtons(false);
      setStatus("Ya hay una llamada. Usa Unirse si la inicio la otra persona.");
      return;
    }
    await remove(roomRef);
    await prepareMedia();

    const connection = peerConnection;
    const publishCandidates = watchIceCandidates(connection, callerCandidatesRef);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await update(roomRef, {
      offer: connection.localDescription.toJSON(),
      caller: sessionUser.uid,
      status: "ringing",
      createdAt: Date.now()
    });
    publishCandidates();
    setStatus("Llamada creada. Esperando a que el otro participante se una.");

    let applyingAnswer = false;
    unsubscribeAnswer = onValue(ref(database, `${roomPath}/answer`), async (snapshot) => {
      const answer = snapshot.val();
      if (!answer || peerConnection !== connection || applyingAnswer ||
          connection.signalingState !== "have-local-offer") return;
      applyingAnswer = true;
      try {
        await connection.setRemoteDescription(answer);
        if (peerConnection !== connection) return;
        if (connection.connectionState !== "connected") {
          setStatus("Respuesta aplicada. Conectando la videollamada...");
        }
        await flushPendingCandidates();
      } catch (error) {
        if (peerConnection === connection) setStatus(`No se pudo aplicar la respuesta: ${error.name}.`);
      } finally {
        applyingAnswer = false;
      }
    });

    unsubscribeCandidates = onChildAdded(calleeCandidatesRef, async (snapshot) => {
      await addRemoteCandidate(snapshot.val());
    });
    listenForEnd();
  } catch (error) {
    closeCall(false);
    setStatus(error.message || "No se pudo iniciar la videollamada.");
  }
}

async function joinCall() {
  try {
    setStatus("Buscando una llamada disponible...");
    const snapshot = await get(roomRef);
    const room = snapshot.val();

    if (!room?.offer || !["ringing", "active"].includes(room.status)) {
      setStatus("No hay una llamada activa. Inicia la llamada desde el otro dispositivo.");
      return;
    }
    if (room.caller === sessionUser.uid || room.status === "active") {
      setStatus("Solo la otra cuenta puede unirse a una llamada pendiente.");
      return;
    }

    setCallButtons(true);
    isCaller = false;
    pendingCandidates = [];
    await prepareMedia();

    const connection = peerConnection;
    const publishCandidates = watchIceCandidates(connection, calleeCandidatesRef);

    unsubscribeCandidates = onChildAdded(callerCandidatesRef, async (candidateSnapshot) => {
      await addRemoteCandidate(candidateSnapshot.val());
    });

    await peerConnection.setRemoteDescription(new RTCSessionDescription(room.offer));
    await flushPendingCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    setStatus("Conectando la videollamada...");
    await update(roomRef, {
      answer: connection.localDescription.toJSON(),
      callee: sessionUser.uid,
      status: "active"
    });
    publishCandidates();
    listenForEnd();
  } catch (error) {
    closeCall(false);
    setStatus(error.message || "No se pudo unir a la videollamada.");
  }
}

async function closeCall(updateFirebase = true) {
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
});

window.addEventListener("pagehide", () => {
  localStream?.getTracks().forEach((track) => track.stop());
  peerConnection?.close();
});
