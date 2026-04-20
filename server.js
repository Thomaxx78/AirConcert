const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript" };

const server = http.createServer((req, res) => {
	const ext = path.extname(req.url);
	if (ext === ".css" || ext === ".js") {
		const file = path.join(__dirname, "public", path.basename(req.url));
		fs.access(file, fs.constants.F_OK, (err) => {
			if (err) {
				res.writeHead(404);
				res.end();
				return;
			}
			res.setHeader("Content-Type", MIME[ext]);
			fs.createReadStream(file).pipe(res);
		});
		return;
	}
	const file = path.join(__dirname, "air-concert.html");
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({ server });

// sessions: Map<code, { players: Map<id, player>, hostId, songId }>
const sessions = new Map();
// clientMeta: Map<ws, { sessionCode, playerId }>
const clientMeta = new Map();

function genCode() {
	const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

function broadcast(code, msg, exclude = null) {
	const data = JSON.stringify(msg);
	clientMeta.forEach((meta, ws) => {
		if (meta.sessionCode === code && ws !== exclude && ws.readyState === WebSocket.OPEN) ws.send(data);
	});
}

wss.on("connection", (ws) => {
	ws.on("message", (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}

		const meta = clientMeta.get(ws);

		if (msg.type === "create") {
			const code = genCode();
			const player = { id: msg.id, name: msg.name, instrument: null, isHost: true };
			sessions.set(code, { players: new Map([[msg.id, player]]), hostId: msg.id, songId: null });
			clientMeta.set(ws, { sessionCode: code, playerId: msg.id });
			ws.send(JSON.stringify({ type: "session", code, players: [player], songId: null }));
			return;
		}

		if (msg.type === "join") {
			const session = sessions.get(msg.code?.toUpperCase());
			if (!session) {
				ws.send(JSON.stringify({ type: "error", msg: "Session introuvable" }));
				return;
			}
			const existing = session.players.get(msg.id);
			const isHost = session.hostId === msg.id;
			const player = existing
				? { ...existing, name: msg.name }
				: { id: msg.id, name: msg.name, instrument: null, isHost };
			session.players.set(msg.id, player);
			clientMeta.set(ws, { sessionCode: msg.code.toUpperCase(), playerId: msg.id });
			ws.send(
				JSON.stringify({
					type: "session",
					code: msg.code.toUpperCase(),
					players: [...session.players.values()],
					songId: session.songId,
				}),
			);
			broadcast(msg.code.toUpperCase(), { type: "player_joined", player }, ws);
			return;
		}

		if (!meta) return;
		const session = sessions.get(meta.sessionCode);
		if (!session) return;

		if (msg.type === "select_song") {
			if (session.hostId !== meta.playerId) return;
			session.songId = msg.songId;
			broadcast(meta.sessionCode, { type: "song_selected", songId: msg.songId });
			return;
		}

		if (msg.type === "select_instrument") {
			const p = session.players.get(meta.playerId);
			if (!p) return;
			p.instrument = msg.instrument || null;
			broadcast(meta.sessionCode, {
				type: "instrument_assigned",
				playerId: meta.playerId,
				instrument: p.instrument,
			});
			return;
		}

		if (msg.type === "start_concert") {
			if (session.hostId !== meta.playerId) return;
			const startAt = Date.now() + 3500;
			broadcast(meta.sessionCode, { type: "concert_start", startAt, songId: session.songId });
			return;
		}

		if (msg.type === "play_state") {
			// Relay to everyone else in session (not sender)
			broadcast(meta.sessionCode, { type: "play_state", playerId: meta.playerId, volume: msg.volume }, ws);
			return;
		}

		if (msg.type === "ping") {
			ws.send(JSON.stringify({ type: "pong", serverTime: Date.now(), clientT: msg.t }));
			return;
		}
	});

	ws.on("close", () => {
		const meta = clientMeta.get(ws);
		if (meta) {
			const session = sessions.get(meta.sessionCode);
			if (session) {
				session.players.delete(meta.playerId);
				if (session.players.size === 0) {
					sessions.delete(meta.sessionCode);
				} else {
					if (session.hostId === meta.playerId) {
						const newHost = session.players.values().next().value;
						newHost.isHost = true;
						session.hostId = newHost.id;
						broadcast(meta.sessionCode, { type: "host_changed", playerId: newHost.id });
					}
					broadcast(meta.sessionCode, { type: "player_left", playerId: meta.playerId });
				}
			}
			clientMeta.delete(ws);
		}
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`AirConcert → http://localhost:${PORT}`));
