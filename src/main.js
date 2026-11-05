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

