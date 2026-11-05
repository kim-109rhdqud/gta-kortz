/**
 * 선분-선분 최단거리. 플레이어 캡슐(선분 + 반지름)과 레이저(선분)의 충돌 판정에 사용.
 * 입력은 모두 Three.js 좌표계의 {x,y,z}.
 */

const EPS = 1e-9;

export function segmentSegmentDistanceSq(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;

  if (a <= EPS && e <= EPS) {
    return rx * rx + ry * ry + rz * rz;
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t);
  const cy = p1.y + d1y * s - (p2.y + d2y * t);
  const cz = p1.z + d1z * s - (p2.z + d2z * t);
  return cx * cx + cy * cy + cz * cz;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
