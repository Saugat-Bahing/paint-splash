import { BURST_COOLDOWN, DASH_COOLDOWN, MIN_PLAYERS, TILE_COUNT } from "../config.js";

const $ = (selector) => document.querySelector(selector);

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.localId = null;
    this.room = null;
    this.toastTimer = null;
    this.lastCountdown = null;
    this.resultVisible = false;

    $("#create-form").addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.create($("#player-name").value);
    });
    $("#join-form").addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.join($("#player-name").value, $("#room-code-input").value);
    });
    $("#room-code-input").addEventListener("input", (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    $("#join-red").addEventListener("click", () => handlers.team("red"));
    $("#join-blue").addEventListener("click", () => handlers.team("blue"));
    $("#start-match").addEventListener("click", () => handlers.start());
    $("#rematch").addEventListener("click", () => handlers.start());
    $("#leave-lobby").addEventListener("click", () => location.reload());
    $("#copy-room-code").addEventListener("click", async () => {
      if (!this.room) return;
      try {
        await navigator.clipboard.writeText(this.room.code);
        $("#copy-room-code i").textContent = "✓";
        setTimeout(() => { $("#copy-room-code i").textContent = "⧉"; }, 1200);
      } catch {
        this.toast(`Room code: ${this.room.code}`);
      }
    });
  }

  showScreen(id) {
    for (const screen of ["menu-screen", "lobby-screen", "game-screen"]) {
      const element = $(`#${screen}`);
      const visible = screen === id;
      element.hidden = !visible;
      element.classList.toggle("is-active", visible);
    }
  }

  showLobby(room, localId) {
    this.localId = localId;
    this.resultVisible = false;
    this.updateRoom(room, localId);
    this.showScreen("lobby-screen");
  }

  showGame(roomCode) {
    this.resultVisible = false;
    this.lastCountdown = null;
    $("#result-overlay").hidden = true;
    $("#connection-overlay").hidden = true;
    $("#game-room-code").textContent = roomCode;
    this.showScreen("game-screen");
    requestAnimationFrame(() => $("#game").focus());
  }

  updateRoom(room, localId = this.localId) {
    this.room = room;
    this.localId = localId;
    $("#lobby-room-code").textContent = room.code;
    $("#lobby-notice").textContent = room.notice || "";
    this.renderTeam("red", room.players.filter((player) => player.team === "red"));
    this.renderTeam("blue", room.players.filter((player) => player.team === "blue"));

    const isHost = room.hostId === localId;
    const redCount = room.players.filter((player) => player.team === "red").length;
    const blueCount = room.players.length - redCount;
    const canStart = room.players.length >= MIN_PLAYERS && redCount > 0 && blueCount > 0;
    const start = $("#start-match");
    start.disabled = !isHost || !canStart;
    start.innerHTML = isHost
      ? `${canStart ? "START MATCH" : "NEED BOTH TEAMS"} <span>→</span>`
      : "WAITING FOR HOST";
    $("#lobby-status").textContent = canStart
      ? `${room.players.length} players ready · ${redCount}v${blueCount}`
      : "Need at least 2 players and both teams";
  }

  renderTeam(team, players) {
    $(`#${team}-count`).textContent = `${players.length} ${players.length === 1 ? "PLAYER" : "PLAYERS"}`;
    const list = $(`#${team}-players`);
    list.replaceChildren();

    if (players.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-team";
      empty.textContent = "WAITING FOR A CREW…";
      list.append(empty);
      return;
    }

    for (const player of players) {
      const pill = document.createElement("div");
      pill.className = "player-pill";
      const avatar = document.createElement("span");
      avatar.className = "player-avatar";
      avatar.textContent = player.name.charAt(0).toUpperCase();
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = player.name;
      pill.append(avatar, name);

      if (player.id === this.localId) {
        const you = document.createElement("span");
        you.className = "you";
        you.textContent = "(YOU)";
        name.append(you);
      }
      if (player.id === this.room?.hostId) {
        const host = document.createElement("span");
        host.className = "host-tag";
        host.textContent = "HOST ◆";
        pill.append(host);
      }
      list.append(pill);
    }
  }

  updateHud(game) {
    const { scores, local, phase, timeLeft, countdown, players } = game;
    const redPercent = Math.round(scores.red / TILE_COUNT * 100);
    const bluePercent = Math.round(scores.blue / TILE_COUNT * 100);
    const neutralPercent = Math.max(0, 100 - redPercent - bluePercent);
    const redCount = players.filter((player) => player.team === "red").length;

    $("#hud-red-score").textContent = redPercent;
    $("#hud-blue-score").textContent = bluePercent;
    $("#hud-red-tiles").textContent = `${scores.red} TILES`;
    $("#hud-blue-tiles").textContent = `${scores.blue} TILES`;
    $("#hud-red-count").textContent = `${redCount} ${redCount === 1 ? "PLAYER" : "PLAYERS"}`;
    $("#hud-blue-count").textContent = `${players.length - redCount} ${players.length - redCount === 1 ? "PLAYER" : "PLAYERS"}`;
    $("#territory-red").style.width = `${redPercent}%`;
    $("#territory-blue").style.width = `${bluePercent}%`;
    $("#territory-neutral").style.width = `${neutralPercent}%`;

    const seconds = Math.max(0, Math.ceil(timeLeft));
    $("#match-clock").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    $("#match-phase").textContent = phase === "overtime" ? "OVERTIME · NEXT LEAD WINS" : "TURF CONTROL";
    $("#match-phase").style.color = phase === "overtime" ? "var(--lime)" : "";

    const countdownElement = $("#countdown");
    countdownElement.hidden = phase !== "countdown";
    if (phase === "countdown") {
      const value = Math.max(1, Math.ceil(countdown));
      if (value !== this.lastCountdown) {
        countdownElement.querySelector("strong").textContent = value;
        countdownElement.querySelector("strong").style.animation = "none";
        void countdownElement.querySelector("strong").offsetWidth;
        countdownElement.querySelector("strong").style.animation = "";
        this.lastCountdown = value;
      }
    }

    this.updateAbility("burst", local?.burstCooldown ?? 0, BURST_COOLDOWN);
    this.updateAbility("dash", local?.dashCooldown ?? 0, DASH_COOLDOWN);
  }

  updateAbility(name, cooldown, maximum) {
    const ready = cooldown <= 0.02;
    const progress = Math.max(0, Math.min(1, 1 - cooldown / maximum));
    $(`#${name}-cooldown`).style.transform = `scaleX(${progress})`;
    $(`#${name}-ability`).classList.toggle("is-ready", ready);
    $(`#${name}-status`).textContent = ready ? "READY" : `${cooldown.toFixed(1)}S`;
  }

  showResult(game) {
    if (this.resultVisible) return;
    this.resultVisible = true;
    const winner = game.winner;
    const title = winner === "draw" ? "IT’S A DRAW" : `${winner.toUpperCase()} CREW WINS`;
    $("#result-title").textContent = title;
    $("#result-title").className = winner;
    $("#result-score").textContent = `${Math.round(game.scores.red / TILE_COUNT * 100)}% RED — ${Math.round(game.scores.blue / TILE_COUNT * 100)}% BLUE`;
    const isHost = this.room?.hostId === this.localId;
    $("#rematch").hidden = !isHost;
    $("#rematch-waiting").textContent = isHost ? "Same crews. Clean arena. One more round." : "Only the host can start a rematch.";
    $("#result-overlay").hidden = false;
  }

  setConnected(connected) {
    $("#online-badge").classList.toggle("is-offline", !connected);
    $("#online-badge").lastChild.textContent = connected ? " ONLINE" : " OFFLINE";
  }

  showDisconnected(inGame) {
    this.setConnected(false);
    if (inGame) $("#connection-overlay").hidden = false;
  }

  toast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }
}
