const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_MESSAGES_PER_CHANNEL = 120;
const MAX_SONGS_PER_CHANNEL = 80;

let nextClientId = 1;

const sockets = new Map();
const servers = new Map();

const textChannels = [
    { id: "general", name: "General" },
    { id: "clips", name: "Clips" },
    { id: "musica", name: "Musica" },
    { id: "planes", name: "Planes" }
];

const voiceChannelTemplates = [
    { id: "lobby", name: "Lobby de voz" },
    { id: "musica", name: "Musica compartida" }
];

const fallbackSongs = [
    { title: "Demo Beat", artist: "Voxa", duration: "3:18", url: "", source: "demo" },
    { title: "Lobby Pulse", artist: "Voxa", duration: "2:54", url: "", source: "demo" },
    { title: "After Match", artist: "Voxa", duration: "3:42", url: "", source: "demo" }
];

function makeCode() {
    let code = "";
    do {
        code = crypto.randomBytes(4).toString("hex").toUpperCase();
    } while (servers.has(code));
    return code;
}

function makeTextState(owner) {
    const messages = {};
    for (const channel of textChannels) messages[channel.id] = [];
    messages.general.push({
        author: "Sistema",
        initial: "S",
        text: `${owner} creo este servidor privado. Solo entra quien tenga la invitacion.`,
        time: "Ahora"
    });
    messages.musica.push({
        author: "Sistema",
        initial: "S",
        text: "La musica se sincroniza solamente con el canal de voz donde estas.",
        time: "Ahora"
    });
    return messages;
}

function makeChannelId(name, existing) {
    const base = String(name || "canal")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "canal";
    let id = base;
    let count = 2;
    while (existing[id]) {
        id = `${base}-${count}`;
        count += 1;
    }
    return id;
}

function makeVoiceState(voiceChannels) {
    const state = {};
    for (const channel of voiceChannels) {
        state[channel.id] = makeEmptyVoiceChannel(channel);
    }
    return state;
}

function makeEmptyVoiceChannel(channel) {
    return {
        id: channel.id,
        name: channel.name,
        users: [],
        songs: fallbackSongs.map((song) => ({ ...song })),
        activeSong: 0,
        playing: false,
        progress: 0
    };
}

function createPrivateServer(name, owner) {
    const id = makeCode();
    const safeName = String(name || `${owner || "Voxa"} Room`).slice(0, 40);
    const defaultVoiceChannels = voiceChannelTemplates.map((channel) => ({ ...channel }));
    const server = {
        id,
        name: safeName,
        owner: String(owner || "Invitado").slice(0, 24),
        textChannels: textChannels.map((channel) => ({ ...channel })),
        voiceChannelList: defaultVoiceChannels,
        messages: makeTextState(owner || "Invitado"),
        voiceChannels: makeVoiceState(defaultVoiceChannels),
        createdAt: Date.now()
    };
    servers.set(id, server);
    return server;
}

function createVoiceChannel(server, name) {
    const channelName = String(name || "Nuevo canal").trim().slice(0, 32) || "Nuevo canal";
    const id = makeChannelId(channelName, server.voiceChannels);
    const channel = { id, name: channelName };
    server.voiceChannelList.push(channel);
    server.voiceChannels[id] = makeEmptyVoiceChannel(channel);
    return channel;
}

function getServer(id) {
    return servers.get(String(id || "").trim().toUpperCase());
}

function localIp() {
    const networks = os.networkInterfaces();
    const addresses = [];
    for (const values of Object.values(networks)) {
        for (const value of values || []) {
            if (value.family === "IPv4" && !value.internal) addresses.push(value.address);
        }
    }
    return addresses.find((address) => (
        address.startsWith("192.168.") ||
        address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
    )) || addresses[0] || "localhost";
}

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
};

function sendFile(response, filePath) {
    const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
    const fullPath = path.join(ROOT, safePath);
    if (!fullPath.startsWith(ROOT)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.readFile(fullPath, (error, content) => {
        if (error) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }
        response.writeHead(200, { "Content-Type": mimeTypes[path.extname(fullPath)] || "application/octet-stream" });
        response.end(content);
    });
}

function frame(data) {
    const payload = Buffer.from(JSON.stringify(data));
    const length = payload.length;
    let header;

    if (length < 126) {
        header = Buffer.alloc(2);
        header[1] = length;
    } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
    }

    header[0] = 0x81;
    return Buffer.concat([header, payload]);
}

