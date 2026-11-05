import * as THREE from "three";
import { ROOM, ENTRY, EXIT } from "../world/coords.js";

/**
 * 3인칭 뒤쪽 카메라. 포인터 락을 쓰지 않는다 — 커서는 항상 보이고,
 * 캔버스를 마우스(좌/우 버튼)로 드래그하는 동안만 회전. 휠로 거리.
 * V 키로 탑뷰 전환(연습용 전체 조망).
 */
export class ThirdPersonCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.yaw = 0;            // 0 = 플레이어 뒤에서 -Z(금고 쪽)를 바라봄
    this.pitch = 0.32;       // 라디안, 위에서 내려보는 각
    this.distance = 3.6;
    this.minDistance = 1.8;
    this.maxDistance = 7;
    this.sensitivity = 0.0045;
    this.topView = false;
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._target = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._first = true;

    this.dom.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.dom.setPointerCapture?.(e.pointerId);
      this.dom.style.cursor = "grabbing";
    });
    const stop = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dom.releasePointerCapture?.(e.pointerId);
      this.dom.style.cursor = "";
    };
    this.dom.addEventListener("pointerup", stop);
    this.dom.addEventListener("pointercancel", stop);
    this.dom.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.yaw -= dx * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * this.sensitivity, -0.2, 1.2);
    });
    this.dom.addEventListener("contextmenu", (e) => e.preventDefault());
    this.dom.addEventListener("wheel", (e) => {
      this.distance = THREE.MathUtils.clamp(this.distance + Math.sign(e.deltaY) * 0.4, this.minDistance, this.maxDistance);
    }, { passive: true });
  }

  /** 예전 포인터 락 API와의 호환용 — 이제 아무것도 하지 않는다. */
  requestLock() {}
  releaseLock() {}

  reset() {
    this.yaw = 0;
    this.pitch = 0.32;
    this._first = true;
  }

  /** @param playerPos 플레이어 발 위치, playerHeight 현재 키 */
  update(dt, playerPos, playerHeight) {
    if (this.topView) {
      this._target.set(playerPos.x * 0.3, 0, playerPos.z * 0.6 + 1);
      this._pos.set(this._target.x, 28, this._target.z + 0.01);
      this.camera.position.lerp(this._pos, this._first ? 1 : Math.min(1, 6 * dt));
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(this._target);
      this._first = false;
      return;
    }
    this.camera.up.set(0, 1, 0);
    const eyeY = playerHeight * 0.85;
    this._target.set(playerPos.x, playerPos.y + eyeY, playerPos.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // yaw=0 일 때 카메라는 +Z 쪽(플레이어 뒤)에 위치
    this._pos.set(
      this._target.x + Math.sin(this.yaw) * cp * this.distance,
      this._target.y + sp * this.distance,
      this._target.z + Math.cos(this.yaw) * cp * this.distance
    );
    // 카메라가 벽 밖으로 나가지 않도록 방 안으로 클램프
    this._pos.y = THREE.MathUtils.clamp(this._pos.y, 0.3, ROOM.height - 0.1);
    this._pos.z = THREE.MathUtils.clamp(this._pos.z, -ROOM.halfL - EXIT.depth + 0.15, ROOM.halfL + ENTRY.depth - 0.15);
    this._pos.x = THREE.MathUtils.clamp(this._pos.x, -ROOM.halfW + 0.15, ROOM.halfW - 0.15);
    if (this._first) {
      this.camera.position.copy(this._pos);
      this._first = false;
    } else {
      this.camera.position.lerp(this._pos, Math.min(1, 18 * dt));
    }
    this.camera.lookAt(this._target);
  }
}
