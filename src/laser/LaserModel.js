/**
 * 레이저 패턴 수식 모델.
 *
 * 데이터(layouts.json)는 게임 월드 좌표계(x: 동쪽, y: 북쪽, z: 위)로 기록되어 있다.
 * 이 모듈은 "시간 t에 어떤 레이저 선분들이 켜져 있는가"를 월드 좌표로 계산한다.
 * Three.js 좌표로의 변환은 world.js 에서 담당한다.
 *
 * 패턴 데이터 출처: gta5-madara.com (Laser Grid Simulator)
 */

import layoutsRaw from "../data/layouts.json";

export const LOOP_SECONDS = 40;

/** 방의 월드 좌표 경계. z0 = 바닥, z1 = 천장. 입구는 y1 쪽, 금고는 y0 쪽. */
export const BOUNDS = {
  x0: 2624.229, x1: 2638.029,
  y0: 5863.85, y1: 5885.85,
  z0: -62, z1: -59
};

/** 입구 → 금고 방향으로 3등분된 구간. */
export const SECTIONS = [
  { id: 1, y0: BOUNDS.y1 - 22 / 3, y1: BOUNDS.y1, idRange: [0, 10] },
  { id: 2, y0: BOUNDS.y1 - 44 / 3, y1: BOUNDS.y1 - 22 / 3, idRange: [11, 20] },
  { id: 3, y0: BOUNDS.y0, y1: BOUNDS.y1 - 44 / 3, idRange: [21, 31] }
];

/** 가로빔(crossbar)의 4단계 높이(월드 z). 바닥(-62) 기준 0.22 / 0.90 / 1.73 / 2.36 m */
const CROSSBAR_HEIGHTS = [-59.638, -60.272, -61.103, -61.783];
const CROSSBAR_X0 = 2624.109;
const CROSSBAR_X1 = 2638.192;

export const LAYOUTS = layoutsRaw;
export const LAYOUT_BY_KEY = Object.fromEntries(LAYOUTS.map((l) => [l.key, l]));

export function layoutKey(difficulty, family) {
  return `${difficulty}_${family}`;
}

export function sectionOfBeam(beamId) {
  for (const s of SECTIONS) {
    if (beamId >= s.idRange[0] && beamId <= s.idRange[1]) return s.id;
  }
  return 0;
}

/** 월드 y 좌표가 속한 구간 번호(1~3). 범위 밖이면 0(입구 쪽) 또는 4(금고 쪽). */
export function sectionOfY(y) {
  if (y > BOUNDS.y1) return 0;
  for (const s of SECTIONS) {
    if (y >= s.y0 && y <= s.y1) return s.id;
  }
  return 4;
}

const degree = (v) => (v * Math.PI) / 180;

function axes(rotation) {
  const [a, b, c] = rotation.map(degree);
  const sa = Math.sin(a), ca = Math.cos(a);
  const sb = Math.sin(b), cb = Math.cos(b);
  const sc = Math.sin(c), cc = Math.cos(c);
  return {
    lateral: [cb * cc, cb * sc, -sb],
    length: [sa * sb * cc - ca * sc, ca * cc + sa * sb * sc, sa * cb]
  };
}

function easing(value, type) {
  const t = Math.max(0, Math.min(1, value));
  if (type === 1 || type === 6) return t * t;
  if (type === 2 || type === 7) return 1 - (1 - t) * (1 - t);
  if (type === 3 || type === 8) return -Math.cos(Math.PI * t) / 2 + 0.5;
  if (type === 4 || type === 9) return t * t * (3 - 2 * t);
  return t;
}

function individualState(schedule, time) {
  if (!schedule || !schedule.mask) return null;
  if (schedule.type === 1) {
    const period = schedule.hidden * 2 + schedule.transition * 2;
    let phase = (((time + schedule.offset) % period) + period) % period;
    phase -= schedule.hidden;
    if (phase < 0) return { active: true, ratio: 0 };
    if (phase < schedule.transition) {
      return { active: true, ratio: easing(phase / schedule.transition, schedule.easing) };
    }
    phase -= schedule.transition + schedule.hidden;
    if (phase < 0) return { active: true, ratio: 1 };
    if (phase < schedule.transition) {
      return { active: true, ratio: 1 - easing(phase / schedule.transition, schedule.easing) };
    }
    return { active: false, ratio: 0 };
  }
  const period = schedule.hidden + schedule.hold + schedule.transition;
  let phase = (((time + schedule.offset) % period) + period) % period;
  phase -= schedule.hidden;
  if (phase < 0) return { active: false, ratio: 0 };
  phase -= schedule.hold;
  if (phase < 0) return { active: true, ratio: 0 };
  if (phase < schedule.transition) {
    return { active: true, ratio: easing(phase / schedule.transition, schedule.easing) };
  }
  return { active: false, ratio: 0 };
}

