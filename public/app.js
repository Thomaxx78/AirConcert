// ============================================================
//  SONGS
// ============================================================
const SONGS = [
	{
		id: "rock1",
		name: "Rock Anthem",
		artist: "AirConcert",
		bpm: 120,
		duration: 120,
		stems: ["guitare", "basse", "batterie", "voix"],
	},
	{
		id: "jazz1",
		name: "Jazz Café",
		artist: "AirConcert",
		bpm: 95,
		duration: 120,
		stems: ["piano", "basse", "batterie", "saxophone"],
	},
	{
		id: "pop1",
		name: "Pop Summer",
		artist: "AirConcert",
		bpm: 110,
		duration: 120,
		stems: ["piano", "guitare", "batterie", "voix"],
	},
	{
		id: "electro1",
		name: "Electro Pulse",
		artist: "AirConcert",
		bpm: 128,
		duration: 120,
		stems: ["synthé", "basse", "batterie", "pad"],
	},
];
const ICONS = {
	guitare: "🎸",
	basse: "🎸",
	batterie: "🥁",
	voix: "🎤",
	piano: "🎹",
	saxophone: "🎷",
	synthé: "🎛️",
	pad: "🎚️",
};

// ============================================================
//  STATE
// ============================================================
let ws = null;
let myId = sessionStorage.getItem("airconcert_id") || Math.random().toString(36).slice(2, 10);
sessionStorage.setItem("airconcert_id", myId);

let myName = "";
let session = { code: null, players: [], songId: null };
let isHost = false;
let concertTimerInterval = null;
let concertAudioStart = null;
let audioCtx = null;
let instrumentNodes = {};
let peerVolumes = {};
let camDetectionActive = false;
let lastSentVolume = -1;
let lastSentTime = 0;

// ============================================================
//  WEBSOCKET
// ============================================================
function connectWS() {
	const proto = location.protocol === "https:" ? "wss:" : "ws:";
	ws = new WebSocket(`${proto}//${location.host}`);

	ws.onopen = () => {
		setWsDot(true);
		if (session.code && myName) {
			send({ type: "join", code: session.code, id: myId, name: myName });
		}
	};

	ws.onmessage = (e) => {
		let msg;
		try {
			msg = JSON.parse(e.data);
		} catch {
			return;
		}
		handleMsg(msg);
	};

	ws.onclose = () => {
		setWsDot(false);
		setTimeout(connectWS, 2000);
	};

	ws.onerror = () => {};
}

function send(obj) {
	if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function setWsDot(ok) {
	["wsDot", "wsDotLobby"].forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.className = "ws-dot" + (ok ? " ok" : "");
	});
	const lbl = document.getElementById("wsLabel");
	if (lbl) lbl.textContent = ok ? "connecté" : "reconnexion…";
}

function handleMsg(msg) {
	switch (msg.type) {
		case "session":
			onSession(msg);
			break;
		case "player_joined":
			onPlayerJoined(msg);
			break;
		case "player_left":
			onPlayerLeft(msg);
			break;
		case "song_selected":
			onSongSelected(msg);
			break;
		case "instrument_assigned":
			onInstrumentAssigned(msg);
			break;
		case "concert_start":
			onConcertStart(msg);
			break;
		case "play_state":
			onPlayState(msg);
			break;
		case "host_changed":
			onHostChanged(msg);
			break;
		case "error":
			showToast(msg.msg || "Erreur");
			break;
	}
}

// ── Handlers ──────────────────────────────────────────────
function onSession(msg) {
	session.code = msg.code;
	session.songId = msg.songId;
	session.players = msg.players;
	const me = session.players.find((p) => p.id === myId);
	if (me) isHost = me.isHost;
	showScreen("lobbyScreen");
	document.getElementById("lobbyCode").textContent = msg.code;
	renderSongs();
	renderPlayers();
	updateStartBtn();
}

function onPlayerJoined(msg) {
	if (!session.players.find((p) => p.id === msg.player.id)) session.players.push(msg.player);
	renderPlayers();
	updateStartBtn();
	showToast(`${msg.player.name} a rejoint !`);
}

