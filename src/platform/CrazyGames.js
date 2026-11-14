const getSDK = () => {
  try {
    return window.CrazyGames && window.CrazyGames.SDK ? window.CrazyGames.SDK : null;
  } catch {
    return null;
  }
};

export class CrazyGamesBridge {
  constructor() {
    this.sdk = null;
    this.ready = false;
    this.environment = "local";
    this.muteAudio = false;
    this.store = window.localStorage;
    this.lastGameplayState = false;
    this.settingsListener = (settings) => {
      this.muteAudio = Boolean(settings?.muteAudio);
      window.dispatchEvent(new CustomEvent("platform-audio-settings", { detail: { muted: this.muteAudio } }));
    };
  }

  async initialize() {
    this.sdk = getSDK();
    if (!this.sdk) return false;
    try {
      await this.sdk.init();
      this.ready = true;
      try { this.sdk.game?.loadingStart?.(); } catch (error) { console.warn("[BLACKSITE] loadingStart:", error); }
      this.environment = this.sdk.environment || "unknown";
      if (this.environment !== "disabled" && this.sdk.data) this.store = this.sdk.data;
      const current = this.sdk.game?.settings;
      if (current) this.settingsListener(current);
      this.sdk.game?.addSettingsChangeListener?.(this.settingsListener);
      return true;
    } catch (error) {
      console.info("[BLACKSITE] CrazyGames SDK unavailable; using local save.", error);
      this.ready = false;
      this.environment = "local";
      return false;
    }
  }

  loadingStop() {
    if (!this.ready || this.environment === "disabled") return;
    try { this.sdk.game.loadingStop(); } catch (error) { console.warn("[BLACKSITE] loadingStop:", error); }
  }

  gameplayStart() {
    if (this.lastGameplayState) return;
    this.lastGameplayState = true;
    if (!this.ready || this.environment === "disabled") return;
    try { this.sdk.game.gameplayStart(); } catch (error) { console.warn("[BLACKSITE] gameplayStart:", error); }
  }

  gameplayStop() {
    if (!this.lastGameplayState) return;
    this.lastGameplayState = false;
    if (!this.ready || this.environment === "disabled") return;
    try { this.sdk.game.gameplayStop(); } catch (error) { console.warn("[BLACKSITE] gameplayStop:", error); }
  }

  happyTime() {
    if (!this.ready || this.environment === "disabled") return;
    try { this.sdk.game.happytime(); } catch (error) { console.warn("[BLACKSITE] happytime:", error); }
  }

  getItem(key) {
    try { return this.store.getItem(key); } catch { return null; }
  }

  setItem(key, value) {
    try { this.store.setItem(key, String(value)); } catch (error) { console.warn("[BLACKSITE] save failed:", error); }
  }

  rewardedAd({onStart=()=>{},onFinish=()=>{},onError=()=>{}}={}) {
    if (!this.ready || this.environment !== "crazygames" || !this.sdk.ad?.requestAd) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled=false;
      const finish=(value)=>{if(settled)return;settled=true;resolve(value);};
      try {
        const result=this.sdk.ad.requestAd("rewarded", {
          adStarted:()=>onStart(),
          adFinished:()=>{onFinish();finish(true);},
          adError:(error)=>{console.warn("[BLACKSITE] rewarded ad:",error);onError(error);finish(false);}
        });
        if(result && typeof result.catch==="function") result.catch(error=>{console.warn("[BLACKSITE] rewarded ad:",error);onError(error);finish(false);});
      } catch(error) {
        console.warn("[BLACKSITE] rewarded ad unavailable:",error);
        onError(error);
        finish(false);
      }
    });
  }
}

export const platform = new CrazyGamesBridge();