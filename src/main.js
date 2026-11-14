import { BlacksiteGame } from "./game/Game.js";
import { platform } from "./platform/CrazyGames.js";

const loading=document.getElementById("loading-screen");

async function boot() {
  try {
    await platform.initialize();
    const game=new BlacksiteGame();
    window.blacksiteGame=game;
    platform.loadingStop();
    requestAnimationFrame(()=>loading.classList.add("done"));
    console.info("[BLACKSITE] Boot complete. SDK environment:",platform.environment);
  } catch(error) {
    console.error("[BLACKSITE] Failed to initialize game:",error);
    loading.innerHTML="<div class='loading-title'>BLACKSITE<span>:</span> OUTBREAK</div><p style='font:12px monospace;color:#e58b7d'>Unable to initialize. Refresh the page and try again.</p>";
  }
}

boot();