const fallbackMessages = {
    general: [
        { author: "Sistema", initial: "S", text: "Servidor privado listo. Comparte la invitacion para que entren tus amigos.", time: "Ahora" }
    ],
    clips: [],
    musica: [
        { author: "Sistema", initial: "S", text: "La musica se escucha solamente en el canal de voz donde se reproduce.", time: "Ahora" }
    ],
    planes: []
};

const fallbackSongs = [
    { title: "Demo Beat", artist: "Voxa", duration: "3:18", url: "", source: "demo" },
    { title: "Lobby Pulse", artist: "Voxa", duration: "2:54", url: "", source: "demo" },
    { title: "After Match", artist: "Voxa", duration: "3:42", url: "", source: "demo" }
];

const appShell = document.querySelector(".app-shell");
const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const channelTitle = document.getElementById("channelTitle");
const toast = document.getElementById("toast");
const songTitle = document.getElementById("songTitle");
const songArtist = document.getElementById("songArtist");
const sideSongTitle = document.getElementById("sideSongTitle");
const sideSongArtist = document.getElementById("sideSongArtist");
const queueList = document.getElementById("queueList");
const playPause = document.getElementById("playPause");
const callBtn = document.getElementById("callBtn");
const voiceStatus = document.getElementById("voiceStatus");
const voiceChannelTitle = document.getElementById("voiceChannelTitle");
const connectionText = document.getElementById("connectionText");
const connectedCount = document.getElementById("connectedCount");
const friendsList = document.getElementById("friendsList");
const sideFriendsList = document.getElementById("sideFriendsList");
const voiceUsers = document.getElementById("voiceUsers");
const progress = document.getElementById("musicProgress");
const currentTime = document.getElementById("currentTime");
const totalTime = document.getElementById("totalTime");
const audioPlayer = document.getElementById("audioPlayer");
const songUrl = document.getElementById("songUrl");
const loadSongBtn = document.getElementById("loadSongBtn");
const youtubeFrame = document.getElementById("youtubeFrame");
const spotifyFrame = document.getElementById("spotifyFrame");
const demoVisualizer = document.getElementById("demoVisualizer");
const remoteAudio = document.getElementById("remoteAudio");
const playerNote = document.getElementById("playerNote");
const nameInput = document.getElementById("nameInput");
const selfName = document.getElementById("selfName");
const selfInitial = document.getElementById("selfInitial");
const inviteLinkText = document.getElementById("inviteLinkText");
const serverNameTitle = document.getElementById("serverNameTitle");
const serverCodeText = document.getElementById("serverCodeText");
const newServerBtn = document.getElementById("newServerBtn");
const joinServerInput = document.getElementById("joinServerInput");
const joinServerBtn = document.getElementById("joinServerBtn");
const textChannelList = document.getElementById("textChannelList");
const voiceChannelList = document.getElementById("voiceChannelList");

const generatedTracks = [
    { bpm: 104, bass: [110, 110, 146.83, 130.81], lead: [440, 493.88, 587.33, 523.25] },
    { bpm: 92, bass: [98, 123.47, 146.83, 123.47], lead: [392, 493.88, 440, 349.23] },
    { bpm: 118, bass: [130.81, 164.81, 196, 174.61], lead: [523.25, 659.25, 783.99, 698.46] }
];

let state = {
    textChannels: [
        { id: "general", name: "General" },
        { id: "clips", name: "Clips" },
        { id: "musica", name: "Musica" },
        { id: "planes", name: "Planes" }
    ],
    voiceChannels: [
        { id: "lobby", name: "Lobby de voz" },
        { id: "musica", name: "Musica compartida" }
    ],
    messages: fallbackMessages,
    songs: fallbackSongs,
    activeSong: 0,
    playing: false,
    progress: 0,
    users: [],
    voiceUsers: []
};

