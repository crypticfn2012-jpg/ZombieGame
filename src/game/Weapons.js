import * as THREE from "three";

const toonRamp = new THREE.DataTexture(new Uint8Array([54,54,54,255,132,132,132,255,224,224,224,255]),3,1,THREE.RGBAFormat);
toonRamp.minFilter=THREE.NearestFilter; toonRamp.magFilter=THREE.NearestFilter; toonRamp.generateMipmaps=false; toonRamp.needsUpdate=true;

export const WEAPON_DATA = {
  pistol: { name:"SERVICE PISTOL", damage:34, fireRate:0.28, reload:1.35, mag:12, reserve:84, spread:0.012, pellets:1, automatic:false, range:48, color:0x75848a, sound:"shoot", price:0 },
  revolver: { name:"HEAVY REVOLVER", damage:88, fireRate:0.46, reload:1.85, mag:6, reserve:42, spread:0.008, pellets:1, automatic:false, range:70, color:0x9b7855, sound:"shoot", price:1800 },
  rifle: { name:"SERVICE RIFLE", damage:32, fireRate:0.105, reload:1.75, mag:30, reserve:180, spread:0.018, pellets:1, automatic:true, range:65, color:0x718f87, sound:"shoot", price:1200 },
  smg: { name:"COMPACT SMG", damage:22, fireRate:0.075, reload:1.55, mag:42, reserve:210, spread:0.028, pellets:1, automatic:true, range:42, color:0xa58b55, sound:"shoot", price:1400 },
  shotgun: { name:"PUMP SHOTGUN", damage:19, fireRate:0.72, reload:2.1, mag:8, reserve:64, spread:0.075, pellets:9, automatic:false, range:25, color:0x9a6942, sound:"shotgun", price:1700 },
  burst: { name:"BURST RIFLE", damage:30, fireRate:0.085, reload:1.8, mag:27, reserve:162, spread:0.016, pellets:1, automatic:false, burst:3, range:60, color:0x57909c, sound:"shoot", price:1900 },
  tactical: { name:"TACTICAL CARBINE", damage:54, fireRate:0.22, reload:1.85, mag:24, reserve:144, spread:0.01, pellets:1, automatic:false, range:82, color:0x758b9c, sound:"shoot", price:2300 },
  heavySmg: { name:"DRUM SMG", damage:19, fireRate:0.06, reload:1.9, mag:60, reserve:300, spread:0.031, pellets:1, automatic:true, range:43, color:0xb09156, sound:"shoot", price:2000 },
  autoShotgun: { name:"BREACH AUTO SHOTGUN", damage:13, fireRate:0.19, reload:2.25, mag:10, reserve:80, spread:0.088, pellets:8, automatic:true, range:23, color:0x9d644b, sound:"shotgun", price:2600 },
  sniper: { name:"TACTICAL DMR", damage:145, fireRate:0.85, reload:2.25, mag:5, reserve:35, spread:0.003, pellets:1, automatic:false, range:110, color:0x9d9eae, sound:"shoot", price:2400 },
  launcher: { name:"GRENADE LAUNCHER", damage:170, fireRate:0.9, reload:2.3, mag:1, reserve:12, spread:0.01, pellets:1, automatic:false, range:58, explosive:5.5, color:0x88a77b, sound:"shotgun", price:3200 },
  experimental: { name:"PHASE DISRUPTOR", damage:110, fireRate:0.19, reload:1.7, mag:24, reserve:144, spread:0.006, pellets:1, automatic:true, range:75, energy:true, color:0x43dce3, sound:"power", price:0 }
};