function onPlayerLeft(msg) {
	const leaving = session.players.find((p) => p.id === msg.playerId);
	if (leaving) showToast(`${leaving.name} a quitté la session`);
	session.players = session.players.filter((p) => p.id !== msg.playerId);
	renderPlayers();
	updateStartBtn();
}

function onHostChanged(msg) {
	session.players.forEach((p) => (p.isHost = p.id === msg.playerId));
	if (msg.playerId === myId) {
		isHost = true;
		showToast("Tu es maintenant le chef !");
	}
	renderPlayers();
	updateStartBtn();
}

function onSongSelected(msg) {
	session.songId = msg.songId;
	session.players.forEach((p) => (p.instrument = null));
	renderSongs();
	renderPlayers();
	updateStartBtn();
}

function onInstrumentAssigned(msg) {
	const p = session.players.find((x) => x.id === msg.playerId);
	if (p) p.instrument = msg.instrument;
	renderPlayers();
	updateStartBtn();
	const card = document.querySelector(`[data-band-id="${msg.playerId}"]`);
	if (card) {
		const ic = card.querySelector(".bc-icon");
		const instr = card.querySelector(".bc-instr");
		if (ic) ic.textContent = ICONS[msg.instrument] || "🎵";
		if (instr) instr.textContent = msg.instrument || "";
	}
}

function onConcertStart(msg) {
	concertAudioStart = msg.startAt;
	session.songId = msg.songId;
	startConcertUI(msg.startAt);
}

function onPlayState(msg) {
	peerVolumes[msg.playerId] = msg.volume;
	setPlayerVolume(msg.playerId, msg.volume);
	const card = document.querySelector(`[data-band-id="${msg.playerId}"]`);
	if (card) {
		const playing = msg.volume > 0.05;
		card.classList.toggle("playing", playing);
		card.querySelectorAll(".vol-bar").forEach((b) => {
			b.style.height = playing ? Math.random() * 14 + 3 + "px" : "2px";
		});
	}
}

// ============================================================
//  NAV
// ============================================================
function showScreen(id) {
	document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
	document.getElementById(id).classList.add("active");
}

function showToast(msg, dur = 3000) {
	const t = document.getElementById("toast");
	t.textContent = msg;
	t.classList.add("show");
	clearTimeout(t._timer);
	t._timer = setTimeout(() => t.classList.remove("show"), dur);
}

function showCreateModal() {
	document.getElementById("createModal").classList.add("active");
	document.getElementById("createName").focus();
}
function showJoinModal() {
	document.getElementById("joinModal").classList.add("active");
	document.getElementById("joinCode").focus();
}
function hideModal(id) {
	document.getElementById(id).classList.remove("active");
}

function goHome() {
	stopConcert();
	session = { code: null, players: [], songId: null };
	showScreen("homeScreen");
}

// ============================================================
//  SESSION ACTIONS
// ============================================================
function createSession() {
	myName = document.getElementById("createName").value.trim() || "Hôte";
	isHost = true;
	hideModal("createModal");
	send({ type: "create", id: myId, name: myName });
}

function joinSession() {
	const code = document.getElementById("joinCode").value.trim().toUpperCase();
	myName = document.getElementById("joinName").value.trim() || "Joueur";
	if (!code) {
		showToast("Entre un code de session");
		return;
	}
	isHost = false;
	hideModal("joinModal");
	send({ type: "join", code, id: myId, name: myName });
}

// ============================================================
//  SONG / INSTRUMENT
// ============================================================
function renderSongs() {
	const grid = document.getElementById("songGrid");
	grid.innerHTML = "";
	const hostMode = isHost || session.players.find((p) => p.id === myId)?.isHost;

	SONGS.forEach((song) => {
		const card = document.createElement("div");
		card.className = "song-card" + (session.songId === song.id ? " selected" : "");
		card.innerHTML = `<div class="sname">${song.name}</div><div class="sinfo">${song.artist} — ${song.bpm} BPM</div><div class="stems">${song.stems.map((s) => `<span class="stem-tag">${s}</span>`).join("")}</div>`;
		if (hostMode)
			card.onclick = () => {
				send({ type: "select_song", songId: song.id });
			};
		else card.style.cursor = "default";
		grid.appendChild(card);
	});
}