let activeChannel = "general";
let activeVoiceChannel = "lobby";
let inCall = false;
let socket = null;
let username = localStorage.getItem("salaPcName") || "Agustin";
let currentUserId = "";
let currentServerId = "";
let currentServerName = "Voxa Room";
let currentInviteUrl = "";
let lastMusicSync = 0;
let audioContext = null;
let masterGain = null;
let synthTimer = null;
let synthStep = 0;
let localStream = null;
let peers = new Map();
let micMuted = false;
let audioMuted = false;
let voxaConfig = null;
let lastJoinMode = "auto";

localStorage.setItem("salaPcName", username);

function initial(name) {
    return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function sendSocket(type, payload = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, ...payload }));
    return true;
}

function getRequestedServerId() {
    const params = new URLSearchParams(location.search);
    return (params.get("server") || localStorage.getItem("voxaServerId") || "").trim().toUpperCase();
}

function baseInviteUrl() {
    if (!location.host || location.protocol === "file:") return "";
    if (voxaConfig?.lanUrl && ["localhost", "127.0.0.1"].includes(location.hostname)) return voxaConfig.lanUrl;
    return `${location.protocol}//${location.host}/chat-app.html`;
}

function networkInviteUrl() {
    const base = baseInviteUrl();
    if (base && currentServerId) return `${base}?server=${encodeURIComponent(currentServerId)}`;
    if (currentInviteUrl) return currentInviteUrl;
    if (!base) return "Inicia el servidor para crear invitacion";
    return base;
}

function micHelpText() {
    const origin = voxaConfig?.origin || (location.origin && location.origin !== "null" ? location.origin : "http://IP-DE-LA-PC:3000");
    const url = networkInviteUrl().startsWith("http") ? networkInviteUrl() : `${origin}/chat-app.html`;
    return `Para usar microfono en red local, abrir Chrome asi:\nchrome.exe --user-data-dir="%TEMP%\\voxa-chrome" --unsafely-treat-insecure-origin-as-secure=${origin} ${url}`;
}

function updateInviteText() {
    inviteLinkText.textContent = networkInviteUrl();
    serverCodeText.textContent = currentServerId ? `Codigo: ${currentServerId}` : "Creando codigo...";
    serverNameTitle.textContent = currentServerName;
}

async function loadConfig() {
    if (!location.host || location.protocol === "file:") return;
    try {
        const response = await window.fetch("/voxa-config.json");
        voxaConfig = await response.json();
        updateInviteText();
    } catch {
        voxaConfig = null;
    }
}

function extractYouTubeId(value) {
    try {
        const url = new URL(value);
        if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
        if (url.hostname.includes("youtube.com")) {
            if (url.searchParams.get("v")) return url.searchParams.get("v");
            const parts = url.pathname.split("/").filter(Boolean);
            if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] || "";
        }
    } catch {
        return "";
    }
    return "";
}

function extractSpotifyEmbed(value) {
    try {
        const url = new URL(value);
        if (!url.hostname.includes("spotify.com")) return null;
        const parts = url.pathname.split("/").filter(Boolean);
        const offset = parts[0] === "embed" ? 1 : 0;
        const type = parts[offset];
        const id = parts[offset + 1];
        if (!["track", "album", "playlist", "episode", "show"].includes(type) || !id) return null;
        return {
            type,
            id,
            embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
        };
    } catch {
        return null;
    }
}

function titleFromUrl(url, fallback) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, "") || fallback;
    } catch {
        return fallback;
    }
}

function switchView(view) {
    const nextView = view || "chat";
    appShell.dataset.view = nextView;
    document.querySelectorAll(".view").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.panel === nextView);
    });
    document.querySelectorAll(".rail-nav").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === nextView);
    });
    if (nextView === "music") songUrl.focus();
}

function renderProfile() {
    selfName.textContent = username;
    selfInitial.textContent = initial(username);
    nameInput.value = username;
}

