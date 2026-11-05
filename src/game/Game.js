import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { LAYOUT_BY_KEY, LAYOUTS, LOOP_SECONDS, SECTIONS, createSegments, layoutKey, maxSegmentCount, sectionOfY } from "../laser/LaserModel.js";
import { LaserRenderer } from "../laser/LaserRenderer.js";
import { Room } from "../world/Room.js";
import { ROOM, threeZToWorldY, toThree, worldYToThreeZ } from "../world/coords.js";
import { Player, DEFAULT_PLAYER_SETTINGS, START_Z } from "../player/Player.js";
import { ThirdPersonCamera } from "../player/ThirdPersonCamera.js";
import { Input } from "./Input.js";
import { segmentSegmentDistanceSq } from "./collision.js";
import { loadCharacter } from "../player/CharacterLoader.js";

const LASER_RADIUS = 0.03;
const PANEL_RANGE = 1.6;

export const HIT_MODES = {
  section: "구간 재시작",
  full: "처음부터",
  free: "자유 연습(카운트만)"
};

export const DEFAULT_SETTINGS = {
  difficulty: "normal",
  family: 0,              // 0,1,2 또는 "random"
  hitMode: "section",
  panels: true,           // 패널로 구간 끄기 사용
  randomPhase: false,     // 시작 시 레이저 루프 위상 랜덤
  showMinimap: true,
  showTimeline: true,
  timeScale: 1,
  player: { ...DEFAULT_PLAYER_SETTINGS },
  cameraSensitivity: 1
};

/**
 * 게임 전체 상태와 루프.
 * 상태: menu → ready(시작 대기) → running → (hit) → cleared | paused
 */
