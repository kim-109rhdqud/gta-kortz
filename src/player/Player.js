import * as THREE from "three";
import { ROOM } from "../world/coords.js";

/**
 * 플레이어 캡슐 컨트롤러.
 * 판정은 항상 캡슐(선분 + 반지름)로 하고, 보이는 모델은 그 위에 얹는다.
 * 속도/키 값은 settings 로 조절 가능 (실제 게임 감각에 맞게 튠).
 */
export const DEFAULT_PLAYER_SETTINGS = {
  walkSpeed: 1.7,      // m/s
  runSpeed: 3.4,       // m/s (Shift)
  crouchSpeed: 1.3,    // m/s
  standHeight: 1.8,    // m
  crouchHeight: 1.15,  // m
  radius: 0.3,         // m
  stanceTime: 0.35,    // 서기↔앉기 전환 시간(초)
  accel: 18,           // 가감속
  jumpHeight: 0.9,     // m (점프 최고 높이)
  gravity: 22          // m/s²
};

export class Player {
  constructor(scene, settings) {
    this.settings = { ...DEFAULT_PLAYER_SETTINGS, ...(settings || {}) };
    this.position = new THREE.Vector3(0, 0, ROOM.halfL - 1.2);
    this.velocity = new THREE.Vector3();
    this.heading = 0; // 시선 방향(라디안). 0 = -Z 방향(금고 쪽)
    this.crouching = false;
    this.stance = 0; // 0 = 서있음, 1 = 앉음 (보간값)
    this.moving = false;
    this.running = false;
    this.vy = 0;
    this.grounded = true;

    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildCapsule();
    this.model = null; // glTF 캐릭터가 로드되면 여기에
  }

  buildCapsule() {
    const { radius, standHeight } = this.settings;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe8f4ff, roughness: 0.35, metalness: 0.1,
      emissive: 0x7fb6d6, emissiveIntensity: 0.25
    });
    const len = standHeight - radius * 2;
    this.capsule = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 6, 16), mat);
    this.capsule.position.y = standHeight / 2;
    this.capsule.castShadow = true;
    this.group.add(this.capsule);

    // 정면 표시(어느 쪽을 보는지)
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.22, 10),
      new THREE.MeshBasicMaterial({ color: 0x4ef0ff, toneMapped: false })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, standHeight * 0.78, -radius - 0.08);
    this.nose = nose;
    this.group.add(nose);

    // 바닥 링
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius + 0.02, radius + 0.08, 32),
      new THREE.MeshBasicMaterial({ color: 0x4ef0ff, transparent: true, opacity: 0.7, toneMapped: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.group.add(ring);
  }

  setModel(object3d) {
    this.model = object3d;
    this.capsule.visible = false;
    this.nose.visible = false;
    this.group.add(object3d);
  }

  reset(zOverride) {
    this.position.set(0, 0, zOverride ?? ROOM.halfL - 1.2);
    this.velocity.set(0, 0, 0);
    this.heading = 0;
    this.crouching = false;
    this.stance = 0;
    this.vy = 0;
    this.grounded = true;
    this.syncVisual();
  }

  /** 현재 키(앉은 상태 반영). */
  get height() {
    const s = this.settings;
    return s.standHeight + (s.crouchHeight - s.standHeight) * this.stance;
  }

  /**
   * @param dt 게임 시간 변화량(배속 반영)
   * @param input {forward, right, run, crouch} forward/right 는 -1~1 (카메라 기준)
   * @param cameraYaw 카메라 수평 각(라디안). 이동 방향은 카메라 기준.
   */
  update(dt, input, cameraYaw) {
    const s = this.settings;
    // 점프: 바닥에 있을 때만. 점프하면 앉기는 해제된다.
    if (input.jump && this.grounded) {
      this.vy = Math.sqrt(2 * s.gravity * s.jumpHeight);
      this.grounded = false;
      this.onJump?.();
    }
    if (!this.grounded) {
      this.vy -= s.gravity * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.crouching = input.crouch && this.grounded;
    const target = this.crouching ? 1 : 0;
    const step = dt / s.stanceTime;
    this.stance += Math.sign(target - this.stance) * Math.min(step, Math.abs(target - this.stance));

    let dirX = 0, dirZ = 0;
    const len = Math.hypot(input.forward, input.right);
    if (len > 0.001) {
      const f = input.forward / Math.max(1, len);
      const r = input.right / Math.max(1, len);
      // 카메라 yaw 기준 전/우 벡터
      const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
      dirX = fx * f + rx * r;
      dirZ = fz * f + rz * r;
    }
    this.moving = len > 0.001;
    this.running = input.run && !this.crouching && this.moving;
    const maxSpeed = this.crouching ? s.crouchSpeed : (input.run ? s.runSpeed : s.walkSpeed);

    const tvx = dirX * maxSpeed, tvz = dirZ * maxSpeed;
    // 공중에서는 방향 전환이 둔하다
    const k = Math.min(1, (this.grounded ? s.accel : s.accel * 0.15) * dt);
    this.velocity.x += (tvx - this.velocity.x) * k;
    this.velocity.z += (tvz - this.velocity.z) * k;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // 벽 충돌: 방 안으로 클램프 (입구/도착 게이트 바깥으로는 조금 나갈 수 있게 여유)
    const r = s.radius;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -ROOM.halfW + r, ROOM.halfW - r);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -ROOM.halfL - 0.4, ROOM.halfL - r);

    if (this.moving) {
      const targetHeading = Math.atan2(dirX, dirZ) + Math.PI; // 모델의 -Z 가 정면
      this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, 14 * dt));
    }
    this.syncVisual();
  }

  syncVisual() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    const h = this.height;
    const scaleY = h / this.settings.standHeight;
    this.capsule.scale.y = scaleY;
    this.capsule.position.y = h / 2;
    this.nose.position.y = h * 0.78;
    if (this.model) {
      // 외부 모델에는 앉기 애니메이션이 있으면 그걸 쓰고, 없으면 살짝 눌러준다
      this.model.scale.y = this.model.userData.hasCrouchAnim ? 1 : 1 - 0.25 * this.stance;
    }
  }

  /** 충돌 판정용 캡슐 선분(발 + r ~ 머리 - r). */
  getCapsuleSegment(outA, outB) {
    const r = this.settings.radius;
    const h = this.height;
    outA.set(this.position.x, this.position.y + r, this.position.z);
    outB.set(this.position.x, this.position.y + Math.max(r + 0.01, h - r), this.position.z);
    return r;
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