function renderTextChannels() {
    textChannelList.innerHTML = `
        <div class="block-label">Texto</div>
        ${state.textChannels.map((channel) => `
            <button class="channel ${channel.id === activeChannel ? "active" : ""}" type="button" data-channel="${escapeHtml(channel.id)}">
                <i class="fa-solid fa-hashtag"></i> ${escapeHtml(channel.name)}
            </button>
        `).join("")}
    `;
}

function activeVoiceName() {
    return state.voiceChannels.find((channel) => channel.id === activeVoiceChannel)?.name || "Lobby de voz";
}

function renderVoiceChannels() {
    voiceChannelTitle.textContent = activeVoiceName();
    voiceChannelList.innerHTML = `
        <div class="block-label">Voz</div>
        ${state.voiceChannels.map((channel) => `
            <button class="voice-channel ${channel.id === activeVoiceChannel ? "active" : ""}" type="button" data-voice-channel="${escapeHtml(channel.id)}">
                <i class="fa-solid fa-volume-high"></i> ${escapeHtml(channel.name)}
            </button>
        `).join("")}
        <div class="create-channel-row">
            <input id="newVoiceChannelInput" type="text" maxlength="32" placeholder="Nombre del canal">
            <button type="button" data-action="create-voice-channel" title="Crear canal"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div class="voice-members">${state.voiceUsers.map((user) => `<span>${escapeHtml(user.name)}</span>`).join("")}</div>
    `;
}

function renderMessages() {
    const messages = state.messages[activeChannel] || [];
    messagesEl.innerHTML = messages.map((message) => `
        <article class="message">
            <div class="avatar">${escapeHtml(message.initial || initial(message.author))}</div>
            <div class="bubble">
                <header>
                    <strong>${escapeHtml(message.author)}</strong>
                    <time>${escapeHtml(message.time)}</time>
                </header>
                <p>${escapeHtml(message.text)}</p>
            </div>
        </article>
    `).join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
    messageInput.placeholder = `Escribir en # ${activeChannel}`;
}

function userRows(users) {
    return users.map((user) => `
        <div class="user-row">
            <div class="avatar">${escapeHtml(initial(user.name))}</div>
            <div>
                <strong>${escapeHtml(user.name)}</strong>
                <small>${escapeHtml(user.status || "En linea")}</small>
            </div>
        </div>
    `).join("");
}

function renderUsers() {
    const users = state.users.length ? state.users : [{ name: username, status: "En el servidor" }];
    connectedCount.textContent = `${users.length} conectado${users.length === 1 ? "" : "s"}`;
    voiceUsers.innerHTML = userRows(state.voiceUsers.length ? state.voiceUsers : []);
    sideFriendsList.innerHTML = userRows(users);
    friendsList.innerHTML = users.map((user) => `
        <article class="friend-card">
            <div class="avatar">${escapeHtml(initial(user.name))}</div>
            <div>
                <strong>${escapeHtml(user.name)}</strong>
                <small>${escapeHtml(user.status || "En linea")}</small>
            </div>
        </article>
    `).join("");
    renderVoiceChannels();
}

function hideFrames() {
    youtubeFrame.style.display = "none";
    spotifyFrame.style.display = "none";
    demoVisualizer.style.display = "grid";
}

function youtubeEmbedSrc(song, autoplay = false) {
    const start = song.progressSeconds ? `&start=${Math.max(0, Math.floor(song.progressSeconds))}` : "";
    const auto = autoplay ? "&autoplay=1&mute=0" : "";
    return `https://www.youtube.com/embed/${encodeURIComponent(song.videoId)}?rel=0&playsinline=1${auto}${start}`;
}

