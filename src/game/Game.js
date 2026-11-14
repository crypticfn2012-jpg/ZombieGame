import * as THREE from "three";
import { FacilityWorld } from "./World.js";
import { PlayerController } from "./Player.js";
import { WeaponSystem } from "./Weapons.js";
import { ZombieDirector } from "./Zombies.js";
import { ProgressionSystem } from "./Progression.js";
import { AudioSystem } from "./Audio.js";
import { SaveSystem } from "./Save.js";
import { GameUI } from "../ui/GameUI.js";
import { platform } from "../platform/CrazyGames.js";

export class BlacksiteGame {
  constructor() {
    this.canvas=document.getElementById("game-canvas");
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.1));
    this.renderer.setSize(window.innerWidth,window.innerHeight,false);
    this.renderer.shadowMap.enabled=false;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.12;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(85,window.innerWidth/window.innerHeight,0.08,150);
    // First-person weapons are camera children; add the initialized camera to the scene graph.
    this.scene.add(this.camera);
    this.audio=new AudioSystem();
    this.save=new SaveSystem();
    this.world=new FacilityWorld(this.scene);
    this.player=new PlayerController(this.camera,this.canvas,this.world,this.save.data.settings,(amount)=>this.onPlayerDamage(amount));
    this.weapons=new WeaponSystem(this.camera,this.audio,(data)=>this.ui?.setAmmo(data),(hit)=>this.onWeaponHit(hit));
    this.progression=new ProgressionSystem(this.world,this.weapons,this.player,this.audio,this.save,(title,desc)=>this.ui?.notify(title,desc),(text)=>this.ui?.setObjective(text),(stage,total,title)=>this.ui?.setMission(stage,total,title));
    this.zombies=new ZombieDirector(this.scene,this.audio,(zombie,points,headshot)=>this.onZombieKill(zombie,points,headshot),(damage,zombie)=>this.player.damage(damage),(boss)=>this.ui?.setBoss(boss),(points)=>{this.progression.points+=points;this.progression.totalEarned+=points;});
    this.ui=new GameUI(this.save,{
      onStart:()=>this.startRun(),
      onPause:()=>this.pause(),
      onResume:()=>this.resume(),
      onRestart:()=>this.startRun(),
      onMenu:()=>this.returnToMenu(),
      onRewardRevive:()=>this.rewardedRevive(),
      canReward:()=>platform.ready&&platform.environment==="crazygames",
      onSettings:(settings)=>this.applySettings(settings),
      getWeaponUpgraded:()=>Boolean(this.weapons.current?.upgraded)
    });
    this.state="menu";
    this.round=0;
    this.kills=0;
    this.roundKills=0;
    this.spawnsRemaining=0;
    this.spawnTimer=0;
    this.waveBreak=0;
    this.bossSpawned=false;
    this.runSeconds=0;
    this.runSaved=false;
    this.interaction=null;
    this.lastFrame=performance.now();
    this.elapsed=0;
    this.hitPulse=0;
    this.hudRefresh=0;
    this.mouseDown=false;
    this.resizeObserver=null;
    this.bindEvents();
    this.applySettings(this.save.data.settings);
    this.ui.setAmmo(this.weapons.hud());
    this.ui.setPoints(this.progression.points);
    this.ui.setHealth(this.player.health,this.player.maxHealth);
    this.ui.setPerks(this.progression.perks);
    this.ui.showMenu();
    this.resize();
    window.addEventListener("resize",()=>this.resize());
    this.animate();
  }

  bindEvents() {
    this.canvas.addEventListener("mousedown",(event)=>{
      if(this.state!=="playing") return;
      if(event.button===0) { if(this.weapons.melee) this.weapons.meleeAttack(this.zombies); else this.weapons.setTrigger(true); this.audio.ensure();}
      if(event.button===2) this.weapons.setAim(true);
    });
    window.addEventListener("mouseup",(event)=>{
      if(event.button===0) this.weapons.setTrigger(false);
      if(event.button===2) this.weapons.setAim(false);
    });
    this.canvas.addEventListener("contextmenu",event=>event.preventDefault());
    window.addEventListener("keydown",(event)=>{
      if(event.repeat) return;
      if(event.code==="Escape" && this.state==="playing" && document.pointerLockElement!==this.canvas) this.pause();
      if(this.state!=="playing") return;
      if(event.code==="KeyR") this.weapons.reload(this.progression.perks);
      if(event.code==="Digit1") this.weapons.switchTo(0);
      if(event.code==="Digit2") this.weapons.switchTo(1);
      if(event.code==="Digit3") this.weapons.switchTo(2);
      if(event.code==="KeyV" || event.code==="KeyQ") this.weapons.equipKnife();
      if(event.code==="KeyE"||event.code==="KeyF") this.interact();
    });
    document.addEventListener("pointerlockchange",()=>{
      if(this.state==="playing" && document.pointerLockElement!==this.canvas) {
        this.weapons.triggerHeld=false;
        this.weapons.setAim(false);
        this.pause(false);
      }
    });
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden && this.state==="playing") this.pause(false);
    });
  }

  applySettings(settings) {
    if(!settings) return;
    this.audio.setVolume(settings.volume/100);
    this.player?.setSensitivity(settings.sensitivity);
    if(this.camera) this.camera.fov=settings.fov, this.camera.updateProjectionMatrix();
    if(this.renderer) {
      const ratio=settings.quality==="low"?0.8:settings.quality==="medium"?0.95:Math.min(window.devicePixelRatio||1,1.15);
      this.renderer.setPixelRatio(ratio);
      this.renderer.shadowMap.enabled=false;
      this.scene.fog.density=settings.quality==="low"?0.009:settings.quality==="medium"?0.011:0.012;
    }
  }

  resize() {
    const w=Math.max(1,this.canvas.clientWidth||window.innerWidth);
    const h=Math.max(1,this.canvas.clientHeight||window.innerHeight);
    this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }

  requestPointerLock() {
    try {
      const result=this.canvas.requestPointerLock?.();
      result?.catch?.(()=>{ this.ui.notify("CLICK TO CAPTURE MOUSE","Some browsers require a second click to lock the pointer."); });
    } catch(error) {
      console.info("[BLACKSITE] Pointer lock not available",error);
    }
  }

  resetRun() {
    this.zombies.clear();
    this.player.reset();
    this.weapons.inventory=[];
    this.weapons.slot=0;
    this.weapons.melee=false;
    this.weapons.model.visible=true;
    this.weapons.knifeModel.visible=false;
    this.weapons.reloading=false;
    this.weapons.reloadTimer=0;
    this.weapons.cooldown=0;
    this.weapons.triggerHeld=false;
    this.weapons.semiConsumed=false;
    this.weapons.aiming=false;
    this.weapons.setAim(false);
    this.weapons.addWeapon("pistol");
    this.world.reset();
    this.progression=new ProgressionSystem(this.world,this.weapons,this.player,this.audio,this.save,(title,desc)=>this.ui.notify(title,desc),(text)=>this.ui.setObjective(text),(stage,total,title)=>this.ui.setMission(stage,total,title));
    this.round=0;
    this.kills=0;
    this.roundKills=0;
    this.spawnsRemaining=0;
    this.spawnTimer=0;
    this.waveBreak=0;
    this.bossSpawned=false;
    this.runSeconds=0;
    this.runSaved=false;
    this.elapsed=0;
    this.hitPulse=0;
  }

  startRun() {
    this.audio.ensure();
    this.resetRun();
    this.state="playing";
    this.player.setActive(true);
    this.ui.showGame();
    this.progression.refreshMission();
    this.ui.setRound(1,"FIRST WAVE INCOMING");
    this.ui.setPoints(this.progression.points);
    this.ui.setHealth(this.player.health,this.player.maxHealth);
    this.ui.setAmmo(this.weapons.hud());
    this.ui.setPerks(this.progression.perks);
    this.startRound();
    platform.gameplayStart();
    this.requestPointerLock();
  }

  startRound() {
    this.round++;
    this.roundKills=0;
    this.spawnsRemaining=Math.min(6+this.round*3,42);
    this.spawnTimer=0.75;
    this.bossSpawned=false;
    this.waveBreak=0;
    this.audio.play("round");
    this.ui.setRound(this.round,"INCOMING");
    this.ui.notify("ROUND "+String(this.round).padStart(2,"0"),"Hostiles are gathering outside. Watch the windows.");
    if(this.round===3) this.ui.notify("INCOMING / DR. VALE","If you can hear this, the lower levels are already compromised. Do not trust the personnel files.");
    if(this.round===5) this.ui.notify("RADIO INTERFERENCE","The signal is using the emergency broadcast system. It knows you are here.");
    if(this.round===10) this.ui.notify("FINAL TRANSMISSION","The reactor is not the source. It is a door. Shut it before the next pulse.");
    if(this.round%5===0) {
      const bossType=this.round>=15?"overseer":this.round>=10?"experiment":"brute";
      this.spawnBoss(bossType);
    }
  }

  spawnBoss(type) {
    const open=this.world.openRoomIds();
    const windows=this.world.spawnWindows(open);
    const win=windows[Math.floor(Math.random()*windows.length)]||this.world.windows[0];
    if(!win)return;
    const room=this.world.rooms.get(win.roomId);
    this.zombies.spawn(type,win.outside,win.roomId,this.round,win);
    this.audio.play("boss");
    this.ui.notify("WARNING / BOSS SIGNATURE","Something enormous is forcing its way through a window.");
    platform.happyTime();
    this.bossSpawned=true;
  }
  spawnOne() {
    if(this.zombies.count()>=this.zombies.maxAlive)return false;
    const open=this.world.openRoomIds();
    const playerPos=this.camera.position;
    const available=this.world.spawnWindows(open);
    const distant=available.filter(win=>Math.hypot(win.outside.x-playerPos.x,win.outside.z-playerPos.z)>9);
    const windows=distant.length?distant:available;
    if(!windows.length)return false;
    const win=windows[Math.floor(Math.random()*windows.length)];
    const type=this.zombies.chooseType(this.round);
    const zombie=this.zombies.spawn(type,win.outside,win.roomId,this.round,win);
    if(!zombie)return false;
    this.spawnsRemaining--;
    return true;
  }
  onZombieKill(zombie,points,headshot) {
    this.kills++;
    this.roundKills++;
    this.progression.earn(points,headshot);
    this.ui.setPoints(this.progression.points);
    
    if(zombie.data.boss) {
      this.ui.notify("HOSTILE ELIMINATED","The signal weakens, but it is not gone.");
      this.progression.onBossDefeated(zombie.type);
      this.progression.player.heal(35);
      this.progression.player.addArmor(25);
      this.audio.play("round");
      platform.happyTime();
    }
  }

  onWeaponHit(hit) {
    this.ui.hitMarker(Boolean(hit?.headshot));
  }

  onPlayerDamage(amount,zombie) {
    if(this.state!=="playing") return;
    if(this.player.health<=0) return;
    this.ui.damageFlash();
    if(this.player.health<=0 && this.progression.tryQuickRevive()) {
      this.ui.setHealth(this.player.health,this.player.maxHealth,this.player.armor);
      return;
    }
    if(this.player.health<=0) this.endRun();
    else this.ui.setHealth(this.player.health,this.player.maxHealth,this.player.armor);
  }

  interact() {
    if(this.state!=="playing") return;
    const item=this.findInteractable();
    if(!item) return;
    const ok=this.progression.interact(item);
    this.ui.setPoints(this.progression.points);
    this.ui.setHealth(this.player.health,this.player.maxHealth,this.player.armor);
    this.ui.setPerks(this.progression.perks);
    if(ok) this.ui.setAmmo(this.weapons.hud());
  }

  findInteractable() {
    const origin=this.camera.position;
    const direction=this.camera.getWorldDirection(new THREE.Vector3());
    let best=null,bestDistance=3.4;
    for(const item of this.world.interactables) {
      if(item.type==="door" && item.ref.open) continue;
      const target=item.position;
      const delta=target.clone().sub(origin);
      const distance=delta.length();
      if(distance>bestDistance) continue;
      const dot=delta.normalize().dot(direction);
      if(dot<0.12) continue;
      const roomOpen=this.world.openRoomIds().includes(item.roomId||"start");
      if(item.roomId && !roomOpen && item.type!=="door") continue;
      best=item; bestDistance=distance;
    }
    return best;
  }

  async rewardedRevive() {
    if(this.state!=="dead" || !platform.ready || platform.environment!=="crazygames") return;
    const ok=await platform.rewardedAd({
      onStart:()=>this.audio.setVolume(0),
      onFinish:()=>this.audio.setVolume(this.save.data.settings.volume/100),
      onError:()=>this.audio.setVolume(this.save.data.settings.volume/100)
    });
    if(!ok) {
      this.ui.notify("AD NOT AVAILABLE","You can still restart your run.");
      return;
    }
    this.state="playing";
    this.player.health=Math.max(55,Math.round(this.player.maxHealth*0.55));
    this.player.invulnerable=5;
    this.player.camera.position.set(0,1.7,5.8);
    this.player.setActive(true);
    this.ui.showGame();
    this.ui.notify("FIELD REVIVAL","Emergency extraction complete. Keep moving.");
    platform.gameplayStart();
    this.requestPointerLock();
  }

  pause(release=true) {
    if(this.state!=="playing") return;
    this.state="paused";
    this.player.setActive(false);
    this.weapons.triggerHeld=false;
    this.weapons.setAim(false);
    platform.gameplayStop();
    if(release && document.pointerLockElement) document.exitPointerLock?.();
    this.ui.showPause();
  }

  resume() {
    if(this.state!=="paused") return;
    this.state="playing";
    this.player.setActive(true);
    this.audio.ensure();
    this.ui.showGame();
    platform.gameplayStart();
    this.requestPointerLock();
  }

  returnToMenu() {
    if(this.state==="playing"||this.state==="paused") this.saveRun();
    if(document.pointerLockElement) document.exitPointerLock?.();
    this.player.setActive(false);
    this.weapons.triggerHeld=false;
    this.zombies.clear();
    platform.gameplayStop();
    this.state="menu";
    this.ui.showMenu();
  }

  endRun() {
    if(this.state!=="playing") return;
    this.state="dead";
    this.player.setActive(false);
    this.weapons.triggerHeld=false;
    this.weapons.setAim(false);
    if(document.pointerLockElement) document.exitPointerLock?.();
    platform.gameplayStop();
    this.saveRun();
    this.ui.showDeath({round:this.round,kills:this.kills,points:this.progression.totalEarned});
  }

  saveRun() {
    if(this.runSaved) return;
    this.runSaved=true;
    this.save.updateRun(this.round,this.kills,this.runSeconds);
  }

  updateWave(dt) {
    if(this.spawnsRemaining>0) {
      this.spawnTimer-=dt;
      if(this.spawnTimer<=0) {
        this.spawnOne();
        this.spawnTimer=Math.max(0.45,1.05-this.round*0.018);
      }
    }
    if(this.spawnsRemaining===0 && this.zombies.count()===0) {
      if(this.waveBreak<=0) {
        this.waveBreak=25;
        this.ui.setZombies(0);
        this.ui.setRound(this.round,"AREA SECURE");
        this.ui.notify("AREA SECURE","25 seconds until the next wave. Use the time to buy, reload and open new areas.");
        this.progression.applyRoundBonus(this.round);
        this.progression.onRoundComplete(this.round);
        this.ui.setPoints(this.progression.points);
        this.player.heal(15);
        this.player.addArmor(5);
      } else {
        this.waveBreak-=dt;
        this.ui.setRound(this.round,"NEXT WAVE IN "+Math.ceil(this.waveBreak)+"s");
        if(this.waveBreak<=0)this.startRound();
      }
    }
  }

  update(dt) {
    this.elapsed+=dt;
    if(this.state==="playing") this.world.update(this.elapsed);
    if(this.state!=="playing") return;
    this.runSeconds+=dt;
    this.player.update(dt,this.progression.perks);
    this.weapons.fire(this.zombies,this.progression.perks,dt,this.elapsed);
    this.weapons.update();
    this.zombies.update(dt,this.player,this.world,this.round);
    this.updateWave(dt);
    this.hudRefresh-=dt;
    if(this.hudRefresh<=0) {
      this.hudRefresh=0.12;
      this.ui.setHealth(this.player.health,this.player.maxHealth,this.player.armor);
      this.ui.setPoints(this.progression.points);
      this.ui.setAmmo(this.weapons.hud());
      this.ui.setPerks(this.progression.perks);
      this.ui.setZombies(this.zombies.count()+this.spawnsRemaining);
    }
    const item=this.findInteractable();
    if(item!==this.interaction) {
      this.interaction=item;
      this.ui.setPrompt(item);
    }
    const boss=this.zombies.boss();
    if(boss) this.ui.setBoss(boss);
  }

  animate() {
    requestAnimationFrame(()=>this.animate());
    const now=performance.now();
    const dt=Math.min(0.05,(now-this.lastFrame)/1000);
    this.lastFrame=now;
    this.update(dt);
    if(this.state==="playing" || this.state==="menu") this.renderer.render(this.scene,this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.zombies.clear();
    window.removeEventListener("resize",this.resize);
  }
}
