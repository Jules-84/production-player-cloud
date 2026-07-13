const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = Number(process.env.PORT || 8787);
const sessions = new Map();

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Production Player Cloud",
    sessions: sessions.size
  });
});

app.get("/remote/:sessionId", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "remote.html"));
});

function cleanSessionId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      desktop: null,
      remotes: new Set(),
      state: {
        productionName: "Production",
        currentCue: "Ready",
        nextCue: "No next cue",
        isPlaying: false
      },
      updatedAt: Date.now()
    });
  }
  return sessions.get(id);
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRemotes(session, data) {
  for (const remote of session.remotes) {
    send(remote, data);
  }
}

wss.on("connection", (ws, request, context) => {
  const { role, sessionId, secret } = context;
  const session = getSession(sessionId);

  if (role === "desktop") {
    if (!secret || secret !== context.expectedSecret) {
      ws.close(1008, "Invalid desktop secret");
      return;
    }

    if (session.desktop && session.desktop !== ws) {
      try { session.desktop.close(1012, "Replaced by new desktop connection"); } catch {}
    }

    session.desktop = ws;
    session.updatedAt = Date.now();

    send(ws, {
      type: "ready",
      sessionId,
      remoteUrl: `${context.publicBase}/remote/${sessionId}`
    });

    ws.on("message", raw => {
      try {
        const message = JSON.parse(String(raw));

        if (message.type === "state" && message.state) {
          session.state = {
            productionName: String(message.state.productionName || "Production"),
            currentCue: String(message.state.currentCue || "Ready"),
            nextCue: String(message.state.nextCue || "No next cue"),
            isPlaying: Boolean(message.state.isPlaying)
          };
          session.updatedAt = Date.now();
          broadcastRemotes(session, { type: "state", state: session.state });
        }
      } catch {}
    });

    ws.on("close", () => {
      if (session.desktop === ws) {
        session.desktop = null;
        broadcastRemotes(session, { type: "desktopOffline" });
      }
    });
  }

  if (role === "remote") {
    session.remotes.add(ws);
    session.updatedAt = Date.now();

    send(ws, { type: "state", state: session.state });
    send(ws, { type: session.desktop ? "desktopOnline" : "desktopOffline" });

    ws.on("message", raw => {
      try {
        const message = JSON.parse(String(raw));

        if (
          message.type === "action" &&
          ["play", "pause", "next", "stop"].includes(message.action)
        ) {
          send(session.desktop, {
            type: "action",
            action: message.action
          });
        }
      } catch {}
    });

    ws.on("close", () => {
      session.remotes.delete(ws);
    });
  }
});

server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const role = url.searchParams.get("role");
    const sessionId = cleanSessionId(url.searchParams.get("session"));
    const secret = url.searchParams.get("secret") || "";

    if (!sessionId || !["desktop", "remote"].includes(role)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const publicBase = process.env.PUBLIC_BASE_URL || `https://${request.headers.host}`;
    const expectedSecret = process.env.DESKTOP_SECRET || "change-this-secret";

    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit("connection", ws, request, {
        role,
        sessionId,
        secret,
        expectedSecret,
        publicBase
      });
    });
  } catch {
    socket.destroy();
  }
});

setInterval(() => {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;

  for (const [id, session] of sessions.entries()) {
    if (!session.desktop && session.remotes.size === 0 && session.updatedAt < cutoff) {
      sessions.delete(id);
    }
  }
}, 60 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Production Player Cloud running on port ${PORT}`);
});
