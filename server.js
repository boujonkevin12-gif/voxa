const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
let nextClientId = 1;

const state = {
    messages: {
        general: [
            { author: "Sistema", initial: "S", text: "Sala lista. Comparti el link con tus amigos en la misma red.", time: "Ahora" }
        ],
        clips: [],
        musica: [],
        planes: []
    },
    songs: [
        { title: "Demo Beat", artist: "Voxa", duration: "3:18", url: "", source: "demo" },
        { title: "Lobby Pulse", artist: "Voxa", duration: "2:54", url: "", source: "demo" },
        { title: "After Match", artist: "Voxa", duration: "3:42", url: "", source: "demo" }
    ],
    activeSong: 0,
    playing: false,
    progress: 35,
    users: []
};

const sockets = new Map();

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

function users() {
    return [...sockets.values()].map((client) => ({
        id: client.id,
        name: client.name,
        status: client.status
    }));
}

function broadcast(data) {
    for (const socket of sockets.keys()) send(socket, data);
}

function syncUsers() {
    state.users = users();
    broadcast({ type: "users", users: state.users });
}

function handleMessage(socket, data) {
    const client = sockets.get(socket);
    if (!client) return;

    if (data.type === "join") {
        client.name = String(data.name || "Invitado").slice(0, 24);
        client.status = "En texto";
        state.users = users();
        send(socket, { type: "hello", id: client.id });
        send(socket, { type: "state", state });
        syncUsers();
    }

    if (data.type === "message" && state.messages[data.channel]) {
        const message = {
            author: String(data.message.author || client.name).slice(0, 24),
            initial: String(data.message.initial || client.name[0] || "?").slice(0, 2),
            text: String(data.message.text || "").slice(0, 600),
            time: String(data.message.time || "Ahora").slice(0, 12)
        };
        state.messages[data.channel].push(message);
        state.messages[data.channel] = state.messages[data.channel].slice(-80);
        broadcast({ type: "message", channel: data.channel, message });
    }

    if (data.type === "status") {
        client.status = String(data.status || "En linea").slice(0, 32);
        syncUsers();
    }

    if (data.type === "music") {
        state.activeSong = Number(data.activeSong) || 0;
        state.playing = Boolean(data.playing);
        state.progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
        broadcast({
            type: "music",
            activeSong: state.activeSong,
            playing: state.playing,
            progress: state.progress
        });
    }

    if (data.type === "song-add") {
        const song = {
            title: String(data.song.title || "Tema compartido").slice(0, 60),
            artist: String(data.song.artist || client.name).slice(0, 40),
            duration: String(data.song.duration || "--:--").slice(0, 8),
            url: String(data.song.url || "").slice(0, 500),
            source: String(data.song.source || "audio").slice(0, 16),
            videoId: String(data.song.videoId || "").slice(0, 32),
            embedUrl: String(data.song.embedUrl || "").slice(0, 500)
        };
        state.songs.push(song);
        state.activeSong = state.songs.length - 1;
        broadcast({ type: "song-added", song, by: client.name });
        broadcast({ type: "music", activeSong: state.activeSong, playing: state.playing, progress: 0 });
    }

    if (data.type === "signal") {
        for (const [targetSocket, targetClient] of sockets.entries()) {
            if (targetClient.id === data.to) {
                send(targetSocket, { type: "signal", from: client.id, signal: data.signal });
                break;
            }
        }
    }
}

const server = http.createServer((request, response) => {
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

server.on("upgrade", (request, socket) => {
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

    sockets.set(socket, { id: `u${nextClientId++}`, name: "Invitado", status: "Conectando" });

    socket.on("data", (buffer) => {
        try {
            const data = parse(buffer);
            if (data) handleMessage(socket, data);
        } catch {
            send(socket, { type: "error", message: "Mensaje invalido" });
        }
    });

    socket.on("error", () => {
        sockets.delete(socket);
        syncUsers();
    });

    socket.on("close", () => {
        sockets.delete(socket);
        syncUsers();
    });

    socket.on("end", () => {
        sockets.delete(socket);
        syncUsers();
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Sala PC lista en http://localhost:${PORT}/chat-app.html`);
    console.log(`Para amigos en la misma red: http://${localIp()}:${PORT}/chat-app.html`);
});