function groupState(schedule, time, id) {
  if (!schedule || !schedule.phases.length) return null;
  const period = schedule.phases.reduce(
    (sum, phase) => sum + phase.duration + schedule.hold + schedule.hidden, 0
  );
  let cursor = ((time % period) + period) % period;
  for (const phase of schedule.phases) {
    cursor -= schedule.hidden;
    if (cursor < 0) return { active: false, ratio: 0 };
    cursor -= schedule.hold;
    if (cursor < 0) return { active: ((phase.mask >>> id) & 1) !== 0, ratio: 0 };
    if (cursor <= phase.duration) {
      return { active: ((phase.mask >>> id) & 1) !== 0, ratio: cursor / phase.duration };
    }
    cursor -= phase.duration;
  }
  return { active: false, ratio: 0 };
}

function beamState(layout, beam, time) {
  if (beam.groupSchedule >= 0) {
    return groupState(layout.groupSchedules[beam.groupSchedule], time, beam.id);
  }
  if (beam.individualSchedule >= 0) {
    return individualState(layout.individualSchedules[beam.individualSchedule], time);
  }
  return { active: true, ratio: 0 };
}

/**
 * 시간 t(초)의 레이저 선분 목록을 반환한다.
 * @param {object} layout
 * @param {number} time 루프 시간(초)
 * @param {Set<number>} [disabledSections] 꺼진 구간 번호 집합
 * @returns {{id:number, section:number, kind:string, a:number[], b:number[]}[]}
 */
export function createSegments(layout, time, disabledSections) {
  const result = [];
  for (const beam of layout.beams) {
    const section = sectionOfBeam(beam.id);
    const state = beamState(layout, beam, time);
    if (!state || !state.active) continue;
    const base = beam.base.slice();
    const movement = beam.moveAmplitude * state.ratio;
    base[0] += Math.sin(degree(beam.moveAngle)) * movement;
    base[1] += Math.cos(degree(beam.moveAngle)) * movement;

    if (beam.type === "sweep") {
      const count = Math.max(1, beam.count);
      const step = beam.tailOffset / Math.max(1, count - 1);
      for (let i = 0; i < count; i += 1) {
        const offsetY = i * step;
        const phase = time * beam.spread + beam.scalar8;
        const x = base[0] + Math.sin(degree((offsetY + phase) * beam.waveFrequency)) * beam.waveAmplitude;
        const y = base[1] + offsetY;
        result.push({ id: beam.id, section, kind: "sweep", a: [x, y, base[2]], b: [x, y, base[2] - beam.length] });
      }
    } else if (beam.type === "crossbar") {
      for (let bit = 0; bit < 4; bit += 1) {
        if ((beam.scalar8 >> bit) & 1) {
          result.push({
            id: beam.id, section, kind: "crossbar",
            a: [CROSSBAR_X0, base[1], CROSSBAR_HEIGHTS[bit]],
            b: [CROSSBAR_X1, base[1], CROSSBAR_HEIGHTS[bit]]
          });
        }
      }
    } else {
      const o = axes(beam.rotation);
      const count = Math.max(1, beam.count);
      const step = beam.spread / Math.max(1, count - 1);
      for (let i = 0; i < count; i += 1) {
        const lateral = i * step;
        const start = [
          base[0] + o.lateral[0] * lateral,
          base[1] + o.lateral[1] * lateral,
          base[2] + o.lateral[2] * lateral
        ];
        const end = [
          start[0] + o.length[0] * beam.length + o.lateral[0] * beam.tailOffset,
          start[1] + o.length[1] * beam.length + o.lateral[1] * beam.tailOffset,
          start[2] + o.length[2] * beam.length + o.lateral[2] * beam.tailOffset
        ];
        const horizontal = Math.hypot(end[0] - start[0], end[1] - start[1]);
        result.push({ id: beam.id, section, kind: horizontal > 0.25 ? "slant" : "static", a: start, b: end });
      }
    }
  }
  if (!disabledSections || disabledSections.size === 0) return result;
  // 패널로 끈 구간: 선분의 중점이 그 구간 안에 있으면 숨긴다.
  // (빔 id 와 실제 위치가 항상 일치하지는 않아, 플레이어가 보는 공간 기준으로 판단한다)
  return result.filter((s) => !disabledSections.has(sectionOfY((s.a[1] + s.b[1]) / 2)));
}

/** 전체 레이아웃에서 나올 수 있는 최대 선분 수(버퍼 크기 산정용). */
export function maxSegmentCount(layout) {
  let n = 0;
  for (const beam of layout.beams) {
    if (beam.type === "crossbar") {
      for (let bit = 0; bit < 4; bit += 1) if ((beam.scalar8 >> bit) & 1) n += 1;
    } else {
      n += Math.max(1, beam.count);
    }
  }
  return n;
}
