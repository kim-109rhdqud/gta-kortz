import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { toThree } from "../world/coords.js";

/** 레이저 종류별 색. 사이트 참고 색과 겹치지 않게 자체 팔레트. */
export const LASER_COLORS = {
  static: new THREE.Color("#4ef0ff"),   // 고정 기둥: 시안
  slant: new THREE.Color("#8cff6a"),    // 사선: 연두
  sweep: new THREE.Color("#ffb347"),    // 스윕: 주황
  crossbar: new THREE.Color("#ff4f6d") // 가로빔: 붉은색
};
const HIT_COLOR = new THREE.Color("#ffffff");

/**
 * 매 프레임 바뀌는 레이저 선분을 굵은 선(LineSegments2)으로 그린다.
 * 버퍼를 최대 크기로 한 번만 만들고 instanceCount 로 그리는 개수를 조절한다.
 */
export class LaserRenderer {
  constructor(scene, maxSegments) {
    this.max = Math.max(1, maxSegments);
    this.geometry = new LineSegmentsGeometry();
    const positions = new Float32Array(this.max * 6);
    const colors = new Float32Array(this.max * 6);
    this.geometry.setPositions(positions);
    this.geometry.setColors(colors);
    this.posAttr = this.geometry.getAttribute("instanceStart").data;
    this.colAttr = this.geometry.getAttribute("instanceColorStart").data;

    this.material = new LineMaterial({
      vertexColors: true,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false
    });
    this.mesh = new LineSegments2(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);

    // 바닥에 비치는 레이저 점 (기둥/스윕이 바닥에 닿는 자리)
    const dotGeo = new THREE.CircleGeometry(0.06, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false });
    this.dots = new THREE.InstancedMesh(dotGeo, dotMat, this.max);
    this.dots.frustumCulled = false;
    this.dots.rotation.x = -Math.PI / 2;
    this.dots.position.y = 0.005;
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    scene.add(this.dots);

    this._a = { x: 0, y: 0, z: 0 };
    this._b = { x: 0, y: 0, z: 0 };
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this.hitIds = new Set();
    this.hitFlash = 0;
  }

  setResolution(w, h) {
    this.material.resolution.set(w, h);
  }

  /** @param segments LaserModel.createSegments 결과 */
  update(segments, dt) {
    const n = Math.min(segments.length, this.max);
    const pos = this.posAttr.array;
    const col = this.colAttr.array;
    let dots = 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2);

    for (let i = 0; i < n; i += 1) {
      const s = segments[i];
      toThree(s.a, this._a);
      toThree(s.b, this._b);
      const o = i * 6;
      pos[o] = this._a.x; pos[o + 1] = this._a.y; pos[o + 2] = this._a.z;
      pos[o + 3] = this._b.x; pos[o + 4] = this._b.y; pos[o + 5] = this._b.z;

      const base = LASER_COLORS[s.kind] || LASER_COLORS.static;
      if (this.hitIds.has(s.id) && this.hitFlash > 0) {
        this._c.copy(base).lerp(HIT_COLOR, Math.min(1, this.hitFlash));
      } else {
        this._c.copy(base);
      }
      col[o] = this._c.r; col[o + 1] = this._c.g; col[o + 2] = this._c.b;
      col[o + 3] = this._c.r; col[o + 4] = this._c.g; col[o + 5] = this._c.b;

      // 수직에 가까운 선분은 바닥에 점을 찍어 위치 가독성을 높인다.
      const vertical = Math.abs(this._a.x - this._b.x) < 0.05 && Math.abs(this._a.z - this._b.z) < 0.05;
      if (vertical && Math.min(this._a.y, this._b.y) < 0.2) {
        // dots 메시는 X축 -90° 회전 상태라 로컬 (x, y) 가 월드 (x, -z) 에 대응
        this._m.identity();
        this._m.setPosition(this._a.x, -this._a.z, 0);
        this.dots.setMatrixAt(dots, this._m);
        this.dots.setColorAt(dots, base);
        dots += 1;
      }
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.geometry.instanceCount = n;
    this.dots.count = dots;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  flashHit(ids) {
    this.hitIds = new Set(ids);
    this.hitFlash = 1.2;
  }

  setVisible(v) {
    this.mesh.visible = v;
    this.dots.visible = v;
  }
}
