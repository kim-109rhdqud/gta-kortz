import { Game, DEFAULT_SETTINGS } from "./game/Game.js";
import { UI } from "./ui/UI.js";

const ui = new UI();
const game = new Game(document.getElementById("game"), ui);

ui.on("setting", (patch) => game.applySettings(patch));
ui.on("resetSettings", () => game.applySettings(structuredClone(DEFAULT_SETTINGS)));
ui.on("start", () => game.startRun());
ui.on("resume", () => game.resume());
ui.on("restart", () => game.restart());
ui.on("menu", () => game.backToMenu());

ui.syncSettings(game.settings);
ui.showMenu(true);
ui.showHud(false);

// 디버깅/자동 테스트용
window.__game = game;

// 플레이 중 캔버스를 클릭하면 다시 포인터 락
document.getElementById("game").addEventListener("click", () => {
  if (game.state === "running" || game.state === "ready") game.cameraCtl.requestLock();
});