function parse(buffer) {
    const opcode = buffer[0] & 0x0f;
    if (opcode !== 0x1) return null;

    const second = buffer[1];
    const masked = (second & 0x80) === 0x80;
    let length = second & 127;
    let offset = 2;

    if (length === 126) {
        length = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (length === 127) {
        length = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
    }

    let mask = Buffer.alloc(4);
    if (masked) {
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
    }

    const payload = buffer.subarray(offset, offset + length);
    const decoded = Buffer.alloc(payload.length);

    for (let index = 0; index < payload.length; index += 1) {
        decoded[index] = masked ? payload[index] ^ mask[index % 4] : payload[index];
    }

    return JSON.parse(decoded.toString("utf8"));
}

function send(socket, data) {
    try {
        if (!socket.destroyed && socket.writable) socket.write(frame(data));
    } catch {
        sockets.delete(socket);
    }
}

function inviteUrl(request, serverId) {
    const host = request?.headers?.host || `localhost:${PORT}`;
    return `http://${host}/chat-app.html?server=${encodeURIComponent(serverId)}`;
}

function serverClients(serverId) {
    return [...sockets.entries()].filter(([, client]) => client.serverId === serverId);
}

function voiceClients(serverId, voiceChannel) {
    return serverClients(serverId).filter(([, client]) => client.voiceChannel === voiceChannel);
}

function publicUsers(serverId) {
    return serverClients(serverId).map(([, client]) => ({
        id: client.id,
        name: client.name,
        status: client.status,
        voiceChannel: client.voiceChannel
    }));
}

function voiceUsers(serverId, voiceChannel) {
    return voiceClients(serverId, voiceChannel).map(([, client]) => ({
        id: client.id,
        name: client.name,
        status: client.status,
        voiceChannel: client.voiceChannel
    }));
}

function broadcastServer(serverId, data) {
    for (const [socket] of serverClients(serverId)) send(socket, data);
}

function broadcastVoice(serverId, voiceChannel, data) {
    for (const [socket] of voiceClients(serverId, voiceChannel)) send(socket, data);
}

function syncUsers(serverId) {
    if (!serverId || !servers.has(serverId)) return;
    broadcastServer(serverId, { type: "users", users: publicUsers(serverId) });
}

function syncVoiceUsers(serverId, voiceChannel) {
    const server = servers.get(serverId);
    if (!server || !server.voiceChannels[voiceChannel]) return;
    server.voiceChannels[voiceChannel].users = voiceUsers(serverId, voiceChannel);
    broadcastVoice(serverId, voiceChannel, {
        type: "voice-users",
        channel: voiceChannel,
        users: server.voiceChannels[voiceChannel].users
    });
}

function syncMusic(socket, server, voiceChannel) {
    const music = server.voiceChannels[voiceChannel] || server.voiceChannels.lobby;
    send(socket, {
        type: "music-state",
        channel: music.id,
        songs: music.songs,
        activeSong: music.activeSong,
        playing: music.playing,
        progress: music.progress,
        users: music.users
    });
}

function joinServer(socket, data, request) {
    const client = sockets.get(socket);
    if (!client) return;

    const previousServerId = client.serverId;
    const previousVoiceChannel = client.voiceChannel;

    client.name = String(data.name || client.name || "Invitado").slice(0, 24);
    client.status = "En texto";

    let server = null;
    if (data.create) server = createPrivateServer(data.serverName, client.name);
    else if (data.serverId) server = getServer(data.serverId);

    if (!server && data.serverId && !data.create) {
        send(socket, { type: "error", message: "Ese servidor privado no existe." });
        return;
    }

    if (!server) {
        server = createPrivateServer(data.serverName || `${client.name} Room`, client.name);
    }

    client.serverId = server.id;
    client.voiceChannel = server.voiceChannels[data.voiceChannel] ? data.voiceChannel : "lobby";

    send(socket, {
        type: "joined",
        clientId: client.id,
        serverId: server.id,
        serverName: server.name,
        inviteUrl: inviteUrl(request, server.id),
        state: {
            textChannels: server.textChannels,
            voiceChannels: server.voiceChannelList,
            messages: server.messages,
            users: publicUsers(server.id),
            activeVoiceChannel: client.voiceChannel
        }
    });
    syncMusic(socket, server, client.voiceChannel);

    if (previousServerId && previousServerId !== server.id) syncUsers(previousServerId);
    if (previousServerId && previousVoiceChannel) syncVoiceUsers(previousServerId, previousVoiceChannel);
    syncUsers(server.id);
    syncVoiceUsers(server.id, client.voiceChannel);
}

function moveVoiceChannel(socket, channelId) {
    const client = sockets.get(socket);
    if (!client?.serverId) return;
    const server = servers.get(client.serverId);
    if (!server?.voiceChannels[channelId]) return;

    const previousChannel = client.voiceChannel;
    if (previousChannel === channelId) {
        syncMusic(socket, server, channelId);
        return;
    }

    client.voiceChannel = channelId;
    client.status = "En llamada";

    send(socket, { type: "voice-joined", channel: channelId, channelName: server.voiceChannels[channelId].name });
    syncUsers(server.id);
    syncVoiceUsers(server.id, previousChannel);
    syncVoiceUsers(server.id, channelId);
    syncMusic(socket, server, channelId);
}

function handleMessage(socket, data, request) {
    const client = sockets.get(socket);
    if (!client) return;

    if (data.type === "join") {
        joinServer(socket, data, request);
        return;
    }

    if (!client.serverId) {
        send(socket, { type: "error", message: "Primero entra a un servidor." });
        return;
    }

    const server = servers.get(client.serverId);
    if (!server) return;

    if (data.type === "message" && server.messages[data.channel]) {
        const message = {
            author: String(data.message.author || client.name).slice(0, 24),
            initial: String(data.message.initial || client.name[0] || "?").slice(0, 2),
            text: String(data.message.text || "").slice(0, 600),
            time: String(data.message.time || "Ahora").slice(0, 12)
        };
        server.messages[data.channel].push(message);
        server.messages[data.channel] = server.messages[data.channel].slice(-MAX_MESSAGES_PER_CHANNEL);
        broadcastServer(server.id, { type: "message", channel: data.channel, message });
        return;
    }

    if (data.type === "status") {
        client.status = String(data.status || "En linea").slice(0, 32);
        syncUsers(server.id);
        syncVoiceUsers(server.id, client.voiceChannel);
        return;
    }

    if (data.type === "voice-join") {
        moveVoiceChannel(socket, String(data.channel || "lobby"));
        return;
    }

    if (data.type === "channel-create") {
        if (server.voiceChannelList.length >= 40) {
            send(socket, { type: "error", message: "Este servidor ya tiene demasiados canales." });
            return;
        }
        const channel = createVoiceChannel(server, data.name);
        broadcastServer(server.id, {
            type: "channels",
            textChannels: server.textChannels,
            voiceChannels: server.voiceChannelList
        });
        broadcastServer(server.id, {
            type: "channel-created",
            channel,
            by: client.name
        });
        moveVoiceChannel(socket, channel.id);
        return;
    }

    if (data.type === "music") {
        const music = server.voiceChannels[client.voiceChannel];
        if (!music) return;
        music.activeSong = Math.max(0, Math.min(music.songs.length - 1, Number(data.activeSong) || 0));
        music.playing = Boolean(data.playing);
        music.progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
        broadcastVoice(server.id, client.voiceChannel, {
            type: "music",
            channel: client.voiceChannel,
            activeSong: music.activeSong,
            playing: music.playing,
            progress: music.progress
        });
        return;
    }

    if (data.type === "song-add") {
        const music = server.voiceChannels[client.voiceChannel];
        if (!music) return;
        const song = {
            title: String(data.song.title || "Tema compartido").slice(0, 60),
            artist: String(data.song.artist || client.name).slice(0, 40),
            duration: String(data.song.duration || "--:--").slice(0, 8),
            url: String(data.song.url || "").slice(0, 500),
            source: String(data.song.source || "audio").slice(0, 16),
            videoId: String(data.song.videoId || "").slice(0, 32),
            embedUrl: String(data.song.embedUrl || "").slice(0, 500)
        };
        music.songs.push(song);
        music.songs = music.songs.slice(-MAX_SONGS_PER_CHANNEL);
        music.activeSong = music.songs.length - 1;
        music.progress = 0;
        broadcastVoice(server.id, client.voiceChannel, { type: "song-added", channel: client.voiceChannel, song, by: client.name });
        broadcastVoice(server.id, client.voiceChannel, {
            type: "music",
            channel: client.voiceChannel,
            activeSong: music.activeSong,
            playing: music.playing,
            progress: 0
        });
        return;
    }

    if (data.type === "signal") {
        for (const [targetSocket, targetClient] of sockets.entries()) {
            const samePrivateRoom = targetClient.serverId === client.serverId && targetClient.voiceChannel === client.voiceChannel;
            if (targetClient.id === data.to && samePrivateRoom) {
                send(targetSocket, { type: "signal", from: client.id, signal: data.signal });
                break;
            }
        }
    }
}

function cleanupSocket(socket) {
    const client = sockets.get(socket);
    sockets.delete(socket);
    if (!client) return;
    syncUsers(client.serverId);
    syncVoiceUsers(client.serverId, client.voiceChannel);
}

const webServer = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/voxa-config.json") {
        const ip = localIp();
        const body = JSON.stringify({
            port: PORT,
            localUrl: `http://localhost:${PORT}/chat-app.html`,
            lanUrl: `http://${ip}:${PORT}/chat-app.html`,
            origin: `http://${ip}:${PORT}`
        });
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(body);
        return;
    }
    const pathname = url.pathname === "/" ? "/chat-app.html" : decodeURIComponent(url.pathname);
    sendFile(response, pathname);
});

webServer.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    const accept = crypto
        .createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");

    socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        ""
    ].join("\r\n"));

    const id = `u${nextClientId++}`;
    sockets.set(socket, {
        id,
        name: "Invitado",
        status: "Conectando",
        serverId: "",
        voiceChannel: "lobby"
    });
    send(socket, { type: "hello", id });

    socket.on("data", (buffer) => {
        try {
            const data = parse(buffer);
            if (data) handleMessage(socket, data, request);
        } catch {
            send(socket, { type: "error", message: "Mensaje invalido" });
        }
    });

    socket.on("error", () => cleanupSocket(socket));
    socket.on("close", () => cleanupSocket(socket));
    socket.on("end", () => cleanupSocket(socket));
});

webServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Voxa listo en http://localhost:${PORT}/chat-app.html`);
    console.log(`Para amigos en la misma red: http://${localIp()}:${PORT}/chat-app.html`);
});
