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
const callBtnMini = document.getElementById("callBtnMini");
const voiceStatus = document.getElementById("voiceStatus");
const voiceChannelTitle = document.getElementById("voiceChannelTitle");
const connectionText = document.getElementById("connectionText");
const connectedCount = document.getElementById("connectedCount");
const friendsList = document.getElementById("friendsList");
const sideFriendsList = document.getElementById("sideFriendsList");
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
const vmpSongTitle = document.getElementById("vmpSongTitle");
const vmpSongArtist = document.getElementById("vmpSongArtist");
const vmpPlayPause = document.getElementById("vmpPlayPause");
const vmpPrev = document.getElementById("vmpPrev");
const vmpNext = document.getElementById("vmpNext");
const vmpProgress = document.getElementById("vmpProgress");
const vmpCurrentTime = document.getElementById("vmpCurrentTime");
const vmpTotalTime = document.getElementById("vmpTotalTime");
const vmpSongUrl = document.getElementById("vmpSongUrl");
const vmpLoadBtn = document.getElementById("vmpLoadBtn");
const vmpQueueList = document.getElementById("vmpQueueList");
const voiceUsersList = document.getElementById("voiceUsersList");
const voiceUserCount = document.getElementById("voiceUserCount");

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
let username = localStorage.getItem("salaPcName") || "User";
let currentUserId = "";
let currentServerId = "";
let currentServerName = "Voxa Room";
let currentInviteUrl = "";
let lastMusicSync = 0;
let pendingAudioPlay = false;
let audioRetryTimer = null;
let lastAudioPlayError = 0;
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
let userVolumes = {};
let voiceAnalyserNodes = new Map();
let voiceActivityTimer = null;
let speakingUsers = new Set();
let voiceActivityThreshold = 0.02;

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

function renderVoiceMusicPlayer() {
    const song = state.songs[state.activeSong] || state.songs[0];
    vmpSongTitle.textContent = song.title;
    vmpSongArtist.textContent = `${song.artist} - ${activeVoiceName()}`;
    vmpTotalTime.textContent = song.duration || "--:--";
    vmpProgress.value = state.progress || 0;
    vmpPlayPause.innerHTML = state.playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';

    vmpQueueList.innerHTML = state.songs.map((item, index) => `
        <div class="vmp-queue-item ${index === state.activeSong ? "active" : ""}" data-vmp-song="${index}">
            <div>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.artist)}</small>
            </div>
            <small>${escapeHtml(item.duration || "--:--")}</small>
        </div>
    `).join("");

    const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 198;
    const seconds = Math.round((Number(vmpProgress.value) / 100) * duration);
    vmpCurrentTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function startVoiceActivityDetection() {
    stopVoiceActivityDetection();
    for (const [peerId, audioEl] of Object.entries(remoteAudio.querySelectorAll("audio"))) {
        const peerIdFromEl = audioEl.id.replace("voice-", "");
        if (!peerIdFromEl || voiceAnalyserNodes.has(peerIdFromEl)) continue;
        if (!audioEl.srcObject) continue;
        try {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(audioEl.srcObject);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            voiceAnalyserNodes.set(peerIdFromEl, { analyser, ctx, source });
        } catch {}
    }
    if (!voiceActivityTimer) {
        voiceActivityTimer = window.setInterval(checkVoiceActivity, 200);
    }
}

function stopVoiceActivityDetection() {
    if (voiceActivityTimer) {
        window.clearInterval(voiceActivityTimer);
        voiceActivityTimer = null;
    }
}

function checkVoiceActivity() {
    for (const [peerId, { analyser }] of voiceAnalyserNodes) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const value = (data[i] - 128) / 128;
            sum += value * value;
        }
        const rms = Math.sqrt(sum / data.length);
        const wasSpeaking = speakingUsers.has(peerId);
        if (rms > voiceActivityThreshold) {
            speakingUsers.add(peerId);
        } else {
            speakingUsers.delete(peerId);
        }
        if (wasSpeaking !== speakingUsers.has(peerId)) {
            renderVoiceUsers();
        }
    }
}

