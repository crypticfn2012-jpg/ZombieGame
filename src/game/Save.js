import { platform } from "../platform/CrazyGames.js";

const KEY = "blacksite.outbreak.save.v1";
const DEFAULTS = {
  bestRound: 0,
  totalKills: 0,
  totalPlaytime: 0,
  documents: [],
  achievements: [],
  settings: { volume: 70, sensitivity: 70, fov: 85, quality: "high", invert: false }
};

export class SaveSystem {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const raw = platform.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULTS),
        ...parsed,
        documents: Array.isArray(parsed.documents) ? parsed.documents : [],
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) }
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  save() {
    try { platform.setItem(KEY, JSON.stringify(this.data)); } catch (error) { console.warn("[BLACKSITE] Could not save progress", error); }
  }

  updateRun(round, kills, playtime) {
    this.data.bestRound = Math.max(this.data.bestRound, round);
    this.data.totalKills += kills;
    this.data.totalPlaytime += playtime;
    if (round >= 5 && !this.data.achievements.includes("survivor")) this.data.achievements.push("survivor");
    if (round >= 10 && !this.data.achievements.includes("veteran")) this.data.achievements.push("veteran");
    this.save();
  }

  discover(id) {
    if (!this.data.documents.includes(id)) {
      this.data.documents.push(id);
      this.save();
      return true;
    }
    return false;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }
}