export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.settings = loadSettings();
    this.state = "menu";
    this.loopTime = 0;        // 레이저 루프 시간(초)
    this.runTime = 0;         // 플레이 경과 시간(초, 실제 시간 기준)
    this.hits = 0;
    this.hitCooldown = 0;
    this.disabledSections = new Set();
    this.clearedSections = new Set();
    this.hitMarkers = [];
    this.layout = null;
    this.segments = [];
    this.currentSection = 0;
    this.nearPanel = null;

    this.setupRenderer();
    this.setupScene();
    this.input = new Input();
    this.clock = new THREE.Clock();

    window.addEventListener("resize", () => this.resize());
    this.resize();


    loadCharacter().then((model) => {
      if (model) this.player.setModel(model);
    }).catch(() => {});

    requestAnimationFrame((t) => this.frame(t));
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080b);
    this.scene.fog = new THREE.Fog(0x05080b, 26, 70);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setupScene() {
    this.room = new Room(this.scene);
    this.player = new Player(this.scene, this.settings.player);
    this.cameraCtl = new ThirdPersonCamera(this.camera, this.canvas);
    const maxSeg = Math.max(...LAYOUTS.map(maxSegmentCount));
    this.lasers = new LaserRenderer(this.scene, maxSeg);

    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);
    this.markerGeo = new THREE.RingGeometry(0.12, 0.2, 20);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide });

    this._capA = new THREE.Vector3();
    this._capB = new THREE.Vector3();
    this._la = { x: 0, y: 0, z: 0 };
    this._lb = { x: 0, y: 0, z: 0 };

    this.camera.position.set(0, 12, ROOM.halfL + 10);
    this.camera.lookAt(0, 0, 0);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lasers.setResolution(w, h);
  }

  // ---------- 설정 ----------

  applySettings(partial) {
    this.settings = deepMerge(this.settings, partial);
    this.player.settings = { ...DEFAULT_PLAYER_SETTINGS, ...this.settings.player };
    this.cameraCtl.sensitivity = 0.0045 * (this.settings.cameraSensitivity || 1);
    saveSettings(this.settings);
    this.ui.syncSettings(this.settings);
  }

  // ---------- 상태 전환 ----------

  pickFamily() {
    if (this.settings.family === "random") return Math.floor(Math.random() * 3);
    return Number(this.settings.family);
  }

  /** 메뉴에서 시작: 레이아웃 고르고 입구에 세운다. 첫 이동에 타이머 시작. */
  startRun() {
    this.activeFamily = this.pickFamily();
    this.layout = LAYOUT_BY_KEY[layoutKey(this.settings.difficulty, this.activeFamily)];
    this.resetRunState(true);
    this.state = "ready";
    this.cameraCtl.topView = false;
    this.cameraCtl.reset();
    this.ui.showHud(true);
    this.ui.showMenu(false);
    this.ui.setStatus("이동하면 시작됩니다", "");
    this.ui.setLayoutLabel(this.settings.difficulty, this.activeFamily);
    this.cameraCtl.requestLock();
  }

  resetRunState(fullReset) {
    this.loopTime = this.settings.randomPhase ? Math.random() * LOOP_SECONDS : 0;
    this.runTime = 0;
    this.hits = 0;
    this.hitCooldown = 0;
    this.disabledSections.clear();
    this.clearedSections.clear();
    this.clearMarkers();
    this.room.resetPanels();
    this.player.reset();
    this.currentSection = 0;
    this.sectionStartZ = this.player.position.z;
    if (fullReset) this.ui.setHits(0);
    this.ui.setTimer(0);
    this.ui.setSections(this.clearedSections, this.disabledSections, 0);
  }

  pause() {
    if (this.state !== "running" && this.state !== "ready") return;
    this.prevState = this.state;
    this.state = "paused";
    this.cameraCtl.releaseLock();
    this.ui.showPause(true);
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = this.prevState || "running";
    this.ui.showPause(false);
    this.cameraCtl.requestLock();
  }

  backToMenu() {
    this.state = "menu";
    this.cameraCtl.releaseLock();
    this.ui.showPause(false);
    this.ui.showResult(false);
    this.ui.showHud(false);
    this.ui.showMenu(true);
    this.cameraCtl.topView = false;
    this.camera.position.set(0, 12, ROOM.halfL + 10);
  }

  restart() {
    if (!this.layout) return;
    this.ui.showResult(false);
    this.ui.showPause(false);
    this.resetRunState(true);
    this.state = "ready";
    this.ui.setStatus("이동하면 시작됩니다", "");
    this.cameraCtl.reset();
    this.cameraCtl.requestLock();
  }

  /** 구간 시작 지점으로 되돌리기 (R) */
  restartSection() {
    if (!this.layout) return;
    const z = this.sectionStartZ ?? START_Z;
    this.player.reset(z);
    this.hitCooldown = 0.5;
    this.ui.setStatus("구간 재시작", "");
    this.ui.flash("#2ea7ff");
  }

  onHit(hitIds, hitPoint) {
    this.hits += 1;
    this.ui.setHits(this.hits);
    this.lasers.flashHit(hitIds);
    this.addMarker(hitPoint);
    this.ui.flash("#ff3b5c");

    const mode = this.settings.hitMode;
    if (mode === "free") {
      this.hitCooldown = 0.6;
      this.ui.setStatus("레이저 접촉", "warn");
      return;
    }
    if (mode === "full") {
      const hits = this.hits;
      this.resetRunState(false);
      this.hits = hits;
      this.ui.setHits(hits);
      this.state = "ready";
      this.ui.setStatus("레이저 접촉 — 처음부터", "warn");
      return;
    }
    // section 모드: 구간 시작으로
    this.player.reset(this.sectionStartZ ?? START_Z);
    this.hitCooldown = 0.8;
    this.ui.setStatus("레이저 접촉 — 구간 재시작", "warn");
  }

  onCleared() {
    this.state = "cleared";
    this.cameraCtl.releaseLock();
    const key = `best_${this.settings.difficulty}_${this.activeFamily}_${this.settings.hitMode}_${this.settings.panels ? "p" : "np"}`;
    const prev = Number(localStorage.getItem(key) || 0);
    const isBest = this.hits === 0 && (!prev || this.runTime < prev);
    if (isBest) localStorage.setItem(key, String(this.runTime));
    this.ui.showResult(true, {
      time: this.runTime,
      hits: this.hits,
      best: isBest ? this.runTime : prev,
      isBest,
      difficulty: this.settings.difficulty,
      family: this.activeFamily
    });
  }

  // ---------- 마커 ----------

  addMarker(p) {
    const m = new THREE.Mesh(this.markerGeo, this.markerMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.012, p.z);
    this.markerGroup.add(m);
    this.hitMarkers.push({ x: p.x, z: p.z });
  }

  clearMarkers() {
    while (this.markerGroup.children.length) this.markerGroup.remove(this.markerGroup.children[0]);
    this.hitMarkers.length = 0;
  }

  // ---------- 루프 ----------

  frame(t) {
    requestAnimationFrame((n) => this.frame(n));
    const rawDt = Math.min(0.05, this.clock.getDelta());
    this.handleGlobalKeys();

    const scale = this.settings.timeScale;
    const playing = this.state === "running" || this.state === "ready";
    const dt = playing ? rawDt * scale : 0;

    if (this.state === "menu") {
      // 메뉴 배경: 패턴 미리보기 회전
      this.loopTime = (this.loopTime + rawDt) % LOOP_SECONDS;
      const previewLayout = LAYOUT_BY_KEY[layoutKey(this.settings.difficulty, this.settings.family === "random" ? 0 : Number(this.settings.family))];
      this.segments = createSegments(previewLayout, this.loopTime, null);
      this.lasers.update(this.segments, rawDt);
      const a = t * 0.00012;
      this.camera.position.set(Math.sin(a) * 9, 9, Math.cos(a) * 9 + 4);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0.5, 0);
      this.player.group.visible = false;
      this.composer.render();
      return;
    }
    this.player.group.visible = true;

    if (playing) {
      const inp = this.input.read();
      if (this.state === "ready" && (inp.forward !== 0 || inp.right !== 0)) {
        this.state = "running";
        this.ui.setStatus("", "");
      }
      if (this.state === "running") {
        this.loopTime = (this.loopTime + dt) % LOOP_SECONDS;
        this.runTime += dt;
      } else {
        // ready 상태에서도 레이저는 흐른다(실제 게임처럼 관찰 가능)
        this.loopTime = (this.loopTime + rawDt * scale) % LOOP_SECONDS;
      }
      this.player.update(dt, inp, this.cameraCtl.yaw);
      this.segments = createSegments(this.layout, this.loopTime, this.disabledSections);
      this.lasers.update(this.segments, rawDt);

      this.updateSections();
      this.updatePanels(inp);
      if (this.hitCooldown > 0) this.hitCooldown -= rawDt;
      else this.checkCollision();

      // 도착 판정: 금고 게이트 통과
      if (this.player.position.z < -ROOM.halfL && this.state === "running") {
        this.onCleared();
      }
      this.ui.setTimer(this.runTime);
      this.ui.setTimeline(this.loopTime / LOOP_SECONDS, this.settings.showTimeline);
    } else {
      this.lasers.update(this.segments, rawDt);
    }

    this.cameraCtl.update(rawDt, this.player.position, this.player.height);
    this.ui.drawMinimap(this.segments, this.player, this.hitMarkers, this.settings.showMinimap, this.disabledSections);
    this.composer.render();
  }

  handleGlobalKeys() {
    const k = this.input.consumeKeys();
    if (k.has("Escape")) {
      if (this.state === "paused") this.resume();
      else if (this.state === "running" || this.state === "ready") this.pause();
    }
    if (this.state === "running" || this.state === "ready" || this.state === "paused") {
      if (k.has("KeyR")) this.restartSection();
      if (k.has("KeyV")) this.cameraCtl.topView = !this.cameraCtl.topView;
      if (k.has("Digit1")) this.applySettings({ timeScale: 0.25 });
      if (k.has("Digit2")) this.applySettings({ timeScale: 0.5 });
      if (k.has("Digit3")) this.applySettings({ timeScale: 0.75 });
      if (k.has("Digit4")) this.applySettings({ timeScale: 1 });
      if (k.has("KeyM")) this.applySettings({ showMinimap: !this.settings.showMinimap });
    }
    if (this.state === "cleared" && (k.has("Enter") || k.has("KeyR"))) this.restart();
  }

  updateSections() {
    const y = threeZToWorldY(this.player.position.z);
    const sec = sectionOfY(y);
    if (sec !== this.currentSection) {
      // 금고 쪽으로 진입했을 때만 구간 시작점 갱신
      if (sec > this.currentSection) {
        const s = SECTIONS.find((x) => x.id === sec);
        if (s) this.sectionStartZ = worldYToThreeZ(s.y1) - 0.35;
        for (let i = 1; i < sec; i += 1) this.clearedSections.add(i);
      }
      this.currentSection = sec;
      this.ui.setSections(this.clearedSections, this.disabledSections, sec);
    }
  }

  updatePanels(inp) {
    this.nearPanel = null;
    if (!this.settings.panels) {
      this.ui.setPrompt("");
      return;
    }
    let best = null, bestD = PANEL_RANGE;
    for (const p of this.room.panels) {
      if (!p.active) continue;
      const d = Math.hypot(p.position.x - this.player.position.x, p.position.z - this.player.position.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.nearPanel = best;
    if (best) {
      this.ui.setPrompt(`E — 구간 ${best.section} 레이저 차단`);
      if (inp.interact) {
        this.disabledSections.add(best.section);
        this.room.setPanelState(best.section, false);
        this.ui.setSections(this.clearedSections, this.disabledSections, this.currentSection);
        this.ui.setStatus(`구간 ${best.section} 레이저 차단됨`, "ok");
        this.ui.flash("#45ff9a");
      }
    } else {
      this.ui.setPrompt("");
    }
  }

  checkCollision() {
    const r = this.player.getCapsuleSegment(this._capA, this._capB);
    const limit = (r + LASER_RADIUS) ** 2;
    const hitIds = [];
    for (const s of this.segments) {
      toThree(s.a, this._la);
      toThree(s.b, this._lb);
      if (segmentSegmentDistanceSq(this._capA, this._capB, this._la, this._lb) <= limit) {
        hitIds.push(s.id);
      }
    }
    if (hitIds.length) this.onHit(hitIds, this.player.position.clone());
  }
}

// ---------- 설정 저장 ----------

const SETTINGS_KEY = "laser-trainer-settings-v1";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return deepMerge(structuredClone(DEFAULT_SETTINGS), JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" && base[k]) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