function renderVoiceUsers() {
    const users = state.voiceUsers || [];
    voiceUserCount.textContent = users.length;

    voiceUsersList.innerHTML = users.map((user) => {
        const isSpeaking = speakingUsers.has(user.id);
        const vol = userVolumes[user.id] !== undefined ? userVolumes[user.id] : 1;
        return `
            <div class="voice-user-card ${isSpeaking ? "speaking" : ""}" data-peer="${escapeHtml(user.id)}">
                <div class="avatar-wrapper">
                    <div class="avatar voice-user-avatar">${escapeHtml(initial(user.name))}</div>
                    <span class="status-dot ${isSpeaking ? "" : ""}"></span>
                </div>
                <div>
                    <strong>${escapeHtml(user.name)}</strong>
                    <small>${escapeHtml(voiceStateLabel(user))}</small>
                </div>
                <span class="voice-badge ${user.micMuted ? "muted" : user.audioMuted ? "deafened" : ""}" title="${escapeHtml(voiceStateLabel(user))}">
                    <i class="fa-solid ${voiceIconFor(user)}"></i>
                </span>
            </div>
        `;
    }).join("");

    const oldRemoteAudio = document.getElementById("voiceUsersList");
    if (oldRemoteAudio) {
        oldRemoteAudio.querySelectorAll(".voice-vol-slider").forEach((slider) => {
            slider.addEventListener("input", (e) => {
                const peerId = e.target.dataset.peer;
                const vol = parseFloat(e.target.value);
                userVolumes[peerId] = vol;
                const audio = document.getElementById(`voice-${peerId}`);
                if (audio) audio.volume = vol;
            });
        });
    }
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
        <div class="block-label"><i class="fa-solid fa-chevron-down"></i> Texto</div>
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

function voiceMembersFor(channelId) {
    return state.users.filter((user) => user.voiceChannel === channelId && user.inVoice);
}

function voiceIconFor(user) {
    if (user.audioMuted) return "fa-volume-xmark";
    if (user.micMuted) return "fa-microphone-slash";
    return "fa-microphone-lines";
}

function voiceStateLabel(user) {
    if (user.audioMuted) return "Sin audio";
    if (user.micMuted) return "Muteado";
    return user.status || "En voz";
}

function renderVoiceChannels() {
    voiceChannelTitle.textContent = activeVoiceName();
    voiceChannelList.innerHTML = `
        <div class="block-label"><i class="fa-solid fa-chevron-down"></i> Voz</div>
        ${state.voiceChannels.map((channel) => {
            const members = voiceMembersFor(channel.id);
            return `
                <button class="voice-channel ${channel.id === activeVoiceChannel ? "active" : ""}" type="button" data-voice-channel="${escapeHtml(channel.id)}">
                    <span class="voice-channel-main">
                        <i class="fa-solid fa-volume-high"></i>
                        <span>${escapeHtml(channel.name)}</span>
                    </span>
                    <span class="voice-count">${members.length}</span>
                </button>
                <div class="voice-members channel-members">
                    ${members.slice(0, 5).map((user) => `
                        <div class="voice-member-item">
                            <div class="avatar-wrapper">
                                <div class="member-avatar">${escapeHtml(initial(user.name))}</div>
                                <span class="status-dot"></span>
                            </div>
                            <span class="member-name">${escapeHtml(user.name)}</span>
                        </div>
                    `).join("")}
                    ${members.length > 5 ? `<div class="voice-member-item"><span class="member-name" style="font-size:11px;color:var(--muted)">+${members.length - 5} mas</span></div>` : ""}
                </div>
            `;
        }).join("")}
        <div class="create-channel-row">
            <input id="newVoiceChannelInput" type="text" maxlength="32" placeholder="Nuevo canal">
            <button type="button" data-action="create-voice-channel" title="Crear canal"><i class="fa-solid fa-plus"></i></button>
        </div>
    `;
}

function renderMessages() {
    const messages = state.messages[activeChannel] || [];
    messagesEl.innerHTML = messages.map((message) => `
        <article class="message">
            <div class="avatar-wrapper">
                <div class="avatar" style="width:36px;height:36px;font-size:13px">${escapeHtml(message.initial || initial(message.author))}</div>
            </div>
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
            <div class="avatar-wrapper">
                <div class="avatar">${escapeHtml(initial(user.name))}</div>
                <span class="status-dot"></span>
            </div>
            <div>
                <strong>${escapeHtml(user.name)}</strong>
                <small>${escapeHtml(user.status || "En linea")}</small>
            </div>
        </div>
    `).join("");
}

function voiceUserRows(users) {
    if (!users.length) {
        return `<div class="empty-voice">Todavia no hay nadie en este canal.</div>`;
    }
    return users.map((user) => `
        <div class="voice-user-card">
            <div class="avatar-wrapper">
                <div class="avatar voice-user-avatar">${escapeHtml(initial(user.name))}</div>
                <span class="status-dot"></span>
            </div>
            <div>
                <strong>${escapeHtml(user.name)}</strong>
                <small>${escapeHtml(voiceStateLabel(user))}</small>
            </div>
            <span class="voice-badge" title="${escapeHtml(voiceStateLabel(user))}">
                <i class="fa-solid ${voiceIconFor(user)}"></i>
            </span>
        </div>
    `).join("");
}

function renderUsers() {
    const users = state.users.length ? state.users : [{ name: username, status: "En el servidor" }];
    connectedCount.textContent = `${users.length} conectado${users.length === 1 ? "" : "s"}`;
    renderVoiceUsers();
    sideFriendsList.innerHTML = userRows(users);
    friendsList.innerHTML = users.map((user) => `
        <article class="friend-card">
            <div class="avatar-wrapper">
                <div class="avatar">${escapeHtml(initial(user.name))}</div>
                <span class="status-dot"></span>
            </div>
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
    songArtist.textContent = `${song.artist} - ${activeVoiceName()}`;
    sideSongTitle.textContent = song.title;
    sideSongArtist.textContent = activeVoiceName();
    totalTime.textContent = song.duration || "--:--";
    progress.value = state.progress || 0;

    if (song.source === "audio" && song.url) {
        const nextSrc = new URL(song.url, location.href).href;
        if (audioPlayer.src !== nextSrc) {
            audioPlayer.src = song.url;
            audioPlayer.load();
            pendingAudioPlay = state.playing;
        }
    } else {
        pendingAudioPlay = false;
        window.clearTimeout(audioRetryTimer);
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

function playVoiceEventSound(action) {
    try {
        ensureAudioContext();
        const patterns = {
            join: [[660, 0], [880, 90]],
            leave: [[520, 0], [330, 95]],
            mute: [[260, 0]],
            unmute: [[440, 0], [660, 70]],
            deafen: [[220, 0], [180, 90]],
            undeafen: [[360, 0], [520, 75]]
        };
        for (const [frequency, delay] of patterns[action] || patterns.join) {
            window.setTimeout(() => playTone(frequency, 0.09, "sine", 0.2), delay);
        }
    } catch {
        // Browsers can block audio until the first click; the next user action will enable it.
    }
}

function announceVoiceEvent(data) {
    const actionText = {
        join: "entro al canal",
        leave: "salio del canal",
        mute: "se muteo",
        unmute: "se desmuteo",
        deafen: "silencio el audio",
        undeafen: "activo el audio"
    };
    if (data.userId !== currentUserId) {
        playVoiceEventSound(data.action);
        showToast(`${data.user || "Alguien"} ${actionText[data.action] || "actualizo voz"}`);
    }
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

function syncAudioPosition() {
    const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
    if (!duration) return;
    const nextTime = (Number(progress.value) / 100) * duration;
    if (Math.abs(audioPlayer.currentTime - nextTime) > 2) audioPlayer.currentTime = nextTime;
}

function queueAudioPlayRetry(delay = 900) {
    window.clearTimeout(audioRetryTimer);
    audioRetryTimer = window.setTimeout(() => {
        if (pendingAudioPlay && state.playing) playAudioDirect(true);
    }, delay);
}

function playAudioDirect(isRetry = false) {
    if (!state.playing) return;
    pendingAudioPlay = true;
    syncAudioPosition();
    const playPromise = audioPlayer.play();
    if (!playPromise?.catch) {
        pendingAudioPlay = false;
        return;
    }
    playPromise
        .then(() => {
            pendingAudioPlay = false;
            lastAudioPlayError = 0;
        })
        .catch(() => {
            pendingAudioPlay = true;
            if (document.hidden) {
                queueAudioPlayRetry(1200);
                return;
            }
            if (!isRetry || Date.now() - lastAudioPlayError > 3000) {
                lastAudioPlayError = Date.now();
                showToast("El navegador freno el audio. Toca Play una vez para reactivarlo.");
            } else {
                queueAudioPlayRetry(900);
            }
        });
}

function syncMusicFromState(autoplayEmbed = false) {
    const song = state.songs[state.activeSong] || state.songs[0];
    progress.value = state.progress || 0;
    renderVoiceMusicPlayer();
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
            playAudioDirect(false);
        } else {
            pendingAudioPlay = false;
            window.clearTimeout(audioRetryTimer);
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
        renderQueue();
        renderVoiceMusicPlayer();
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
    playVoiceEventSound("join");
    sendSocket("voice-join", { channel: activeVoiceChannel, active: true });
    sendSocket("voice-state", { micMuted, audioMuted });
    sendSocket("status", { status: "En llamada" });
    connectVoiceToUsers();
    startVoiceActivityDetection();
}

function stopVoice() {
    stopVoiceActivityDetection();
    voiceAnalyserNodes.forEach(({ ctx }) => ctx.close());
    voiceAnalyserNodes.clear();
    speakingUsers.clear();
    resetVoicePeers();
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }
    inCall = false;
    callBtn.textContent = "Entrar a voz";
    voiceStatus.textContent = "Desconectado de voz";
    playVoiceEventSound("leave");
    sendSocket("voice-leave");
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
    renderVoiceUsers();
    renderVoiceMusicPlayer();
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
    sendSocket("voice-join", { channel, active: inCall });
    if (inCall) voiceStatus.textContent = `Conectado a ${activeVoiceName()}`;
    switchView("voice");
}

function connect() {
    if (!location.host || location.protocol === "file:") {
        connectionText.textContent = "Modo demo. Abri con el servidor para usarlo con amigos.";
        renderTextChannels();
        renderMessages();
        renderQueue();
        renderVoiceMusicPlayer();
        renderVoiceUsers();
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
        if (data.type === "music-state") applyMusicState(data, Boolean(data.autoplay));
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
        if (data.type === "voice-event" && data.channel === activeVoiceChannel) {
            announceVoiceEvent(data);
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
            if (data.by !== username) playVoiceEventSound("join");
            showToast(`${data.title || "Tema"} agregado por ${data.by}`);
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
    event.currentTarget.classList.toggle("mic-muted");
    event.currentTarget.classList.toggle("active");
    micMuted = event.currentTarget.classList.contains("mic-muted");
    if (localStream) localStream.getAudioTracks().forEach((track) => { track.enabled = !micMuted; });
    playVoiceEventSound(micMuted ? "mute" : "unmute");
    sendSocket("voice-state", { micMuted, audioMuted });
    showToast(micMuted ? "Microfono silenciado" : "Microfono activo");
});

document.getElementById("deafenBtn").addEventListener("click", (event) => {
    event.currentTarget.classList.toggle("audio-off");
    event.currentTarget.classList.toggle("active");
    audioMuted = event.currentTarget.classList.contains("audio-off");
    setRemoteMuted();
    playVoiceEventSound(audioMuted ? "deafen" : "undeafen");
    sendSocket("voice-state", { micMuted, audioMuted });
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

vmpPlayPause.addEventListener("click", () => {
    const song = state.songs[state.activeSong] || state.songs[0];
    state.playing = !state.playing;
    if (state.playing) ensureAudioContext();
    sendSocket("music", { activeSong: state.activeSong, progress: Number(vmpProgress.value), playing: state.playing });
    syncMusicFromState(false);
});

vmpPrev.addEventListener("click", () => {
    const idx = (state.activeSong - 1 + state.songs.length) % state.songs.length;
    state.activeSong = idx;
    state.progress = 0;
    sendSocket("music", { activeSong: idx, progress: 0, playing: state.playing });
    syncMusicFromState(false);
});

vmpNext.addEventListener("click", () => {
    const idx = (state.activeSong + 1) % state.songs.length;
    state.activeSong = idx;
    state.progress = 0;
    sendSocket("music", { activeSong: idx, progress: 0, playing: state.playing });
    syncMusicFromState(false);
});

vmpLoadBtn.addEventListener("click", () => {
    const url = vmpSongUrl.value.trim();
    if (!url) return;
    addSongFromUrl(url);
    vmpSongUrl.value = "";
});

vmpSongUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        vmpLoadBtn.click();
    }
});

vmpQueueList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-vmp-song]");
    if (!item) return;
    const idx = Number(item.dataset.vmp-song);
    state.activeSong = idx;
    state.progress = 0;
    sendSocket("music", { activeSong: idx, progress: 0, playing: state.playing });
    syncMusicFromState(false);
});

vmpProgress.addEventListener("input", () => {
    state.progress = Number(vmpProgress.value);
    const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 198;
    const seconds = Math.round((Number(vmpProgress.value) / 100) * duration);
    vmpCurrentTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});

vmpProgress.addEventListener("change", () => {
    sendSocket("music", { activeSong: state.activeSong, progress: Number(vmpProgress.value), playing: state.playing });
});

callBtnMini.addEventListener("click", () => {
    if (inCall) stopVoice();
});

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

document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!state.playing) return;
    const song = state.songs[state.activeSong] || state.songs[0];
    if (song.source === "audio" && song.url) {
        if (audioPlayer.paused || pendingAudioPlay) {
            syncAudioPosition();
            playAudioDirect(true);
        }
        return;
    }
    if (song.source === "youtube" && song.videoId) {
        hideFrames();
        syncEmbed(song, true);
        return;
    }
    if (song.source === "spotify" && song.embedUrl) {
        hideFrames();
        syncEmbed(song, true);
    }
});

audioPlayer.addEventListener("loadedmetadata", () => {
    const minutes = Math.floor(audioPlayer.duration / 60);
    const rest = String(Math.floor(audioPlayer.duration % 60)).padStart(2, "0");
    totalTime.textContent = `${minutes}:${rest}`;
    syncAudioPosition();
});

audioPlayer.addEventListener("canplay", () => {
    if (pendingAudioPlay && state.playing) playAudioDirect(true);
});

audioPlayer.addEventListener("playing", () => {
    pendingAudioPlay = false;
    window.clearTimeout(audioRetryTimer);
});

audioPlayer.addEventListener("pause", () => {
    if (!state.playing) pendingAudioPlay = false;
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
renderVoiceMusicPlayer();
renderVoiceUsers();
renderUsers();
updateCurrentTime();
updateInviteText();
loadConfig();
connect();
