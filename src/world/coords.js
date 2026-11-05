/**
 * 게임 월드 좌표(x 동, y 북, z 위) ↔ Three.js 좌표(Y-up) 변환.
 *
 * 플레이어는 입구(y1)에서 금고(y0)를 향해, 즉 남쪽으로 걷는다.
 * Three.js 에서 카메라 정면을 -Z 로 두기 위해 Z_three = y - cy 로 두고,
 * 좌우가 뒤집히지 않도록(남쪽을 보면 동쪽이 왼쪽) X_three = -(x - cx) 로 둔다.
 * 이 변환은 반사가 아닌 순수 회전이라 레이저 좌우 배치가 게임과 같다.
 */

import { BOUNDS } from "../laser/LaserModel.js";

export const CX = (BOUNDS.x0 + BOUNDS.x1) / 2;
export const CY = (BOUNDS.y0 + BOUNDS.y1) / 2;
export const FLOOR_Z = BOUNDS.z0;

/** 입구 벽(+Z) 뒤에 붙는 진입 통로. 플레이어는 여기서 시작해 첫 레이저보다 뒤에 선다. */
export const ENTRY = {
  depth: 6,      // 통로 길이 (Z) — 3인칭 카메라가 뒤에 설 공간 포함
  halfW: 2,      // 통로 반폭 (X)
  gateHalfW: 1.6 // 입구 개구부 반폭
};

export const ROOM = {
  width: BOUNDS.x1 - BOUNDS.x0,   // X 방향 폭 (13.8m)
  length: BOUNDS.y1 - BOUNDS.y0,  // Z 방향 길이 (22m)
  height: BOUNDS.z1 - BOUNDS.z0,  // 높이 (3m)
  halfW: (BOUNDS.x1 - BOUNDS.x0) / 2,
  halfL: (BOUNDS.y1 - BOUNDS.y0) / 2
};

/** 월드 [x,y,z] → Three.js {x,y,z} */
export function toThree(p, out) {
  const o = out || { x: 0, y: 0, z: 0 };
  o.x = -(p[0] - CX);
  o.y = p[2] - FLOOR_Z;
  o.z = p[1] - CY;
  return o;
}

/** Three.js 위치 → 월드 y (구간 판정용) */
export function threeZToWorldY(z) {
  return z + CY;
}

/** 월드 y → Three.js z */
export function worldYToThreeZ(y) {
  return y - CY;
}
