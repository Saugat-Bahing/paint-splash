import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Room } from "./Room.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 5173;
const rooms = new Map();
const server = createServer();
let vite;

if (!production) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { server },
      // Allow Cloudflare Quick Tunnel hostnames; Vite blocks unknown Host headers by default.
      allowedHosts: [".trycloudflare.com"],
    },
    appType: "spa",
  });
  server.on("request", vite.middlewares);
} else {
  const dist = resolve(root, "dist");
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };

  server.on("request", async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let filePath = resolve(dist, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!filePath.startsWith(`${dist}${sep}`) && filePath !== dist) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      try {
        if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, "index.html");
      } catch {
        filePath = resolve(dist, "index.html");
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
        "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500).end("Server error");
      console.error(error);
    }
  });
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url, "http://localhost").pathname !== "/ws") return;
  wss.handleUpgrade(request, socket, head, (webSocket) => {
    wss.emit("connection", webSocket, request);
  });
});

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function playerName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 14) : "";
  return name || "Player";
}

function createRoom() {
  const code = roomCode();
  const room = new Room(code, (emptyCode) => rooms.delete(emptyCode));
  rooms.set(code, room);
  return room;
}

wss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });

  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid message." }));
      return;
    }

    try {
      if (message.type === "create") {
        if (socket.room) socket.room.removePlayer(socket.playerId);
        createRoom().addPlayer(socket, playerName(message.name));
        return;
      }

      if (message.type === "join") {
        const code = typeof message.roomCode === "string" ? message.roomCode.trim().toUpperCase() : "";
        const room = rooms.get(code);
        if (!room) throw new Error("Room not found. Check the code and try again.");
        if (socket.room) socket.room.removePlayer(socket.playerId);
        room.addPlayer(socket, playerName(message.name));
        return;
      }

      socket.room?.handle(socket.playerId, message);
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", message: error.message || "Something went wrong." }));
    }
  });

  socket.on("close", () => {
    socket.room?.removePlayer(socket.playerId);
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);

const simulation = setInterval(() => {
  for (const room of rooms.values()) room.update();
}, 1000 / 60);

server.listen(port, "0.0.0.0", () => {
  console.log(`Turf Tussle ${production ? "production" : "development"} server: http://localhost:${port}`);
});

async function shutdown() {
  clearInterval(heartbeat);
  clearInterval(simulation);
  for (const socket of wss.clients) socket.close(1001, "Server shutting down");
  await vite?.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