function syncEmbed(song, autoplay = false) {
    hideFrames();
    if (song.source === "youtube" && song.videoId) {
        demoVisualizer.style.display = "none";
        spotifyFrame.removeAttribute("src");
        youtubeFrame.style.display = "block";
        const src = youtubeEmbedSrc(song, autoplay);
        if (youtubeFrame.src !== src) youtubeFrame.src = src;
        playerNote.textContent = "YouTube esta dentro de la app. Si el navegador bloquea autoplay, toca play en el video.";
        return;
    }
    if (song.source === "spotify" && song.embedUrl) {
        demoVisualizer.style.display = "none";
        youtubeFrame.removeAttribute("src");
        spotifyFrame.style.display = "block";
        if (spotifyFrame.src !== song.embedUrl) spotifyFrame.src = song.embedUrl;
        playerNote.textContent = "Spotify se abre adentro de Voxa. Toca play en el reproductor de Spotify.";
        return;
    }
    youtubeFrame.removeAttribute("src");
    spotifyFrame.removeAttribute("src");
    playerNote.textContent = song.url ? "Audio directo: usa Play de Voxa." : "Demo local: usa Play para probar sonido sin links.";
}

function renderQueue() {
    if (!state.songs.length) state.songs = fallbackSongs.map((song) => ({ ...song }));
    const song = state.songs[state.activeSong] || state.songs[0];
    queueList.innerHTML = state.songs.map((item, index) => `
        <button class="song ${index === state.activeSong ? "active" : ""}" type="button" data-song="${index}">
            <span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.artist)}</small>
            </span>
            <small>${escapeHtml(item.duration || "--:--")}</small>
        </button>
    `).join("");

    songTitle.textContent = song.title;
    songArtist.textContent = `${song.artist} · ${activeVoiceName()}`;
    sideSongTitle.textContent = song.title;
    sideSongArtist.textContent = activeVoiceName();
    totalTime.textContent = song.duration || "--:--";
    progress.value = state.progress || 0;

    if (song.source === "audio" && song.url) {
        if (audioPlayer.src !== song.url) audioPlayer.src = song.url;
    } else {
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
    }
    syncEmbed(song, false);
}

function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new AudioContext();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.16;
        masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") audioContext.resume();
}

function playTone(frequency, duration, type, gainValue) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
}

function startGeneratedMusic() {
    ensureAudioContext();
    stopGeneratedMusic();
    const track = generatedTracks[state.activeSong % generatedTracks.length];
    const stepMs = Math.round(60000 / track.bpm / 2);
    const tick = () => {
        const bass = track.bass[synthStep % track.bass.length];
        const lead = track.lead[synthStep % track.lead.length];
        playTone(bass, stepMs / 1000 * 0.8, "triangle", 0.34);
        if (synthStep % 2 === 0) playTone(lead, stepMs / 1000 * 0.5, "sine", 0.17);
        synthStep += 1;
    };
    tick();
    synthTimer = window.setInterval(tick, stepMs);
}

function stopGeneratedMusic() {
    if (synthTimer) {
        window.clearInterval(synthTimer);
        synthTimer = null;
    }
}