export class WeaponSystem {
  constructor(camera, audio, onAmmoChange, onHit) {
    this.camera=camera;
    this.audio=audio;
    this.onAmmoChange=onAmmoChange;
    this.onHit=onHit;
    this.inventory=[];
    this.slot=0;
    this.melee=false;
    this.meleeTimer=0;
    this.recoil=0;
    this.bobTime=0;
    this.reloadPhase=0;
    this.cooldown=0;
    this.reloadTimer=0;
    this.reloading=false;
    this.triggerHeld=false;
    this.semiConsumed=false;
    this.aiming=false;
    this.model=new THREE.Group();
    this.camera.add(this.model);
    this.model.position.set(0.42,-0.39,-0.82);
    this.model.scale.setScalar(1.45);
    this.model.renderOrder=999;
    this.model.rotation.order="YXZ";
    this.knifeModel=new THREE.Group();
    this.camera.add(this.knifeModel);
    this.knifeModel.position.set(0.42,-0.39,-0.78);
    this.knifeModel.scale.setScalar(1.35);
    this.knifeModel.renderOrder=999;
    this.knifeModel.visible=false;
    const knifeSteel=new THREE.MeshToonMaterial({color:0xc7d6d7,gradientMap:null});
    const knifeDark=new THREE.MeshToonMaterial({color:0x222b32});
    const blade=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.045,0.43),knifeSteel);
    blade.position.set(0,0.035,-0.23);
    blade.rotation.x=-0.08;
    this.knifeModel.add(blade);
    const grip=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.075,0.2),knifeDark);
    grip.position.set(0,-0.015,0.08);
    this.knifeModel.add(grip);
    const guard=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.035,0.05),knifeDark);
    guard.position.set(0,0.02,-0.005);
    this.knifeModel.add(guard);
    this.muzzle=null;
    this.muzzleLight=null;
    this.muzzleTime=0;
    this.killsWithWeapon={};
    this.addWeapon("pistol");
  }

  createWeapon(id) {
    const data=WEAPON_DATA[id] || WEAPON_DATA.pistol;
    return { id, ...data, ammo:data.mag, reserve:data.reserve, upgraded:false, damage:data.damage, mag:data.mag, baseDamage:data.damage };
  }

  addWeapon(id, replaceSlot=-1) {
    const existing=this.inventory.findIndex(w=>w.id===id);
    if(existing>=0) {
      const item=this.inventory[existing];
      item.reserve=Math.min(item.reserve+item.mag*2,999);
      item.ammo=item.mag;
      this.slot=existing;
      this.refreshModel();
      this.notify();
      return { added:false, resupplied:true };
    }
    const weapon=this.createWeapon(id);
    if(replaceSlot>=0 && this.inventory[replaceSlot]) this.inventory[replaceSlot]=weapon;
    else if(this.inventory.length<3) this.inventory.push(weapon);
    else this.inventory[this.slot]=weapon;
    this.slot=Math.max(0,this.inventory.indexOf(weapon));
    this.refreshModel();
    this.notify();
    return { added:true, resupplied:false };
  }

  get current() { return this.inventory[this.slot] || this.inventory[0]; }

  refreshModel() {
    for(const child of [...this.model.children]) {
      this.model.remove(child);
      child.traverse?.(node=>{node.geometry?.dispose?.();});
    }
    const gun=this.current;
    if(!gun)return;
    const upgraded=gun.upgraded;
    const bodyColor=upgraded?0x304d57:gun.color;
    const makeMat=(color,metalness=0.18,roughness=0.72,emissive=0)=>new THREE.MeshStandardMaterial({
      color,metalness,roughness,emissive,emissiveIntensity:upgraded?0.35:0.05,depthTest=false,depthWrite=false,toneMapped=false
    });
    const body=makeMat(bodyColor,0.22,0.68),dark=makeMat(0x20272a,0.08,0.9);
    const grip=makeMat(0x303638,0.02,0.95),metal=makeMat(0x899397,0.62,0.42);
    const accent=makeMat(upgraded?0x55dce3:0x7e9290,0.3,0.5,upgraded?0x1c8c96:0);
    const glass=makeMat(0x294a50,0.35,0.2,upgraded?0x14616a:0);
    const box=(x,y,z,sx,sy,sz,material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;
      mesh.frustumCulled=false;mesh.renderOrder=999;this.model.add(mesh);return mesh;
    };
    const pistol=["pistol","revolver"].includes(gun.id);
    const shotgun=["shotgun","autoShotgun"].includes(gun.id);
    const launcher=gun.id==="launcher";
    const long=!pistol;
    const barrelLength=launcher?0.78:shotgun?0.66:long?0.58:0.36;
    // One consistent low-poly language: square receiver, straight barrel and clean block details.
    box(0,0,0.02,pistol?0.2:0.23,0.18,pistol?0.34:0.46,body);
    box(0,0.105,-0.045,pistol?0.16:0.2,0.045,pistol?0.22:0.3,metal);
    box(0,0.015,-barrelLength*0.55,pistol?0.075:launcher?0.19:0.085,0.085,barrelLength,launcher?body:metal);
    box(0,0.02,-barrelLength-0.045,pistol?0.12:0.15,0.12,0.09,dark);
    box(0,0.14,-0.12,pistol?0.07:0.09,0.035,0.3,dark);
    box(0,0.17,-0.12,pistol?0.045:0.06,0.025,0.25,accent);
    // Rear stock and grip.
    if(!pistol) {
      box(0,-0.015,0.32,0.18,0.14,0.34,body);
      box(0,-0.17,0.075,0.13,0.25,0.16,grip);
      box(0,-0.3,0.075,0.16,0.045,0.18,dark);
    } else {
      box(0,-0.16,0.07,0.14,0.25,0.17,grip);
      box(0,-0.29,0.075,0.16,0.045,0.18,dark);
    }
    // Magazine, with distinct silhouettes for box, drum and shotgun feeds.
    if(!["pistol","revolver","sniper","launcher"].includes(gun.id)) {
      if(gun.id==="heavySmg") {
        box(0,-0.19,-0.08,0.24,0.22,0.2,body);
        box(0,-0.205,-0.19,0.2,0.06,0.035,metal);
      } else {
        box(0,-0.19,-0.09,0.15,0.28,0.18,gun.id.includes("Shotgun")||gun.id==="shotgun"?body:dark);
        box(0,-0.34,-0.09,0.17,0.04,0.19,grip);
      }
    }
    if(shotgun) {
      box(0,-0.12,-0.36,0.18,0.14,0.32,gun.id==="autoShotgun"?body:grip);
      box(0,-0.12,-0.51,0.2,0.07,0.08,accent);
    }
    if(["rifle","burst","tactical","sniper","experimental"].includes(gun.id)) {
      box(0,0.23,-0.1,0.14,0.12,0.25,dark);
      box(0,0.29,-0.1,0.18,0.04,0.3,accent);
      box(0,0.235,-0.22,0.075,0.07,0.08,glass);
    }
    if(gun.id==="revolver") {
      box(0,-0.015,0.15,0.2,0.16,0.18,metal);
      box(0,-0.015,0.25,0.16,0.13,0.08,dark);
    }
    if(launcher) {
      box(0,0,-0.12,0.28,0.25,0.72,body);
      box(0,0,-0.52,0.34,0.31,0.1,accent);
      box(0,-0.2,0.12,0.22,0.2,0.22,grip);
    }
    if(gun.id==="experimental") {
      box(0,0.015,-0.38,0.23,0.2,0.32,accent);
      box(0,0.015,-0.4,0.14,0.12,0.34,glass);
    }
    // Blocky sleeve and glove keep the first-person silhouette grounded.
    const sleeve=makeMat(0x48565b),glove=makeMat(0x242b2d);
    box(-0.16,-0.28,0.25,0.22,0.2,0.34,sleeve);
    box(-0.055,-0.2,0.02,0.15,0.1,0.18,glove);
    box(-0.055,-0.16,-0.055,0.16,0.07,0.13,glove);
    this.muzzle=box(0,0.02,-barrelLength-0.1,0.12,0.12,0.07,makeMat(0xffc27a,0,0.4,0xff963d));
    this.muzzle.visible=false;
    this.muzzleLight=new THREE.PointLight(upgraded?0x54eaff:0xffb35e,0,1.7);
    this.muzzleLight.position.set(0,0.02,-barrelLength-0.14);
    this.model.add(this.muzzleLight);
  }
  notify() { this.onAmmoChange?.(this.hud()); }

  hud() {
    const g=this.current;
    return g ? { name:this.melee?"COMBAT KNIFE":g.name, ammo:g.ammo, reserve:g.reserve, slot:this.slot, count:this.inventory.length, upgraded:g.upgraded, melee:this.melee, slots:this.inventory.map((item,index)=>({name:item.name,id:item.id,slot:index+1,active:index===this.slot})) } : {name:"",ammo:0,reserve:0,slots:[]};
  }

  switchTo(slot) {
    if(slot<0 || slot>=3 || !this.inventory[slot] || slot===this.slot && !this.melee) return;
    this.melee=false;
    this.slot=slot;
    this.reloading=false;
    this.refreshModel();
    this.notify();
    this.audio?.play("reload");
  }

  equipKnife() {
    this.melee=!this.melee;
    this.reloading=false;
    this.model.visible=!this.melee;
    this.knifeModel.visible=this.melee;
    this.notify();
  }

  meleeAttack(zombies) {
    if(!this.melee || this.meleeTimer>0) return false;
    this.meleeTimer=0.48;
    this.knifeSwing=0.48;
    const direction=this.camera.getWorldDirection(new THREE.Vector3());
    const origin=this.camera.getWorldPosition(new THREE.Vector3());
    const hit=zombies.damageRay(origin,direction,2.8,115,false);
    if(hit) this.onHit?.(hit);
    this.audio?.play("knife");
    return true;
  }

  cycle() {
    if(this.inventory.length>1) this.switchTo((this.slot+1)%this.inventory.length);
  }

  setTrigger(value) {
    if(value && !this.triggerHeld) this.semiConsumed=false;
    this.triggerHeld=value;
    if(!value) this.semiConsumed=false;
  }

  setAim(value) {
    this.aiming=value;
    this.model.position.x=value?0.2:0.42;
    this.model.position.y=value?-0.32:-0.39;
  }

  fire(zombies, perks, dt, time) {
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.muzzleTime=Math.max(0,this.muzzleTime-dt);
    if(this.muzzle && this.muzzleTime<=0) { this.muzzle.visible=false; if(this.muzzleLight) this.muzzleLight.intensity=0; }
    if(this.reloading) {
      this.reloadTimer-=dt;
      if(this.reloadTimer<=0) this.finishReload();
      return false;
    }
    const gun=this.current;
    if(this.melee || !this.triggerHeld || !gun || this.cooldown>0) return false;
    if(!gun.automatic && this.semiConsumed) return false;
    if(gun.ammo<=0) {
      if(gun.reserve>0) this.reload();
      return false;
    }
    const burst=gun.burst||1;
    const pellets=gun.pellets||1;
    this.cooldown=gun.fireRate*(burst>1?1.6:1);
    const totalDamage=gun.damage*(perks.has("double")?1.65:1)*(gun.upgraded?1.5:1);
    const direction=new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    for(let shot=0;shot<burst;shot++) {
      for(let pellet=0;pellet<pellets;pellet++) {
        const spread=gun.spread*(this.aiming?0.56:1);
        const rayDir=direction.clone().add(new THREE.Vector3((Math.random()-0.5)*spread,(Math.random()-0.5)*spread,(Math.random()-0.5)*spread)).normalize();
        const damage=totalDamage*(gun.id==="sniper"?1.08:1);
        const didHit=zombies.damageRay(this.camera.getWorldPosition(new THREE.Vector3()),rayDir,gun.range,damage,perks.has("deadshot"));
        if(didHit) this.onHit?.(didHit);
        if(gun.explosive && shot===0 && pellet===0) zombies.damageArea(this.camera.position.clone().add(rayDir.clone().multiplyScalar(Math.min(gun.range,28))),gun.explosive,totalDamage*0.85);
      }
    }
    gun.ammo--;
    if(!gun.automatic) this.semiConsumed=true;
    this.audio?.play(gun.upgraded?"mk2":gun.sound);
    this.muzzleTime=0.055;
    if(this.muzzle) this.muzzle.visible=true;
    if(this.muzzleLight) this.muzzleLight.intensity=gun.upgraded?5:3;
    this.recoil=Math.min(0.12,this.recoil+0.075);
    this.notify();
    return true;
  }

  reload(perks=new Set()) {
    const gun=this.current;
    if(!gun || this.reloading || gun.ammo>=gun.mag || gun.reserve<=0) return false;
    this.reloading=true;
    this.reloadTimer=gun.reload*(perks.has("speed")?0.55:1);
    this.audio?.play("reload");
    return true;
  }

  finishReload() {
    const gun=this.current;
    if(!gun) return;
    const needed=gun.mag-gun.ammo;
    const amount=Math.min(needed,gun.reserve);
    gun.ammo+=amount;
    gun.reserve-=amount;
    this.reloading=false;
    this.reloadTimer=0;
    this.notify();
  }

  purchase(id, perks) {
    const cap=3;
    const found=this.inventory.findIndex(w=>w.id===id);
    if(found>=0) {
      const gun=this.inventory[found];
      gun.reserve=Math.min(gun.reserve+gun.mag*2,999);
      gun.ammo=gun.mag;
      this.switchTo(found);
      this.notify();
      return {ok:true,kind:"ammo"};
    }
    const weapon=this.createWeapon(id);
    if(this.inventory.length<cap) {
      this.inventory.push(weapon);
      this.slot=this.inventory.length-1;
    } else {
      this.inventory[this.slot]=weapon;
    }
    this.refreshModel();
    this.notify();
    return {ok:true,kind:"weapon"};
  }

  upgradeCurrent() {
    const gun=this.current;
    if(!gun || gun.upgraded) return false;
    gun.upgraded=true;
    // The fire path applies the MK-II multiplier. Keep base damage unchanged to avoid stacking it twice.
    gun.damage=gun.baseDamage;
    gun.mag=Math.round(gun.mag*1.35);
    gun.ammo=gun.mag;
    gun.reserve=Math.min(999,gun.reserve+gun.mag*2);
    if(gun.id==="pistol") gun.name="MK-II SERVICE PISTOL";
    else gun.name="MK-II " + gun.name;
    this.refreshModel();
    this.notify();
    return true;
  }

  addAmmo(amount=120) {
    for(const gun of this.inventory) {
      gun.reserve=Math.min(999,gun.reserve+amount);
      gun.ammo=Math.min(gun.mag,gun.ammo+Math.ceil(amount*0.2));
    }
    this.notify();
  }

  update() {
    if(!this.model) return;
    const dt=0.016;
    this.meleeTimer=Math.max(0,this.meleeTimer-dt);
    const reloadTilt=this.reloading?0.58:0;
    this.model.rotation.z=THREE.MathUtils.damp(this.model.rotation.z,reloadTilt,9,dt);
    this.model.position.y=THREE.MathUtils.damp(this.model.position.y,(this.aiming?-0.32:-0.39)+(this.reloading?-0.12:0),10,dt);
    if(this.knifeModel.visible) {
      const swing=this.meleeTimer>0?1-this.meleeTimer/0.48:0;
      this.knifeModel.rotation.y=THREE.MathUtils.damp(this.knifeModel.rotation.y,swing>0?Math.sin(swing*Math.PI)*-1.1:0,18,dt);
      this.knifeModel.rotation.x=THREE.MathUtils.damp(this.knifeModel.rotation.x,swing>0?-Math.sin(swing*Math.PI)*0.8:0,18,dt);
      this.knifeModel.position.z=THREE.MathUtils.damp(this.knifeModel.position.z,swing>0?-0.58-Math.sin(swing*Math.PI)*0.18:-0.58,18,dt);
    }
    this.recoil=THREE.MathUtils.damp(this.recoil,0,18,dt);
    this.bobTime+=dt;
    const bob=this.aiming?0:Math.sin(this.bobTime*8)*0.006;
    this.model.position.x=THREE.MathUtils.damp(this.model.position.x,this.aiming?0.2:0.42,12,dt);
    this.model.position.y=THREE.MathUtils.damp(this.model.position.y,(this.aiming?-0.27:-0.31)+bob-this.recoil*0.2,14,dt);
    this.model.position.z=THREE.MathUtils.damp(this.model.position.z,-0.82+this.recoil,22,dt);
    this.model.rotation.x=THREE.MathUtils.damp(this.model.rotation.x,-this.recoil*0.7,20,dt);
    this.model.visible=!this.melee;
    this.knifeModel.visible=this.melee;
  }
}