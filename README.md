# Laser Grid Trainer

금고 레이저 구간을 3D로 직접 걸어서 통과하는 **비공식 연습용 웹 게임**입니다.
실제 레이저 패턴(Normal/Hard × 3가지 배치, 40초 루프)을 그대로 재현하고, 연습에 필요한 기능(배속, 미니맵, 접촉 지점 표시, 구간 재시작)을 더했습니다.

> 이 프로젝트는 팬이 만든 비공식 도구이며 Rockstar Games / Take-Two Interactive 와 무관합니다. 게임의 이름·캐릭터·그래픽·음악을 사용하지 않습니다.
> 레이저 패턴 데이터 출처: [gta5-madara.com Laser Grid Simulator](https://gta5-madara.com/en/online/the-kortz-center-heist-update/laser-grid-simulator/)

## 기능

- 레이아웃 6종: Normal / Hard × P1 · P2 · P3 (랜덤 선택 가능)
- 레이저 3종 재현: 고정·이동 기둥, 물결치는 스윕 레이저, 4단 높이 가로빔
- 3인칭 캡슐 플레이어: 걷기 / 달리기(Shift) / 앉기(Ctrl 홀드, C 토글)
- 정확한 캡슐–선분 충돌 판정 (앉으면 판정 높이도 줄어듦)
- 접촉 시 동작 선택: 구간 재시작 / 처음부터 / 카운트만(자유 연습)
- 배속 0.25× ~ 1× (숫자키 1~4)
- 미니맵(M), 탑뷰(V), 루프 타임라인, 접촉 지점 마커
- 패널(E)로 구간 레이저 차단
- 이동 속도·키·반지름·마우스 감도 세부 조정 (브라우저에 저장)
- 무접촉 최고 기록 저장

## 조작

| 키 | 동작 |
|---|---|
| W A S D / 방향키 | 이동 |
| 마우스 | 카메라 회전 (클릭하면 포인터 잠금) |
| 휠 | 카메라 거리 |
| Shift | 달리기 |
| Ctrl (홀드) / C (토글) | 앉기 |
| E | 패널 조작 |
| R | 구간 시작점으로 |
| V | 탑뷰 전환 |
| 1 2 3 4 | 배속 0.25 / 0.5 / 0.75 / 1 |
| M | 미니맵 토글 |
| Esc | 일시정지 |

## 실행

```bash
npm install
npm run dev
```

빌드:

```bash
npm run build
npm run preview
```

## 배포 (GitHub Pages)

`main` 브랜치에 push 하면 `.github/workflows/deploy.yml` 이 자동으로 빌드해서 GitHub Pages 에 올립니다.
저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 한 번만 설정해 주세요.

## 구조

```
src/
  data/layouts.json      레이저 패턴 데이터 (6개 레이아웃)
  laser/LaserModel.js    시간 t → 레이저 선분 계산 (패턴 수식)
  laser/LaserRenderer.js 굵은 발광 선으로 렌더링
  world/coords.js        게임 좌표 ↔ Three.js 좌표 변환
  world/Room.js          훈련실(바닥/벽/구간 경계/패널/게이트)
  player/Player.js       캡슐 플레이어 컨트롤러
  player/ThirdPersonCamera.js
  player/CharacterLoader.js  (선택) public/models/character.glb 로드
  game/Game.js           게임 상태·루프·충돌·기록
  game/Input.js          키 입력
  game/collision.js      선분-선분 최단거리
  ui/UI.js               메뉴·HUD·미니맵
```

## 캐릭터 모델 (선택)

`public/models/character.glb` 를 넣으면 캡슐 대신 그 모델이 표시됩니다. 자세한 조건은 `public/models/README.md` 참고.

## 이동 속도 보정

실제 게임의 걷기/달리기/앉아 걷기 속도는 데이터에 없어서 근사값으로 넣었습니다(걷기 1.7, 달리기 3.4, 앉기 1.3 m/s).
메뉴의 **세부 설정**에서 조정할 수 있으니, 실제 플레이 감각과 비교해 맞춰 쓰세요.