function updateCurrentTime() {
    const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 198;
    const seconds = Math.round((Number(progress.value) / 100) * duration);
    currentTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function syncMusicFromState(autoplayEmbed = false) {
    const song = state.songs[state.activeSong] || state.songs[0];
    progress.value = state.progress || 0;
    renderQueue();
    updateCurrentTime();
    playPause.textContent = state.playing ? "Pausa" : "Play";
    document.querySelector(".bars").style.animationPlayState = state.playing ? "running" : "paused";

    if (song.source === "youtube" || song.source === "spotify") {
        stopGeneratedMusic();
        audioPlayer.pause();
        syncEmbed(song, autoplayEmbed && song.source === "youtube");
        if (state.playing && song.source === "spotify") showToast("Toca play dentro del reproductor de Spotify");
        return;
    }

    if (song.source === "audio" && song.url) {
        stopGeneratedMusic();
        if (state.playing) {
            audioPlayer.play().catch(() => showToast("El navegador bloqueo el audio. Toca Play otra vez."));
        } else {
            audioPlayer.pause();
        }
        return;
    }

    if (state.playing) startGeneratedMusic();
    else stopGeneratedMusic();
}

function setSong(index) {
    state.activeSong = (index + state.songs.length) % state.songs.length;
    state.progress = 0;
    sendSocket("music", { activeSong: state.activeSong, progress: 0, playing: state.playing });
    syncMusicFromState(false);
}

function addSongFromUrl(url) {
    const videoId = extractYouTubeId(url);
    const spotify = extractSpotifyEmbed(url);
    const song = {
        title: videoId ? "YouTube compartido" : spotify ? `Spotify ${spotify.type}` : titleFromUrl(url, "Audio compartido"),
        artist: username,
        duration: "--:--",
        url,
        source: videoId ? "youtube" : spotify ? "spotify" : "audio",
        videoId,
        embedUrl: spotify?.embedUrl || ""
    };

    if (!sendSocket("song-add", { song })) {
        state.songs.push(song);
        state.activeSong = state.songs.length - 1;
        state.progress = 0;
        renderQueue();
        syncMusicFromState(false);
    }
    songUrl.value = "";
    switchView("music");
}

function userNumber(id) {
    return Number(String(id || "").replace(/\D/g, "")) || 0;
}

function resetVoicePeers() {
    for (const peer of peers.values()) peer.close();
    peers = new Map();
    remoteAudio.innerHTML = "";
}

function setRemoteMuted() {
    remoteAudio.querySelectorAll("audio").forEach((audio) => {
        audio.muted = audioMuted;
    });
}

function addRemoteStream(peerId, stream) {
    let audio = document.getElementById(`voice-${peerId}`);
    if (!audio) {
        audio = document.createElement("audio");
        audio.id = `voice-${peerId}`;
        audio.autoplay = true;
        audio.playsInline = true;
        remoteAudio.appendChild(audio);
    }
    audio.srcObject = stream;
    audio.muted = audioMuted;
    audio.play().catch(() => showToast("Toca la pagina para activar el audio de voz"));
}

function createPeer(peerId, shouldOffer) {
    if (!localStream || peers.has(peerId) || peerId === currentUserId) return peers.get(peerId);
    const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.addEventListener("icecandidate", (event) => {
        if (event.candidate) sendSocket("signal", { to: peerId, signal: { candidate: event.candidate } });
    });
    peer.addEventListener("track", (event) => addRemoteStream(peerId, event.streams[0]));
    peer.addEventListener("connectionstatechange", () => {
        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
            peer.close();
            peers.delete(peerId);
            document.getElementById(`voice-${peerId}`)?.remove();
        }
    });
    peers.set(peerId, peer);
    if (shouldOffer) {
        peer.createOffer()
            .then((offer) => peer.setLocalDescription(offer))
            .then(() => sendSocket("signal", { to: peerId, signal: { description: peer.localDescription } }))
            .catch(() => showToast("No pude iniciar voz con un usuario"));
    }
    return peer;
}

async function handleSignal(data) {
    if (!localStream) return;
    const peer = createPeer(data.from, false);
    const signal = data.signal;
    if (signal.description) {
        await peer.setRemoteDescription(signal.description);
        if (signal.description.type === "offer") {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSocket("signal", { to: data.from, signal: { description: peer.localDescription } });
        }
    }
    if (signal.candidate) await peer.addIceCandidate(signal.candidate).catch(() => {});
}

function connectVoiceToUsers() {
    if (!localStream || !currentUserId) return;
    state.voiceUsers
        .filter((user) => user.id && user.id !== currentUserId)
        .forEach((user) => createPeer(user.id, userNumber(currentUserId) < userNumber(user.id)));
}

async function startVoice() {
    if (!navigator.mediaDevices?.getUserMedia) {
        showToast("El navegador bloqueo el microfono. Usa el acceso de microfono para red local.");
        return;
    }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        showToast("En red local Chrome necesita el acceso especial de microfono. Copia la ayuda.");
        return;
    }
    sendSocket("voice-join", { channel: activeVoiceChannel });
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
    });
    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !micMuted;
    });
    inCall = true;
    callBtn.textContent = "Salir de voz";
    voiceStatus.textContent = `Conectado a ${activeVoiceName()}`;
    sendSocket("status", { status: "En llamada" });
    connectVoiceToUsers();
}

