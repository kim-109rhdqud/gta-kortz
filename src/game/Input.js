/**
 * 키보드 입력. WASD/방향키 이동, Shift 달리기, Ctrl/C 앉기(홀드), E 상호작용(단발).
 * consumeKeys() 는 이번 프레임에 눌린(keydown) 키를 한 번만 돌려준다.
 */
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.frameKeys = new Set();
    this.crouchToggle = false;
    this.toggleCrouch = false; // 설정: true 면 C 토글, false 면 홀드

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (e.code === "KeyC") this.crouchToggle = !this.crouchToggle;
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => {
      this.down.clear();
    });
  }

  read() {
    const d = this.down;
    const forward = (d.has("KeyW") || d.has("ArrowUp") ? 1 : 0) - (d.has("KeyS") || d.has("ArrowDown") ? 1 : 0);
    const right = (d.has("KeyD") || d.has("ArrowRight") ? 1 : 0) - (d.has("KeyA") || d.has("ArrowLeft") ? 1 : 0);
    const run = d.has("ShiftLeft") || d.has("ShiftRight");
    const crouchHold = d.has("ControlLeft") || d.has("ControlRight");
    const crouch = crouchHold || this.crouchToggle;
    const interact = this.frameKeys.has("KeyE");
    return { forward, right, run, crouch, interact };
  }

  /** 프레임 시작 시 한 번 호출. 이번 프레임에 눌린 키 집합을 돌려주고 read() 에서도 같은 집합을 쓴다. */
  consumeKeys() {
    this.frameKeys = new Set(this.pressed);
    this.pressed.clear();
    return this.frameKeys;
  }
}