function renderPlayers() {
	const list = document.getElementById("playersList");
	list.innerHTML = "";
	const song = SONGS.find((s) => s.id === session.songId);
	const taken = session.players.map((p) => p.instrument).filter(Boolean);

	session.players.forEach((p) => {
		const chip = document.createElement("div");
		chip.className = "player-chip" + (p.id === myId ? " me" : "");
		const isMe = p.id === myId;

		let instrHTML = "";
		if (song && isMe) {
			const opts = song.stems
				.map((stem) => {
					const isTaken = taken.includes(stem) && p.instrument !== stem;
					return `<option value="${stem}" ${p.instrument === stem ? "selected" : ""} ${isTaken ? "disabled" : ""}>${ICONS[stem] || "🎵"} ${stem}${isTaken ? " ✗" : ""}</option>`;
				})
				.join("");
			instrHTML = `<select onchange="chooseInstrument(this.value)"><option value="">— Choisir —</option>${opts}</select>`;
		} else if (p.instrument) {
			instrHTML = `<div style="font-size:.85rem;color:var(--yellow);font-family:'Space Mono',monospace;">${ICONS[p.instrument] || "🎵"} ${p.instrument}</div>`;
		} else {
			instrHTML = `<div style="font-size:.75rem;color:var(--dim);font-style:italic">pas d'instrument</div>`;
		}

		chip.innerHTML = `<div class="pname">${p.name} ${p.isHost ? "👑" : ""} ${p.id === myId ? "(toi)" : ""}</div><div class="prole">${p.isHost ? "Chef" : "Musicien"}</div>${instrHTML}`;
		list.appendChild(chip);
	});
}

function chooseInstrument(instr) {
	send({ type: "select_instrument", instrument: instr || null });
}

function updateStartBtn() {
	const me = session.players.find((p) => p.id === myId);
	const isHostPlayer = me?.isHost;
	const btn = document.getElementById("startBtn");
	btn.style.display = isHostPlayer ? "" : "none";
	if (!isHostPlayer) return;
	const ready = session.songId && session.players.length > 0 && session.players.every((p) => p.instrument);
	btn.disabled = !ready;
}

function requestStartConcert() {
	send({ type: "start_concert" });
}

// ============================================================
//  CONCERT UI
// ============================================================
async function startConcertUI(startAt) {
	const song = SONGS.find((s) => s.id === session.songId);
	if (!song) return;
	const me = session.players.find((p) => p.id === myId);
	if (!me) return;

	showScreen("concertScreen");
	document.getElementById("cSongName").textContent = song.name;
	document.getElementById("cSongMeta").textContent = `${song.artist} — ${song.bpm} BPM`;

	document.getElementById("myIcon").textContent = ICONS[me.instrument] || "🎵";
	document.getElementById("myInstrName").textContent = me.instrument || "";
	document.getElementById("myHint").textContent = "Bougez devant votre caméra pour jouer !";

	const row = document.getElementById("bandRow");
	row.innerHTML = "";
	session.players.forEach((p) => {
		const card = document.createElement("div");
		card.className = "band-card";
		card.setAttribute("data-band-id", p.id);
		card.innerHTML = `
      <div class="bc-icon">${ICONS[p.instrument] || "🎵"}</div>
      <div class="bc-name">${p.name}${p.id === myId ? " ★" : ""}</div>
      <div class="bc-instr">${p.instrument || ""}</div>
      <div class="vol-bars">${Array(5).fill('<div class="vol-bar" style="height:2px"></div>').join("")}</div>`;
		row.appendChild(card);
	});

	initAudio(song);
	if (audioCtx.state === "suspended") await audioCtx.resume();

	const overlay = document.getElementById("countdownOverlay");
	const delay = startAt - Date.now();
	if (delay > 0) {
		overlay.classList.remove("hidden");
		let count = Math.ceil(delay / 1000);
		overlay.textContent = count;
		const iv = setInterval(() => {
			count--;
			if (count <= 0) {
				clearInterval(iv);
				overlay.classList.add("hidden");
			} else overlay.textContent = count;
		}, 1000);
		setTimeout(
			() => {
				overlay.classList.add("hidden");
				startAudioAndDetection(song);
			},
			Math.max(0, delay),
		);
	} else {
		overlay.classList.add("hidden");
		startAudioAndDetection(song);
	}
}