function stopVoice() {
    resetVoicePeers();
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }
    inCall = false;
    callBtn.textContent = "Entrar a voz";
    voiceStatus.textContent = "Desconectado de voz";
    sendSocket("status", { status: "En texto" });
}

function joinPrivateServer({ create = false, serverId = "", serverName = "", mode = "auto" } = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showToast("Todavia no esta conectado. Proba de nuevo en unos segundos.");
        return;
    }
    lastJoinMode = mode;
    sendSocket("join", {
        name: username,
        create,
        serverId: String(serverId || "").trim().toUpperCase(),
        serverName,
        voiceChannel: activeVoiceChannel
    });
}

function applyJoined(data) {
    currentUserId = data.clientId || currentUserId;
    currentServerId = data.serverId;
    currentServerName = data.serverName || "Voxa Room";
    currentInviteUrl = data.inviteUrl || "";
    localStorage.setItem("voxaServerId", currentServerId);
    if (location.protocol !== "file:") {
        const nextUrl = new URL(location.href);
        nextUrl.searchParams.set("server", currentServerId);
        history.replaceState(null, "", nextUrl);
    }

    state.textChannels = data.state.textChannels || state.textChannels;
    state.voiceChannels = data.state.voiceChannels || state.voiceChannels;
    state.messages = data.state.messages || fallbackMessages;
    state.users = data.state.users || [];
    activeVoiceChannel = data.state.activeVoiceChannel || activeVoiceChannel;

    connectionText.textContent = "Conectado al servidor privado";
    updateInviteText();
    renderTextChannels();
    renderMessages();
    renderUsers();
}

function applyMusicState(data, autoplay = false) {
    if (data.channel && data.channel !== activeVoiceChannel) return;
    state.songs = data.songs || state.songs;
    state.activeSong = Number(data.activeSong) || 0;
    state.playing = Boolean(data.playing);
    state.progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
    state.voiceUsers = data.users || state.voiceUsers;
    renderUsers();
    syncMusicFromState(autoplay);
    connectVoiceToUsers();
}

function changeVoiceChannel(channel) {
    if (!channel || channel === activeVoiceChannel) {
        switchView("voice");
        return;
    }
    activeVoiceChannel = channel;
    resetVoicePeers();
    stopGeneratedMusic();
    audioPlayer.pause();
    state.songs = fallbackSongs.map((song) => ({ ...song }));
    state.activeSong = 0;
    state.playing = false;
    state.progress = 0;
    state.voiceUsers = [];
    renderUsers();
    syncMusicFromState(false);
    sendSocket("voice-join", { channel });
    if (inCall) voiceStatus.textContent = `Conectado a ${activeVoiceName()}`;
    switchView("voice");
}

