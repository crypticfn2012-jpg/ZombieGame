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
    const mat=(color,metalness=0.18,roughness=0.72)=>new THREE.MeshStandardMaterial({
      color,metalness,roughness,emissive:upgraded?0x102d2b:0x000000,emissiveIntensity:0.2,
      depthTest:false,depthWrite:false,toneMapped:false
    });
    const receiver=mat(upgraded?0x405c58:gun.color,0.3,0.72);
    const polymer=mat(0x252a27,0.04,0.95), grip=mat(0x353b35,0.02,0.98);
    const steel=mat(0x92958c,0.72,0.46), darkSteel=mat(0x3d4440,0.66,0.58);
    const accent=mat(upgraded?0x76c8b5:0xa18d68,0.32,0.58), glass=mat(0x344b49,0.5,0.18);
    const box=(x,y,z,sx,sy,sz,material,rz=0)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.position.set(x,y,z);mesh.rotation.z=rz;mesh.frustumCulled=false;mesh.renderOrder=999;this.model.add(mesh);return mesh;
    };
    const cylinder=(x,y,z,radius,length,material,segments=10)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,segments),material);
      mesh.position.set(x,y,z);mesh.rotation.x=Math.PI/2;mesh.frustumCulled=false;mesh.renderOrder=999;this.model.add(mesh);return mesh;
    };
    const pistol=gun.id==="pistol", revolver=gun.id==="revolver";
    const shotgun=gun.id==="shotgun"||gun.id==="autoShotgun";
    const smg=gun.id==="smg"||gun.id==="heavySmg";
    const sniper=gun.id==="sniper", launcher=gun.id==="launcher";
    const barrel=launcher?0.82:sniper?0.92:shotgun?0.7:smg?0.5:pistol?0.39:0.66;

    if(pistol||revolver) {
      // Service pistol and heavy revolver have separate frames, barrel lengths and grips.
      box(0,0.015,0.005,pistol?0.23:0.25,0.19,pistol?0.38:0.42,receiver);
      box(0,0.125,-0.045,pistol?0.2:0.22,0.055,pistol?0.3:0.32,steel);
      box(0,0.15,-0.04,0.12,0.035,0.28,darkSteel);
      cylinder(0,0.025,-barrel*0.62,pistol?0.052:0.062,barrel,steel,12);
      box(0,0.025,-barrel-0.055,0.12,0.12,0.1,darkSteel);
      box(0,-0.16,0.075,0.15,0.27,0.18,grip,-0.12);
      box(0,-0.29,0.11,0.16,0.05,0.19,polymer,-0.12);
      if(revolver) {
        cylinder(0,0.005,-0.035,0.115,0.2,steel,12);
        for(let n=0;n<6;n++){const angle=n*Math.PI/3;cylinder(Math.cos(angle)*0.078,0.005+Math.sin(angle)*0.078,-0.15,0.018,0.025,darkSteel,6);}
        box(0,0.09,0.17,0.25,0.12,0.28,receiver);
        box(0,-0.035,-0.11,0.12,0.04,0.13,polymer);
      } else {
        box(0,-0.12,-0.08,0.105,0.19,0.12,polymer);
      }
      const guard=new THREE.Mesh(new THREE.TorusGeometry(0.085,0.012,5,12,Math.PI),darkSteel);
      guard.position.set(0,-0.105,-0.015);guard.rotation.x=Math.PI/2;guard.renderOrder=999;this.model.add(guard);
      box(0,0.19,-barrel+0.05,0.045,0.065,0.055,darkSteel);
    } else {
      // Receiver, handguard and muzzle are separate pieces rather than one repeated box.
      box(0,0.015,0.02,0.29,0.22,0.5,receiver);
      box(0,0.105,-0.12,0.26,0.06,0.32,steel);
      box(0,0.14,-0.12,0.13,0.035,0.27,darkSteel);
      cylinder(0,0.035,-barrel*0.58,launcher?0.105:sniper?0.045:0.052,barrel,launcher?receiver:steel,launcher?12:10);
      box(0,0.04,-barrel+0.04,launcher?0.24:0.13,0.13,0.13,darkSteel);
      box(0,0.11,-0.32,0.22,0.13,shotgun?0.42:0.36,polymer);
      if(!smg&&!shotgun&&!launcher) {
        box(0,-0.005,0.36,0.22,0.16,0.42,polymer);
        box(0,-0.08,0.48,0.2,0.07,0.2,grip);
        box(0,-0.18,0.06,0.15,0.28,0.17,grip,-0.12);
      } else if(smg) {
        box(0,0.015,0.34,0.22,0.13,0.28,polymer);
        box(0,-0.17,0.07,0.14,0.25,0.16,grip,-0.1);
      } else if(shotgun) {
        box(0,0.015,0.36,0.25,0.17,0.35,polymer);
        box(0,-0.16,0.09,0.16,0.25,0.18,grip,-0.1);
        cylinder(0,-0.12,-0.38,0.075,0.48,steel,10);
        box(0,-0.12,-0.43,0.22,0.13,0.28,grip);
      } else if(launcher) {
        cylinder(0,0.04,-0.42,0.16,0.78,receiver,12);
        box(0,-0.18,0.1,0.24,0.2,0.22,grip,-0.1);
        box(0,0.2,-0.1,0.16,0.1,0.28,steel);
      }
      if(!launcher) {
        if(gun.id==="heavySmg") {
          cylinder(0,-0.19,-0.12,0.16,0.2,polymer,12);
          box(0,-0.29,-0.12,0.24,0.045,0.2,darkSteel);
        } else if(shotgun) cylinder(0,-0.13,-0.12,0.075,0.45,darkSteel,10);
        else {
          box(0,-0.19,-0.12,0.17,0.3,0.2,polymer,0.08);
          box(0,-0.34,-0.12,0.18,0.045,0.2,darkSteel);
        }
      }
      if(sniper) {
        cylinder(0,0.27,-0.1,0.065,0.34,polymer,10);
        cylinder(0,0.27,-0.1,0.043,0.35,glass,10);
        box(0,0.27,-0.1,0.24,0.045,0.07,darkSteel);
      } else if(["rifle","burst","tactical","experimental"].includes(gun.id)) {
        box(0,0.22,-0.1,0.16,0.1,0.27,polymer);
        box(0,0.29,-0.1,0.2,0.045,0.32,steel);
        box(0,0.23,-0.22,0.08,0.07,0.09,glass);
      }
      if(gun.id==="experimental") {
        box(0,0.02,-0.4,0.26,0.23,0.32,accent);
        box(0,0.02,-0.4,0.15,0.13,0.34,glass);
      }
      if(gun.id==="burst") box(0.13,0.02,-0.18,0.06,0.08,0.2,accent);
      if(launcher) {
        box(0,0.02,-0.45,0.36,0.3,0.88,receiver);
        box(0,0.2,-0.48,0.22,0.08,0.35,steel);
      }
    }

    // Layered operator sleeve and shaped voxel glove, with individual fingers.
    const sleeve=mat(0x343d39,0.02,0.98), sleeveTop=mat(0x56615a,0.02,0.98);
    const glove=mat(0x252b28,0.02,0.98), gloveEdge=mat(0x424b43,0.02,0.98);
    const arm=(x,y,z,sx,sy,sz,m,rz=0)=>box(x,y,z,sx,sy,sz,m,rz);
    arm(-0.23,-0.31,0.34,0.31,0.28,0.48,sleeve,-0.22);
    arm(-0.23,-0.235,0.19,0.29,0.075,0.12,sleeveTop,-0.22);
    arm(-0.12,-0.20,0.015,0.19,0.13,0.2,glove,-0.12);
    arm(-0.105,-0.145,-0.075,0.19,0.075,0.13,gloveEdge,-0.12);
    for(let finger=0;finger<4;finger++){
      const fx=-0.17+finger*0.043;
      arm(fx,-0.225,-0.105,0.035,0.055,0.12,glove,-0.08);
      arm(fx,-0.232,-0.158,0.036,0.045,0.045,gloveEdge,-0.08);
    }
    arm(-0.025,-0.19,-0.015,0.075,0.07,0.15,glove,-0.62);
    arm(-0.27,-0.32,0.49,0.32,0.045,0.12,gloveEdge,-0.22);
    arm(-0.23,-0.18,0.34,0.19,0.035,0.19,sleeveTop,-0.22);
    this.muzzle=box(0,0.035,-barrel-0.1,0.1,0.1,0.075,mat(0xffc27a,0,0.4));
    this.muzzle.visible=false;
    this.muzzleLight=new THREE.PointLight(upgraded?0x9ad8c9:0xffb35e,0,1.5);
    this.muzzleLight.position.set(0,0.035,-barrel-0.14);
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