async function startAudioAndDetection(song) {
	Object.values(instrumentNodes).forEach((nodes) => {
		if (nodes.play) nodes.play();
	});

	const concertStart = Date.now();
	concertTimerInterval = setInterval(() => {
		const elapsed = (Date.now() - concertStart) / 1000;
		const m = Math.floor(elapsed / 60),
			s = Math.floor(elapsed % 60);
		document.getElementById("cTimer").textContent = `${m}:${s.toString().padStart(2, "0")}`;
		document.getElementById("progressBar").style.width = Math.min((elapsed / song.duration) * 100, 100) + "%";
	}, 250);

	await startCamera();
}

// ============================================================
//  AUDIO ENGINE
// ============================================================
function initAudio(song) {
	if (audioCtx) {
		try {
			audioCtx.close();
		} catch (e) {}
	}
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	instrumentNodes = {};

	session.players.forEach((player) => {
		const nodes = buildInstrument(player.instrument, song.bpm);
		instrumentNodes[player.id] = nodes;
	});
}

function buildInstrument(instr, bpm) {
	const masterGain = audioCtx.createGain();
	masterGain.gain.value = 0;
	masterGain.connect(audioCtx.destination);
	const beat = 60 / bpm;
	const nodes = { masterGain, intervals: [] };

	switch (instr) {
		case "batterie": {
			nodes.play = () => {
				const iv = setInterval(() => {
					const o = audioCtx.createOscillator(),
						g = audioCtx.createGain();
					o.type = "sine";
					o.frequency.setValueAtTime(150, audioCtx.currentTime);
					o.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.12);
					g.gain.setValueAtTime(0.9, audioCtx.currentTime);
					g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
					o.connect(g).connect(masterGain);
					o.start();
					o.stop(audioCtx.currentTime + 0.16);
					setTimeout(() => {
						const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
						const d = buf.getChannelData(0);
						for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
						const bs = audioCtx.createBufferSource(),
							hg = audioCtx.createGain();
						bs.buffer = buf;
						hg.gain.setValueAtTime(0.35, audioCtx.currentTime);
						hg.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
						bs.connect(hg).connect(masterGain);
						bs.start();
					}, beat * 500);
				}, beat * 1000);
				nodes.intervals.push(iv);
			};
			break;
		}
		case "basse": {
			const ns = [55, 65.41, 73.42, 82.41];
			let ni = 0;
			nodes.play = () => {
				const iv = setInterval(() => {
					const o = audioCtx.createOscillator(),
						f = audioCtx.createBiquadFilter(),
						g = audioCtx.createGain();
					o.type = "sawtooth";
					o.frequency.value = ns[ni++ % ns.length];
					f.type = "lowpass";
					f.frequency.value = 280;
					g.gain.setValueAtTime(0.55, audioCtx.currentTime);
					g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + beat * 0.85);
					o.connect(f).connect(g).connect(masterGain);
					o.start();
					o.stop(audioCtx.currentTime + beat * 0.85);
				}, beat * 1000);
				nodes.intervals.push(iv);
			};
			break;
		}
		case "guitare": {
			const chords = [
				[329.63, 392, 493.88],
				[261.63, 329.63, 392],
				[293.66, 369.99, 440],
				[246.94, 311.13, 369.99],
			];
			let ci = 0;
			nodes.play = () => {
				const iv = setInterval(() => {
					const ch = chords[ci++ % chords.length];
					ch.forEach((freq, i) =>
						setTimeout(() => {
							const o = audioCtx.createOscillator(),
								g = audioCtx.createGain();
							o.type = "triangle";
							o.frequency.value = freq;
							g.gain.setValueAtTime(0.2, audioCtx.currentTime);
							g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + beat * 1.5);
							o.connect(g).connect(masterGain);
							o.start();
							o.stop(audioCtx.currentTime + beat * 1.5);
						}, i * 30),
					);
				}, beat * 2000);
				nodes.intervals.push(iv);
			};
			break;
		}
		case "piano": {
			const mel = [523.25, 587.33, 659.25, 698.46, 783.99, 698.46, 659.25, 587.33];
			let mi = 0;
			nodes.play = () => {
				const iv = setInterval(() => {
					const o = audioCtx.createOscillator(),
						g = audioCtx.createGain();
					o.type = "sine";
					o.frequency.value = mel[mi++ % mel.length];
					g.gain.setValueAtTime(0.38, audioCtx.currentTime);
					g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + beat * 0.9);
					o.connect(g).connect(masterGain);
					o.start();
					o.stop(audioCtx.currentTime + beat);
				}, beat * 500);
				nodes.intervals.push(iv);
			};
			break;
		}
		case "voix": {
			const vf = [440, 466.16, 493.88, 523.25, 554.37, 523.25, 493.88, 466.16];
			let vi = 0;
			nodes.play = () => {
				const iv = setInterval(() => {
					const o = audioCtx.createOscillator(),
						g = audioCtx.createGain();
					const vib = audioCtx.createOscillator(),
						vg = audioCtx.createGain();
					o.type = "sine";
					o.frequency.value = vf[vi++ % vf.length];
					vib.frequency.value = 5;
					vg.gain.value = 7;
					vib.connect(vg).connect(o.frequency);
					vib.start();
					g.gain.setValueAtTime(0.28, audioCtx.currentTime);
					g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + beat * 1.8);
					o.connect(g).connect(masterGain);
					o.start();
					o.stop(audioCtx.currentTime + beat * 2);
					vib.stop(audioCtx.currentTime + beat * 2);
				}, beat * 2000);
				nodes.intervals.push(iv);
			};
			break;
		}
		case "saxophone": {
			const sf = [349.23, 392, 440, 523.25, 440, 392, 349.23, 329.63];
			let si = 0;
			nodes.play = () => {
				const iv = setInterval(() => {
					const o = audioCtx.createOscillator(),
						f = audioCtx.createBiquadFilter(),
						g = audioCtx.createGain();
					o.type = "sawtooth";
					o.frequency.value = sf[si++ % sf.length];
					f.type = "lowpass";
					f.frequency.value = 1100;
					g.gain.setValueAtTime(0.22, audioCtx.currentTime);
					g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + beat * 1.4);
					o.connect(f).connect(g).connect(masterGain);
					o.start();
					o.stop(audioCtx.currentTime + beat * 1.4);
				}, beat * 1000);
				nodes.intervals.push(iv);
			};
			break;
		}
		case "synthé": {
			nodes.play = () => {
				const o = audioCtx.createOscillator(),
					f = audioCtx.createBiquadFilter();
				const lfo = audioCtx.createOscillator(),
					lg = audioCtx.createGain(),
					g = audioCtx.createGain();
				o.type = "sawtooth";
				o.frequency.value = 220;
				f.type = "lowpass";
				f.frequency.value = 800;
				lfo.frequency.value = 0.5;
				lg.gain.value = 380;
				lfo.connect(lg).connect(f.frequency);
				lfo.start();
				g.gain.value = 0.16;
				o.connect(f).connect(g).connect(masterGain);
				o.start();
				nodes._so = o;
				nodes._sl = lfo;
			};
			nodes.stop = () => {
				try {
					nodes._so?.stop();
					nodes._sl?.stop();
				} catch (e) {}
			};
			break;
		}
		case "pad": {
			nodes.play = () => {
				nodes._po = [220, 277.18, 329.63].map((freq) => {
					const o = audioCtx.createOscillator(),
						g = audioCtx.createGain();
					o.type = "sine";
					o.frequency.value = freq;
					g.gain.value = 0.1;
					o.connect(g).connect(masterGain);
					o.start();
					return o;
				});
			};
			nodes.stop = () =>
				nodes._po?.forEach((o) => {
					try {
						o.stop();
					} catch (e) {}
				});
			break;
		}
	}
	return nodes;
}

