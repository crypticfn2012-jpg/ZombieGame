export class GameUI {
  constructor(save, handlers={}) {
    this.save=save;
    this.handlers=handlers;
    this.currentScreen="menu";
    this.settingsReturn="menu";
    this.toastTimer=null;
    this.toastNode=document.getElementById("toast");
    this.screens=["menu","help","settings","pause","death"].map(id=>document.getElementById("screen-"+id));
    this.hud=document.getElementById("hud");
    this.bind();
    this.loadSettings();
    this.updateMenuStats();
  }

  bind() {
    const $=id=>document.getElementById(id);
    $("start-button").addEventListener("click",()=>this.handlers.onStart?.());
    $("how-button").addEventListener("click",()=>this.showScreen("help"));
    $("settings-button").addEventListener("click",()=>this.openSettings("menu"));
    $("help-back").addEventListener("click",()=>this.showScreen("menu"));
    $("settings-back").addEventListener("click",()=>this.showScreen(this.settingsReturn));
    $("pause-settings-button").addEventListener("click",()=>this.openSettings("pause"));
    $("resume-button").addEventListener("click",()=>this.handlers.onResume?.());
    $("restart-button").addEventListener("click",()=>this.handlers.onRestart?.());
    $("menu-button").addEventListener("click",()=>this.handlers.onMenu?.());
    $("reward-revive-button").addEventListener("click",()=>this.handlers.onRewardRevive?.());
    $("death-restart-button").addEventListener("click",()=>this.handlers.onRestart?.());
    $("death-menu-button").addEventListener("click",()=>this.handlers.onMenu?.());
    $("pause-hud-button").addEventListener("click",()=>this.handlers.onPause?.());
    const range=(id,key,format)=>{
      const el=$(id), out=$(id+"-value");
      el.addEventListener("input",()=>{
        const value=Number(el.value);
        if(out) out.textContent=format(value);
        this.save.setSetting(key,value);
        this.handlers.onSettings?.(this.save.data.settings);
      });
    };
    range("setting-volume","volume",v=>v+"%");
    range("setting-sensitivity","sensitivity",v=>v+"%");
    range("setting-fov","fov",v=>v+"°");
    $("setting-quality").addEventListener("change",event=>{
      this.save.setSetting("quality",event.target.value);
      this.handlers.onSettings?.(this.save.data.settings);
    });
    $("setting-invert").addEventListener("change",event=>{
      this.save.setSetting("invert",event.target.checked);
      this.handlers.onSettings?.(this.save.data.settings);
    });
  }

  loadSettings() {
    const s=this.save.data.settings;
    document.getElementById("setting-volume").value=s.volume;
    document.getElementById("setting-volume-value").textContent=s.volume+"%";
    document.getElementById("setting-sensitivity").value=s.sensitivity;
    document.getElementById("setting-sensitivity-value").textContent=s.sensitivity+"%";
    document.getElementById("setting-fov").value=s.fov;
    document.getElementById("setting-fov-value").textContent=s.fov+"°";
    document.getElementById("setting-quality").value=s.quality;
    document.getElementById("setting-invert").checked=Boolean(s.invert);
  }

  showScreen(name) {
    this.currentScreen=name;
    for(const screen of this.screens) screen.classList.remove("screen-visible");
    if(name!=="game") {
      const node=document.getElementById("screen-"+name);
      node?.classList.add("screen-visible");
    }
    this.hud.classList.toggle("hidden",name!=="game");
  }

  openSettings(returnTo) {
    this.settingsReturn=returnTo;
    this.loadSettings();
    this.showScreen("settings");
  }

  showMenu() {
    this.showScreen("menu");
    this.updateMenuStats();
  }

  showGame() {
    this.showScreen("game");
    this.notify("FACILITY ENTRY CONFIRMED","Eliminate infected hostiles. Earn credits. Find the power relay.",true);
  }

  showPause() {
    this.showScreen("pause");
  }

  showDeath(stats) {
    document.getElementById("death-round").textContent=String(stats.round).padStart(2,"0");
    document.getElementById("death-kills").textContent=String(stats.kills).padStart(3,"0");
    document.getElementById("death-points").textContent=String(stats.points).padStart(4,"0");
    document.getElementById("reward-revive-button").classList.toggle("hidden",!this.handlers.canReward?.());
    this.showScreen("death");
  }

  updateMenuStats() {
    document.getElementById("menu-best-round").textContent=String(this.save.data.bestRound).padStart(2,"0");
    document.getElementById("menu-total-kills").textContent=String(this.save.data.totalKills).padStart(3,"0");
  }

  setRound(round,status="INCOMING") {
    document.getElementById("hud-round").textContent=String(round).padStart(2,"0");
    document.getElementById("hud-wave-status").textContent=status;
  }

  setPoints(points) {
    const node=document.getElementById("hud-points"); const value=Math.floor(points).toLocaleString("en-GB"); if(node.textContent!==value) node.textContent=value;
  }

  setHealth(health,maxHealth,armor=0) {
    const pct=Math.max(0,health/maxHealth)*100;
    const fill=document.getElementById("health-fill"); const width=pct+"%"; if(fill.style.width!==width) fill.style.width=width;
    const value=document.getElementById("health-value"); const healthText=String(Math.ceil(health)); if(value.textContent!==healthText) value.textContent=healthText;
    const row=document.querySelector(".health-row");
    row.classList.toggle("health-critical",pct<35);
    row.dataset.armor=armor>0?"ARMOUR "+armor:"";
  }

  setAmmo(data) {
    const name=document.getElementById("hud-weapon");
    if(name.textContent!==(data.name||"")) name.textContent=data.name||"";
    const slots=document.getElementById("weapon-slots");
    if(slots) {
      const signature=(data.slots||[]).map(item=>item.id+":"+item.active).join("|")+"|"+Boolean(data.melee);
      if(slots.dataset.signature!==signature) {
        slots.dataset.signature=signature;
        slots.innerHTML=(data.slots||[]).map(item=>`<div class="weapon-slot ${item.active&&!data.melee?"active":""}"><small>${item.slot}</small><b>${item.name}</b></div>`).join("")+`<div class="weapon-slot knife-slot ${data.melee?"active":""}"><small>V</small><b>KNIFE</b></div>`;
      }
    }
    const ammo=document.getElementById("hud-ammo"); const ammoText=String(data.ammo??0).padStart(2,"0"); if(ammo.textContent!==ammoText) ammo.textContent=ammoText;
    const reserve=document.getElementById("hud-reserve"); const reserveText=String(data.reserve??0).padStart(3,"0"); if(reserve.textContent!==reserveText) reserve.textContent=reserveText;
    name.classList.toggle("upgraded",Boolean(data.upgraded));
    document.getElementById("hud-ammo").closest(".ammo").classList.toggle("hidden",Boolean(data.melee));
  }

  setPerks(perks) {
    const node=document.getElementById("perk-list");
    const labels={jugger:"JUG",speed:"SPD",quick:"QCK",double:"DMG",stamina:"STA",deadshot:"DSH",mule:"MUL"};
    node.innerHTML=[...perks].map(p=>"<span title='"+p.toUpperCase()+"'>"+(labels[p]||p.toUpperCase())+"</span>").join("");
  }

  setObjective(text) {
    document.getElementById("hud-objective").textContent=text;
  }

  setZombies(count) {
    document.getElementById("hud-wave-status").textContent=count>0?String(count)+" HOSTILES REMAINING":"AREA CLEAR";
  }

  setPrompt(item) {
    const prompt=document.getElementById("interaction-prompt");
    if(!item) {prompt.classList.add("hidden");return;}
    prompt.classList.remove("hidden");
    const title=document.getElementById("interaction-title");
    const desc=document.getElementById("interaction-description");
    title.textContent=item.name;
    desc.textContent=item.description||(Number(item.price||0).toLocaleString("en-GB")+" CREDITS");
    if(item.type==="door") desc.textContent="UNLOCK AREA / "+item.price.toLocaleString("en-GB")+" CREDITS";
    if(item.type==="perk"&&item.active) desc.textContent="ALREADY ACTIVE";
    if(item.type==="power"&&item.active) desc.textContent="POWER ONLINE";
    if(item.type==="pap"&&this.handlers.getWeaponUpgraded?.()) desc.textContent="WEAPON ALREADY UPGRADED";
  }

  setBoss(zombie) {
    const hud=document.getElementById("boss-hud");
    if(!zombie) {hud.classList.add("hidden");return;}
    hud.classList.remove("hidden");
    document.getElementById("boss-name").textContent=zombie.data.name;
    document.getElementById("boss-health-fill").style.width=Math.max(0,zombie.hp/zombie.maxHp*100)+"%";
  }

  hitMarker(headshot=false) {
    const node=document.getElementById("hit-marker");
    node.classList.remove("hit","headshot");
    if(headshot) node.classList.add("headshot");
    void node.offsetWidth;
    node.classList.add("hit");
  }

  damageFlash() {
    const root=document.getElementById("vignette");
    root.classList.remove("damage-flash");
    void root.offsetWidth;
    root.classList.add("damage-flash");
  }

  notify(title,description="",quiet=false) {
    const node=this.toastNode;
    node.innerHTML="<strong>"+title+"</strong><small>"+description+"</small>";
    node.classList.toggle("toast-quiet",quiet);
    node.classList.add("toast-visible");
    clearTimeout(this.toastTimer);
    this.toastTimer=setTimeout(()=>node.classList.remove("toast-visible"),3100);
  }
}