# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start the server (node server.js) on port 3000 (or $PORT)
```

No build step, no lint, no tests. The app runs directly as-is.

## Architecture

AirConcert is a **single-page, multiplayer air-instrument concert app** with two files:

- [server.js](server.js) — Node.js HTTP + WebSocket server. Serves `air-concert.html` for all requests and manages multiplayer sessions in memory.
- [air-concert.html](air-concert.html) — The entire frontend: HTML, CSS, and ~700 lines of vanilla JS in a single file.

### Server-side session model

- `sessions`: `Map<code, { players: Map<id, player>, hostId, songId }>` — all session state
- `clientMeta`: `Map<ws, { sessionCode, playerId }>` — reverse-lookup from WebSocket to session

Session codes are 4-character alphanumeric strings. Sessions are deleted when the last player leaves.

### WebSocket message protocol

Client → Server:

- `create` / `join` — enter a session
- `select_song` / `select_instrument` — lobby configuration (host-only for song)
- `start_concert` — host triggers countdown + start (host-only)
- `play_state { volume: 0-1 }` — sent ~12Hz while in concert, throttled when volume change < 0.04
- `ping` — latency check

Server → Client:

- `session` — full state snapshot (sent on join/create)
- `player_joined` / `player_left` / `song_selected` / `instrument_assigned` — incremental updates broadcast to all
- `concert_start { startAt }` — absolute timestamp for synchronized start (3500ms in the future)
- `play_state` — relayed from other players (not echoed back to sender)
- `error` / `pong`

### Frontend structure

Three screens managed by CSS (`display: none` / `display: flex`): `homeScreen` → `lobbyScreen` → `concertScreen`.

**Audio engine** (`buildInstrument`): Pure Web Audio API. Each instrument is synthesized procedurally using oscillators and `setInterval` loops. All players' instruments run locally in the browser; volume is controlled via `masterGain` based on `play_state` messages received from the server.

**Motion detection** (`startCamera`): Uses `requestAnimationFrame` to diff consecutive video frames from the webcam. Pixel-diff ratio drives a smoothed `motionLevel` value with hysteresis thresholds (`ON_THRESH = 0.045`, `OFF_THRESH = 0.016`). Motion level maps to instrument volume for the local player.

**Synchronized start**: The server sends an absolute `startAt` timestamp. Clients compute the remaining delay and start audio at the same wall-clock moment.

### Songs and instruments

Songs (`SONGS` array) are defined client-side only — they specify stems (instrument slots). The server stores `songId` but never interprets it. Instrument synthesis is entirely client-side in `buildInstrument`.