function setPlayerVolume(pid, vol) {
	const n = instrumentNodes[pid];
	if (!n || !audioCtx) return;
	const now = audioCtx.currentTime;
	n.masterGain.gain.cancelScheduledValues(now);
	n.masterGain.gain.setValueAtTime(n.masterGain.gain.value, now);
	n.masterGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(vol, 1)), now + 0.08);
}

// ============================================================
//  CAMERA + MOTION DETECTION
// ============================================================
async function startCamera() {
	camDetectionActive = true;
	const video = document.getElementById("myCamVideo");
	const canvas = document.getElementById("myCamCanvas");
	const wrap = document.getElementById("myCamWrap");

	let stream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			video: { width: 320, height: 240, facingMode: "user" },
			audio: false,
		});
		video.srcObject = stream;
		await video.play();
		wrap.querySelector(".cam-placeholder")?.remove();
	} catch (e) {
		wrap.innerHTML +=
			'<div class="cam-placeholder">📷 Caméra non disponible<br><small>Votre instrument jouera automatiquement</small></div>';
		setPlayerVolume(myId, 0.8);
		send({ type: "play_state", volume: 0.8 });
		return;
	}

	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	const W = 320,
		H = 240;
	canvas.width = W;
	canvas.height = H;

	let prevFrame = null;
	let motionLevel = 0;
	let isPlaying = false;
	let lastMotionTime = 0;

	const ON_THRESH = 0.045;
	const OFF_THRESH = 0.016;
	const STOP_DELAY = 5000;
	const ANIM_BARS_INTERVAL = 150;

	let lastBandAnim = 0;

	const loop = () => {
		if (!camDetectionActive) return;
		if (video.readyState < 2) {
			requestAnimationFrame(loop);
			return;
		}

		ctx.save();
		ctx.scale(-1, 1);
		ctx.drawImage(video, -W, 0, W, H);
		ctx.restore();

		const frame = ctx.getImageData(0, 0, W, H);

		if (prevFrame) {
			let moved = 0,
				total = 0;
			for (let i = 0; i < frame.data.length; i += 16) {
				const diff =
					Math.abs(frame.data[i] - prevFrame.data[i]) +
					Math.abs(frame.data[i + 1] - prevFrame.data[i + 1]) +
					Math.abs(frame.data[i + 2] - prevFrame.data[i + 2]);
				total++;
				if (diff > 28) moved++;
			}
			const raw = total > 0 ? moved / total : 0;
			motionLevel = motionLevel * 0.76 + raw * 0.24;

			const now = Date.now();

			if (motionLevel > OFF_THRESH) lastMotionTime = now;
			if (!isPlaying && motionLevel > ON_THRESH) isPlaying = true;
			if (isPlaying && now - lastMotionTime > STOP_DELAY) isPlaying = false;

			const vol = isPlaying ? Math.min(motionLevel * 14, 1.0) : 0;

			setPlayerVolume(myId, vol);

			document.getElementById("motionBar").style.width = Math.min(motionLevel * 500, 100) + "%";

			const badge = document.getElementById("myStatusBadge");
			badge.textContent = isPlaying ? "🎵 En train de jouer" : "🔇 En pause";
			badge.className = "my-status " + (isPlaying ? "playing" : "muted");
			if (now - lastBandAnim > ANIM_BARS_INTERVAL) {
				lastBandAnim = now;
				const myCard = document.querySelector(`[data-band-id="${myId}"]`);
				if (myCard) {
					myCard.classList.toggle("playing", isPlaying);
					myCard.querySelectorAll(".vol-bar").forEach((b) => {
						b.style.height = isPlaying ? Math.random() * 14 + 3 + "px" : "2px";
					});
				}
			}

			if (now - lastSentTime > 80 && Math.abs(vol - lastSentVolume) > 0.04) {
				lastSentVolume = vol;
				lastSentTime = now;
				send({ type: "play_state", volume: vol });
			}
		}

		prevFrame = frame;
		requestAnimationFrame(loop);
	};

	loop();
}

// ============================================================
//  STOP CONCERT
// ============================================================
function stopConcert() {
	camDetectionActive = false;

	if (concertTimerInterval) {
		clearInterval(concertTimerInterval);
		concertTimerInterval = null;
	}

	Object.values(instrumentNodes).forEach((n) => {
		n.intervals?.forEach(clearInterval);
		n.stop?.();
		try {
			n.masterGain?.disconnect();
		} catch (e) {}
	});
	instrumentNodes = {};

	const video = document.getElementById("myCamVideo");
	if (video?.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());

	if (audioCtx) {
		try {
			audioCtx.close();
		} catch (e) {}
		audioCtx = null;
	}

	showScreen("lobbyScreen");
}

// ============================================================
//  INIT
// ============================================================
connectWS();
