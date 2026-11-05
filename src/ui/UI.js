import { ROOM, ENTRY, EXIT, CY, toThree } from "../world/coords.js";
import { SECTIONS, LOOP_SECONDS } from "../laser/LaserModel.js";
import { LASER_COLORS } from "../laser/LaserRenderer.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/** DOM 기반 메뉴/HUD/다이얼로그/미니맵. Game 이 호출하는 메서드 모음. */
export class UI {
  constructor() {
    this.menu = $("#menu");
    this.hud = $("#hud");
    this.pause = $("#pause");
    this.result = $("#result");
    this.status = $("#status");
    this.prompt = $("#prompt");
    this.flashEl = $("#flash");
    this.minimap = $("#minimap");
    this.mctx = this.minimap.getContext("2d");
    this._statusTimer = 0;
    this.handlers = {};
    this.minimapColors = Object.fromEntries(Object.entries(LASER_COLORS).map(([k, c]) => [k, `#${c.getHexString()}`]));
    this.sectionColors = ["#3fd0ff", "#7dff9a", "#ffb86b"];

    // 세그먼트 버튼
    $$(".seg").forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", () => {
          const raw = b.dataset.value;
          const value = key === "family" && raw === "random" ? "random" : (isNaN(Number(raw)) ? raw : Number(raw));
          this.emit("setting", { [key]: value });
        });
      });
    });
    $$("[data-toggle]").forEach((cb) => {
      cb.addEventListener("change", () => this.emit("setting", { [cb.dataset.toggle]: cb.checked }));
    });
    $$("[data-range]").forEach((r) => {
      r.addEventListener("input", () => {
        const path = r.dataset.range.split(".");
        const patch = path.length === 2 ? { [path[0]]: { [path[1]]: Number(r.value) } } : { [path[0]]: Number(r.value) };
        this.emit("setting", patch);
      });
    });
    $("#reset-settings").addEventListener("click", () => this.emit("resetSettings"));
    $("#start").addEventListener("click", () => this.emit("start"));
    $("#resume").addEventListener("click", () => this.emit("resume"));
    $("#restart-run").addEventListener("click", () => this.emit("restart"));
    $("#to-menu").addEventListener("click", () => this.emit("menu"));
    $("#result-retry").addEventListener("click", () => this.emit("restart"));
    $("#result-menu").addEventListener("click", () => this.emit("menu"));

    if (matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches) {
      $("#mobile-warning").classList.remove("hidden");
    }
  }

  on(evt, fn) { this.handlers[evt] = fn; }
  emit(evt, payload) { this.handlers[evt]?.(payload); }

  syncSettings(s) {
    $$(".seg").forEach((seg) => {
      const key = seg.dataset.setting;
      const cur = String(s[key]);
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.value === cur ? "true" : "false"));
    });
    $$("[data-toggle]").forEach((cb) => { cb.checked = Boolean(s[cb.dataset.toggle]); });
    $$("[data-range]").forEach((r) => {
      const path = r.dataset.range.split(".");
      const v = path.length === 2 ? s[path[0]]?.[path[1]] : s[path[0]];
      if (v !== undefined) {
        r.value = v;
        const out = document.querySelector(`[data-out="${r.dataset.range}"]`);
        if (out) out.textContent = Number(v).toFixed(2).replace(/\.?0+$/, "");
      }
    });
    $("#speed-chip").textContent = `${s.timeScale}×`;
    $("#timeline").classList.toggle("hidden", !s.showTimeline);
    this.minimap.classList.toggle("hidden", !s.showMinimap);
  }

  showMenu(v) { this.menu.classList.toggle("hidden", !v); }
  showHud(v) { this.hud.classList.toggle("hidden", !v); }
  showPause(v) { this.pause.classList.toggle("hidden", !v); }

  showResult(v, data) {
    this.result.classList.toggle("hidden", !v);
    if (!v || !data) return;
    $("#result-title").textContent = data.hits === 0 ? "무접촉 통과!" : "통과";
    $("#result-layout").textContent = `${data.difficulty === "hard" ? "Hard" : "Normal"} · P${data.family + 1}`;
    $("#result-time").textContent = fmt(data.time);
    $("#result-hits").textContent = String(data.hits);
    const best = $("#result-best");
    best.textContent = data.best ? fmt(data.best) : "—";
    best.classList.toggle("best", Boolean(data.isBest));
  }

  setLayoutLabel(difficulty, family) {
    $("#layout-label").textContent = `${difficulty === "hard" ? "Hard" : "Normal"} · P${family + 1}`;
  }

  setStatus(text, kind) {
    clearTimeout(this._statusTimer);
    this.status.textContent = text;
    this.status.className = `status ${kind || ""} ${text ? "show" : ""}`;
    if (text && kind) {
      this._statusTimer = setTimeout(() => this.status.classList.remove("show"), 1800);
    }
  }

  setPrompt(text) { if (this.prompt.textContent !== text) this.prompt.textContent = text; }
  setHits(n) { $("#hits").textContent = String(n); }
  setTimer(t) { $("#timer").textContent = fmt(t); }

  setTimeline(ratio, show) {
    if (!show) return;
    $("#timeline-cursor").style.left = `${(ratio * 100).toFixed(2)}%`;
    $("#timeline-text").textContent = `${(ratio * LOOP_SECONDS).toFixed(1)}s / ${LOOP_SECONDS}s`;
  }

  setSections(cleared, disabled, current) {
    $$(".section-pill").forEach((p) => {
      const id = Number(p.dataset.sec);
      p.classList.toggle("current", id === current);
      p.classList.toggle("cleared", cleared.has(id));
      p.classList.toggle("disabled", disabled.has(id));
    });
  }

  flash(color) {
    this.flashEl.style.background = color;
    this.flashEl.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => this.flashEl.classList.remove("on")));
  }

  /** 탑다운 미니맵: 입구가 아래, 금고가 위. */
  drawMinimap(segments, player, markers, show, disabledSections) {
    if (!show || this.hud.classList.contains("hidden")) return;
    const c = this.mctx, W = this.minimap.width, H = this.minimap.height;
    const pad = 12;
    const totalL = ROOM.length + ENTRY.depth + EXIT.depth;
    const sx = (W - pad * 2) / ROOM.width;
    const sz = (H - pad * 2) / totalL;
    const s = Math.min(sx, sz);
    const ox = W / 2, oz = H / 2 - ((ENTRY.depth - EXIT.depth) / 2) * s;
    const mx = (x) => ox + x * s;          // Three X → 캔버스 x
    const mz = (z) => oz + z * s;          // Three Z(+는 입구) → 캔버스 y (아래)

    c.clearRect(0, 0, W, H);
    // 진입 통로
    c.fillStyle = "rgba(120,160,190,0.08)";
    c.fillRect(mx(-ROOM.halfW), mz(ROOM.halfL), ROOM.width * s, ENTRY.depth * s);
    c.fillRect(mx(-ROOM.halfW), mz(-ROOM.halfL - EXIT.depth), ROOM.width * s, EXIT.depth * s);
    // 구간 틴트
    SECTIONS.forEach((sec, i) => {
      const za = sec.y0 - CY, zb = sec.y1 - CY;
      c.fillStyle = this.sectionColors[i];
      c.globalAlpha = disabledSections?.has(sec.id) ? 0.04 : 0.09;
      c.fillRect(mx(-ROOM.halfW), mz(za), ROOM.width * s, (zb - za) * s);
    });
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(120,160,190,0.5)";
    c.lineWidth = 1;
    c.strokeRect(mx(-ROOM.halfW), mz(-ROOM.halfL), ROOM.width * s, ROOM.length * s);

    // 레이저
    const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
    c.lineWidth = 1.5;
    for (const seg of segments) {
      toThree(seg.a, a); toThree(seg.b, b);
      c.strokeStyle = this.minimapColors[seg.kind] || "#fff";
      c.fillStyle = c.strokeStyle;
      const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
      if (dx < 0.05 && dz < 0.05) {
        c.beginPath(); c.arc(mx(a.x), mz(a.z), 1.6, 0, Math.PI * 2); c.fill();
      } else {
        c.beginPath(); c.moveTo(mx(a.x), mz(a.z)); c.lineTo(mx(b.x), mz(b.z)); c.stroke();
      }
    }
    // 접촉 마커
    c.strokeStyle = "#ff3b5c";
    for (const m of markers) {
      c.beginPath(); c.arc(mx(m.x), mz(m.z), 3, 0, Math.PI * 2); c.stroke();
    }
    // 플레이어
    const p = player.position;
    c.fillStyle = player.crouching ? "#ffd36b" : "#ffffff";
    c.beginPath(); c.arc(mx(p.x), mz(p.z), 3.5, 0, Math.PI * 2); c.fill();
    const hx = -Math.sin(player.heading), hz = -Math.cos(player.heading);
    c.strokeStyle = c.fillStyle;
    c.beginPath(); c.moveTo(mx(p.x), mz(p.z)); c.lineTo(mx(p.x + hx * 0.8), mz(p.z + hz * 0.8)); c.stroke();

    c.fillStyle = "rgba(190,210,225,0.7)";
    c.font = "10px system-ui";
    c.fillText("도착", mx(-ROOM.halfW) + 2, mz(-ROOM.halfL - EXIT.depth) - 3);
    c.fillText("입구", mx(-ROOM.halfW) + 2, mz(ROOM.halfL + ENTRY.depth) + 10);
  }
}

function fmt(t) {
  return `${t.toFixed(2)}s`;
}
