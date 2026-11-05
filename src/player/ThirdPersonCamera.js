import * as THREE from "three";
import { ROOM } from "../world/coords.js";

/**
 * 3인칭 뒤쪽 카메라. 마우스로 회전(포인터 락), 휠로 거리.
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
    this.sensitivity = 0.0022;
    this.topView = false;
    this.locked = false;
    this._target = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._smoothPos = new THREE.Vector3();
    this._first = true;

    this.onMouseMove = (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * this.sensitivity, -0.2, 1.2);
    };
    this.onWheel = (e) => {
      this.distance = THREE.MathUtils.clamp(this.distance + Math.sign(e.deltaY) * 0.4, this.minDistance, this.maxDistance);
    };
    document.addEventListener("mousemove", this.onMouseMove);
    this.dom.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (document.pointerLockElement !== this.dom) {
      this.dom.requestPointerLock?.();
    }
  }

  releaseLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0.32;
    this._first = true;
  }

  /** @param playerPos 플레이어 발 위치, playerHeight 현재 키 */
  update(dt, playerPos, playerHeight) {
    if (this.topView) {
      this._target.set(playerPos.x * 0.3, 0, playerPos.z * 0.6);
      this._pos.set(this._target.x, 26, this._target.z + 0.01);
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
    this._pos.x = THREE.MathUtils.clamp(this._pos.x, -ROOM.halfW + 0.15, ROOM.halfW - 0.15);
    this._pos.y = THREE.MathUtils.clamp(this._pos.y, 0.3, ROOM.height - 0.1);
    // 입구(+Z) 쪽은 벽이 안쪽에서만 보이므로 카메라가 조금 빠져나가도 된다.
    this._pos.z = THREE.MathUtils.clamp(this._pos.z, -ROOM.halfL + 0.15, ROOM.halfL + 3);
    if (this._first) {
      this.camera.position.copy(this._pos);
      this._first = false;
    } else {
      this.camera.position.lerp(this._pos, Math.min(1, 18 * dt));
    }
    this.camera.lookAt(this._target);
  }
}
