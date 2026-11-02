import { database } from "./firebase-config.js";
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

const roomRef = ref(database, "videollamadas/privada-demo");
const callerCandidatesRef = ref(database, "videollamadas/privada-demo/callerCandidates");
const calleeCandidatesRef = ref(database, "videollamadas/privada-demo/calleeCandidates");
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

userSelect.value = localStorage.getItem("nexo-call-user") || "Ana Torres";
updateParticipantNames();

userSelect.addEventListener("change", () => {
  localStorage.setItem("nexo-call-user", userSelect.value);
  updateParticipantNames();
});

function updateParticipantNames() {
  localName.textContent = `${userSelect.value} (Tu)`;
  remoteName.textContent = userSelect.value === "Ana Torres" ? "Luis Garcia" : "Ana Torres";
}

function setStatus(message) {
  status.textContent = message;
}

function setCallButtons(inCall) {
  startButton.disabled = inCall;
  joinButton.disabled = inCall;
  userSelect.disabled = inCall;
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
    await remove(roomRef);
    await prepareMedia();

    peerConnection.addEventListener("icecandidate", async (event) => {
      if (event.candidate) {
        await push(callerCandidatesRef, event.candidate.toJSON());
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await set(ref(database, "videollamadas/privada-demo/offer"), {
      type: offer.type,
      sdp: offer.sdp
    });
    await update(roomRef, {
      caller: userSelect.value,
      status: "ringing",
      createdAt: Date.now()
    });

    unsubscribeAnswer = onValue(ref(database, "videollamadas/privada-demo/answer"), async (snapshot) => {
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
    setStatus("Llamada creada. Esperando a que el otro participante se una.");
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

    if (!room?.offer || room.status === "ended") {
      setStatus("No hay una llamada activa. Inicia la llamada desde el otro dispositivo.");
      return;
    }

    setCallButtons(true);
    isCaller = false;
    pendingCandidates = [];
    await prepareMedia();

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
    await set(ref(database, "videollamadas/privada-demo/answer"), {
      type: answer.type,
      sdp: answer.sdp
    });
    await update(roomRef, {
      callee: userSelect.value,
      status: "active"
    });
    listenForEnd();
    setStatus("Conectando la videollamada...");
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
