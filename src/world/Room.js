import * as THREE from "three";
import { ROOM, ENTRY, worldYToThreeZ } from "./coords.js";
import { SECTIONS, BOUNDS } from "../laser/LaserModel.js";

const SECTION_COLORS = [0x3fd0ff, 0x7dff9a, 0xffb86b];

/**
 * 훈련실. 미술관이 아닌 "보안 훈련 챔버" 콘셉트의 오리지널 공간.
 * 어두운 격자 바닥, 발광 라인으로 구간 경계 표시, 양 끝에 입구/도착 게이트.
 */
export class Room {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.panels = []; // { section, mesh, light, position }

    this.buildFloor();
    this.buildWalls();
    this.buildSectionLines();
    this.buildGates();
    this.buildPanels();
    this.buildLights();
  }

  buildFloor() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.85, metalness: 0.1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.length), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 1m 격자
    const grid = new THREE.GridHelper(Math.max(ROOM.width, ROOM.length), Math.max(ROOM.width, ROOM.length), 0x1f3340, 0x15232c);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    // 격자를 방 크기에 맞게 잘라 보이도록 클리핑 대신 스케일 조정
    grid.scale.set(ROOM.width / Math.max(ROOM.width, ROOM.length), 1, ROOM.length / Math.max(ROOM.width, ROOM.length));
    this.group.add(grid);

    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 1, side: THREE.BackSide });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.length), ceilMat);
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.y = ROOM.height;
    this.group.add(ceil);
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x121b23, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
    const h = ROOM.height;
    const mk = (w, x, z, ry, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat);
      m.position.set(x, h / 2, z);
      m.rotation.y = ry;
      this.group.add(m);
    };
    mk(ROOM.length, -ROOM.halfW, 0, Math.PI / 2);
    mk(ROOM.length, ROOM.halfW, 0, -Math.PI / 2);
    mk(ROOM.width, 0, -ROOM.halfL, 0);
    // 시작 구역(입구 쪽): 본 방과 같은 폭으로 그대로 이어진다. 벽 없음.
    const zEnd = ROOM.halfL + ENTRY.depth;
    const zMid = ROOM.halfL + ENTRY.depth / 2;
    mk(ENTRY.depth, -ROOM.halfW, zMid, Math.PI / 2);
    mk(ENTRY.depth, ROOM.halfW, zMid, -Math.PI / 2);
    mk(ROOM.width, 0, zEnd, Math.PI);
    const corridorFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ENTRY.depth),
      new THREE.MeshStandardMaterial({ color: 0x0e151c, roughness: 0.9 })
    );
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(0, 0, zMid);
    this.group.add(corridorFloor);
    const corridorCeil = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ENTRY.depth),
      new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 1, side: THREE.BackSide })
    );
    corridorCeil.rotation.x = -Math.PI / 2;
    corridorCeil.position.set(0, h, zMid);
    this.group.add(corridorCeil);
    const corridorLight = new THREE.PointLight(0x9fd8ff, 12, 16, 1.6);
    corridorLight.position.set(0, h - 0.2, zMid);
    this.group.add(corridorLight);
    // 시작 위치 표시
    const startMark = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.46, 40),
      new THREE.MeshBasicMaterial({ color: 0x4ef0ff, transparent: true, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide })
    );
    startMark.rotation.x = -Math.PI / 2;
    startMark.position.set(0, 0.006, ROOM.halfL + 2.4);
    this.group.add(startMark);

    // 벽 하단 발광 띠
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x1d4b5e, toneMapped: false });
    const trim = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.05), trimMat);
      m.position.set(x, 0.08, z);
      m.rotation.y = ry;
      this.group.add(m);
    };
    const e = 0.01;
    trim(ROOM.length, -ROOM.halfW + e, 0, Math.PI / 2);
    trim(ROOM.length, ROOM.halfW - e, 0, -Math.PI / 2);
    trim(ROOM.width, 0, -ROOM.halfL + e, 0);
    trim(ROOM.width, 0, ROOM.halfL - e, Math.PI);
  }

  buildSectionLines() {
    SECTIONS.forEach((s, i) => {
      const z0 = worldYToThreeZ(s.y0);
      const z1 = worldYToThreeZ(s.y1);
      const color = SECTION_COLORS[i];
      // 구간 경계 라인 (금고 쪽 경계)
      if (i < SECTIONS.length - 1) {
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(ROOM.width, 0.06),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false })
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.004, z0);
        this.group.add(line);
      }
      // 구간 번호 바닥 표식(얇은 틴트)
      const tint = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM.width - 0.4, Math.abs(z1 - z0) - 0.2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, toneMapped: false })
      );
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(0, 0.003, (z0 + z1) / 2);
      this.group.add(tint);
    });
  }

  buildGates() {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a262f, roughness: 0.6, metalness: 0.4 });
    const gw = 3.2;
    // 입구: 벽 없이 바닥 발광선으로 레이저 구역 시작만 표시
    const entrance = new THREE.Group();
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x4ef0ff, transparent: true, opacity: 0.85, toneMapped: false })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.005, ROOM.halfL);
    entrance.add(startLine);
    this.group.add(entrance);
    this.entranceGate = entrance;

    // 도착 게이트 (-Z): 발광 패널
    const exit = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(gw, 2.6, 0.15), frameMat);
    frame.position.set(0, 1.3, -ROOM.halfL);
    exit.add(frame);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(gw - 0.6, 2.1),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.35, toneMapped: false, side: THREE.DoubleSide })
    );
    glow.position.set(0, 1.1, -ROOM.halfL + 0.09);
    exit.add(glow);
    this.group.add(exit);
    this.exitGate = exit;
  }

  buildPanels() {
    // 각 구간의 금고 쪽 경계, 플레이어 기준 오른쪽 벽(-X)에 패널
    SECTIONS.forEach((s, i) => {
      const z = worldYToThreeZ(s.y0) + 0.6;
      const x = -ROOM.halfW + 0.08;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.5, 0.36),
        new THREE.MeshStandardMaterial({ color: 0x1b2a35, roughness: 0.5, metalness: 0.5 })
      );
      box.position.set(x, 1.25, z);
      this.group.add(box);
      const screenMat = new THREE.MeshBasicMaterial({ color: SECTION_COLORS[i], toneMapped: false });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), screenMat);
      screen.position.set(x + 0.065, 1.27, z);
      screen.rotation.y = Math.PI / 2;
      this.group.add(screen);
      this.panels.push({ section: s.id, screen, color: SECTION_COLORS[i], position: new THREE.Vector3(x, 1.2, z), active: true });
    });
  }

  setPanelState(section, active) {
    const p = this.panels.find((x) => x.section === section);
    if (!p) return;
    p.active = active;
    p.screen.material.color.set(active ? p.color : 0x2a3540);
  }

  resetPanels() {
    this.panels.forEach((p) => this.setPanelState(p.section, true));
  }

  buildLights() {
    const ambient = new THREE.AmbientLight(0x6b8aa0, 0.35);
    this.group.add(ambient);
    const hemi = new THREE.HemisphereLight(0x27404f, 0x05080b, 0.6);
    this.group.add(hemi);
    for (let i = -1; i <= 1; i += 1) {
      const p = new THREE.PointLight(0x9fd8ff, 14, 16, 1.6);
      p.position.set(0, ROOM.height - 0.2, i * (ROOM.length / 3));
      this.group.add(p);
    }
  }
}

export { BOUNDS };