function connect() {
    if (!location.host || location.protocol === "file:") {
        connectionText.textContent = "Modo demo. Abri con el servidor para usarlo con amigos.";
        renderTextChannels();
        renderMessages();
        renderQueue();
        renderUsers();
        updateInviteText();
        return;
    }
    socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
    socket.addEventListener("open", () => {
        connectionText.textContent = "Conectando al servidor privado...";
        joinPrivateServer({ serverId: getRequestedServerId(), mode: "auto" });
    });
    socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "hello") currentUserId = data.id;
        if (data.type === "joined") applyJoined(data);
        if (data.type === "music-state") applyMusicState(data, false);
        if (data.type === "message") {
            if (!state.messages[data.channel]) state.messages[data.channel] = [];
            state.messages[data.channel].push(data.message);
            if (data.channel === activeChannel) renderMessages();
        }
        if (data.type === "users") {
            state.users = data.users;
            renderUsers();
            connectVoiceToUsers();
        }
        if (data.type === "channels") {
            state.textChannels = data.textChannels || state.textChannels;
            state.voiceChannels = data.voiceChannels || state.voiceChannels;
            renderTextChannels();
            renderUsers();
        }
        if (data.type === "channel-created") {
            if (!state.voiceChannels.some((channel) => channel.id === data.channel.id)) {
                state.voiceChannels.push(data.channel);
                renderUsers();
            }
            showToast(`Canal creado: ${data.channel.name}`);
        }
        if (data.type === "voice-users" && data.channel === activeVoiceChannel) {
            state.voiceUsers = data.users;
            renderUsers();
            connectVoiceToUsers();
        }
        if (data.type === "voice-joined") {
            activeVoiceChannel = data.channel;
            voiceStatus.textContent = inCall ? `Conectado a ${data.channelName}` : "Desconectado de voz";
            renderUsers();
        }
        if (data.type === "music" && data.channel === activeVoiceChannel) {
            state.activeSong = data.activeSong;
            state.playing = data.playing;
            state.progress = data.progress;
            syncMusicFromState(Boolean(data.playing));
        }
        if (data.type === "signal") {
            handleSignal(data).catch(() => showToast("No pude conectar una voz"));
        }
        if (data.type === "song-added" && data.channel === activeVoiceChannel) {
            state.songs.push(data.song);
            state.activeSong = state.songs.length - 1;
            state.progress = 0;
            renderQueue();
            syncMusicFromState(false);
            showToast("Tema agregado por " + data.by);
        }
        if (data.type === "error") {
            if (lastJoinMode === "auto" && String(data.message || "").includes("no existe")) {
                localStorage.removeItem("voxaServerId");
                currentServerId = "";
                currentInviteUrl = "";
                joinPrivateServer({ create: true, serverName: `${username} Room`, mode: "create" });
                return;
            }
            showToast(data.message || "Ocurrio un error");
        }
    });
    socket.addEventListener("close", () => {
        connectionText.textContent = "Desconectado. Reintentando...";
        window.setTimeout(connect, 1600);
    });
}

document.querySelectorAll(".rail-nav").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
});

textChannelList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-channel]");
    if (!button) return;
    activeChannel = button.dataset.channel;
    renderTextChannels();
    channelTitle.textContent = `# ${activeChannel}`;
    switchView("chat");
    renderMessages();
});

voiceChannelList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action?.dataset.action === "create-voice-channel") {
        const input = document.getElementById("newVoiceChannelInput");
        const name = input?.value.trim() || `Canal de ${username}`;
        sendSocket("channel-create", { name });
        if (input) input.value = "";
        return;
    }
    const button = event.target.closest("[data-voice-channel]");
    if (!button) return;
    changeVoiceChannel(button.dataset.voiceChannel);
});

voiceChannelList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target.id !== "newVoiceChannelInput") return;
    event.preventDefault();
    voiceChannelList.querySelector('[data-action="create-voice-channel"]')?.click();
});

messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    const now = new Date();
    const message = {
        author: username,
        initial: initial(username),
        text,
        time: now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    };
    if (!sendSocket("message", { channel: activeChannel, message })) {
        state.messages[activeChannel].push(message);
        renderMessages();
    }
    messageInput.value = "";
});

async function copyInvite() {
    const invite = networkInviteUrl();
    try {
        await navigator.clipboard.writeText(invite);
        showToast("Invitacion copiada");
    } catch {
        showToast(invite);
    }
}

document.getElementById("inviteBtn").addEventListener("click", copyInvite);
document.getElementById("inviteBtnAlt").addEventListener("click", copyInvite);

newServerBtn.addEventListener("click", () => {
    stopVoice();
    activeVoiceChannel = "lobby";
    joinPrivateServer({ create: true, serverName: `${username} Room`, mode: "create" });
});

joinServerBtn.addEventListener("click", () => {
    const code = joinServerInput.value.trim().toUpperCase();
    if (!code) return;
    stopVoice();
    activeVoiceChannel = "lobby";
    joinPrivateServer({ serverId: code, mode: "manual" });
});

joinServerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        joinServerBtn.click();
    }
});

document.getElementById("copyMicHelp").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(micHelpText());
        showToast("Ayuda de microfono copiada");
    } catch {
        showToast("No pude copiar. Mira el archivo PASAR_A_AMIGOS_MICROFONO.txt");
    }
});

callBtn.addEventListener("click", () => {
    if (inCall) {
        stopVoice();
        return;
    }
    startVoice().catch(() => showToast("Permiti el microfono para entrar a voz"));
});

document.getElementById("muteBtn").addEventListener("click", (event) => {
    event.currentTarget.classList.toggle("active");
    micMuted = event.currentTarget.classList.contains("active");
    if (localStream) localStream.getAudioTracks().forEach((track) => { track.enabled = !micMuted; });
    showToast(micMuted ? "Microfono silenciado" : "Microfono activo");
});

document.getElementById("deafenBtn").addEventListener("click", (event) => {
    event.currentTarget.classList.toggle("active");
    audioMuted = event.currentTarget.classList.contains("active");
    setRemoteMuted();
    showToast(audioMuted ? "Audio de voz silenciado" : "Audio de voz activo");
});

playPause.addEventListener("click", () => {
    const song = state.songs[state.activeSong] || state.songs[0];
    state.playing = !state.playing;
    if (song.source === "youtube" || song.source === "spotify") {
        sendSocket("music", { activeSong: state.activeSong, progress: Number(progress.value), playing: state.playing });
        syncMusicFromState(true);
        if (song.source === "spotify") showToast("Spotify requiere tocar play dentro del player");
        return;
    }
    if (state.playing) ensureAudioContext();
    sendSocket("music", { activeSong: state.activeSong, progress: Number(progress.value), playing: state.playing });
    syncMusicFromState(false);
});

document.getElementById("prevSong").addEventListener("click", () => setSong(state.activeSong - 1));
document.getElementById("nextSong").addEventListener("click", () => setSong(state.activeSong + 1));

loadSongBtn.addEventListener("click", () => {
    const url = songUrl.value.trim();
    if (!url) return;
    addSongFromUrl(url);
});

songUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        loadSongBtn.click();
    }
});

document.getElementById("focusSongInput").addEventListener("click", () => songUrl.focus());

queueList.addEventListener("click", (event) => {
    const songButton = event.target.closest("[data-song]");
    if (!songButton) return;
    setSong(Number(songButton.dataset.song));
});

progress.addEventListener("input", () => {
    state.progress = Number(progress.value);
    updateCurrentTime();
});

progress.addEventListener("change", () => {
    sendSocket("music", { activeSong: state.activeSong, progress: Number(progress.value), playing: state.playing });
});

audioPlayer.addEventListener("loadedmetadata", () => {
    const minutes = Math.floor(audioPlayer.duration / 60);
    const rest = String(Math.floor(audioPlayer.duration % 60)).padStart(2, "0");
    totalTime.textContent = `${minutes}:${rest}`;
});

audioPlayer.addEventListener("timeupdate", () => {
    if (!audioPlayer.duration || Date.now() - lastMusicSync < 1200) return;
    lastMusicSync = Date.now();
    state.progress = Math.round((audioPlayer.currentTime / audioPlayer.duration) * 100);
    progress.value = state.progress;
    updateCurrentTime();
    sendSocket("music", { activeSong: state.activeSong, progress: state.progress, playing: state.playing });
});

document.getElementById("saveNameBtn").addEventListener("click", () => {
    const nextName = nameInput.value.trim().slice(0, 24);
    if (!nextName) return;
    username = nextName;
    localStorage.setItem("salaPcName", username);
    renderProfile();
    joinPrivateServer({ serverId: currentServerId, mode: "profile" });
    showToast("Nombre guardado");
});

renderProfile();
renderTextChannels();
renderMessages();
renderQueue();
renderUsers();
updateCurrentTime();
updateInviteText();
loadConfig();
connect();
