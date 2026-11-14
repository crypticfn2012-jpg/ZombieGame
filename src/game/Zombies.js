import * as THREE from "three";

const toonRamp = new THREE.DataTexture(new Uint8Array([48,48,48,255,126,126,126,255,226,226,226,255]),3,1,THREE.RGBAFormat);
toonRamp.minFilter=THREE.NearestFilter; toonRamp.magFilter=THREE.NearestFilter; toonRamp.generateMipmaps=false; toonRamp.needsUpdate=true;

const TYPES = {
  standard:{name:"INFECTED",health:95,speed:1.75,damage:9,scale:1,color:0x668477,points:100},
  runner:{name:"RUSHER",health:62,speed:3.05,damage:7,scale:0.92,color:0x9e745d,points:130},
  armored:{name:"ARMOURED",health:245,speed:1.25,damage:16,scale:1.18,color:0x65717c,points:180},
  explosive:{name:"VOLATILE",health:90,speed:2.2,damage:22,scale:1,color:0xb67b43,points:160},
  elite:{name:"ELITE",health:390,speed:2.3,damage:18,scale:1.12,color:0x7c4f70,points:260},
  brute:{name:"THE BRUTE",health:2600,speed:1.45,damage:28,scale:1.85,color:0x71605c,points:1800,boss:true},
  experiment:{name:"THE EXPERIMENT",health:3400,speed:1.9,damage:20,scale:1.55,color:0x4d918b,points:2500,boss:true,ranged:true},
  overseer:{name:"THE OVERSEER",health:7200,speed:1.6,damage:32,scale:2.05,color:0x6c588b,points:5000,boss:true,ranged:true}
};

export class ZombieDirector {
  constructor(scene, audio, onKill, onPlayerDamage, onBossChange, onDamageScore) {
    this.scene=scene;
    this.audio=audio;
    this.onKill=onKill;
    this.onPlayerDamage=onPlayerDamage;
    this.onBossChange=onBossChange;
    this.onDamageScore=onDamageScore;
    this.zombies=[];
    this.projectiles=[];
    this.shockwaves=[];
    this.lastPlayerPosition=new THREE.Vector3();
    this.maxAlive=18;
  }

  makeZombie(type) {
    const data=TYPES[type]||TYPES.standard;
    const group=new THREE.Group();
    group.scale.setScalar(data.scale);
    const mat=color=>new THREE.MeshToonMaterial({color,gradientMap:toonRamp});
    const skin=mat(data.color), cloth=mat(type==="armored"?0x35434a:type==="runner"?0x57453b:0x465149);
    const dark=mat(0x202b2b), pants=mat(0x303b3d), accent=mat(type==="explosive"?0xe58b43:data.boss?0x8c667f:0x758d83);
    const eye=mat(0xe95d4f), bone=mat(0xc9c2a9), armour=mat(0x59666b);
    const box=(parent,x,y,z,sx,sy,sz,material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;parent.add(mesh);return mesh;
    };
    // Chunky, readable voxel silhouette. Every part uses the same crisp block scale.
    const torso=new THREE.Group();torso.position.set(0,1.16,0);group.add(torso);
    box(torso,0,0,0,0.66,0.78,0.34,cloth);
    box(torso,0,-0.27,0.19,0.42,0.18,0.045,accent);
    box(torso,-0.22,0.17,0.19,0.12,0.3,0.05,skin);
    box(torso,0.2,-0.06,-0.19,0.14,0.32,0.05,dark);
    const head=new THREE.Group();head.position.set(0,0.55,0.02);torso.add(head);
    box(head,0,0.15,0,0.48,0.48,0.42,skin);
    box(head,0,0.37,-0.01,0.43,0.12,0.4,dark);
    box(head,-0.12,0.19,0.216,0.09,0.07,0.025,eye);
    box(head,0.12,0.19,0.216,0.09,0.07,0.025,eye);
    box(head,0,0.035,0.225,0.2,0.07,0.035,dark);
    for(let i=0;i<3;i++) box(head,-0.07+i*0.07,0.025,0.25,0.035,0.045,0.025,bone);
    box(head,-0.29,0.12,0,0.08,0.18,0.13,skin);
    box(head,0.29,0.12,0,0.08,0.18,0.13,skin);
    const armL=new THREE.Group();armL.position.set(-0.39,0.35,0);torso.add(armL);
    const armR=new THREE.Group();armR.position.set(0.39,0.35,0);torso.add(armR);
    for(const arm of [armL,armR]) {
      box(arm,0,-0.2,0,0.2,0.43,0.22,skin);
      const elbow=new THREE.Group();elbow.position.set(0,-0.42,0);arm.add(elbow);
      box(elbow,0,-0.19,0,0.17,0.4,0.19,skin);
      box(elbow,0,-0.4,0.09,0.2,0.12,0.2,dark);
      arm.userData.elbow=elbow;
    }
    const legL=new THREE.Group();legL.position.set(-0.18,0.76,0);group.add(legL);
    const legR=new THREE.Group();legR.position.set(0.18,0.76,0);group.add(legR);
    for(const leg of [legL,legR]) {
      box(leg,0,-0.2,0,0.23,0.42,0.25,pants);
      const knee=new THREE.Group();knee.position.set(0,-0.4,0);leg.add(knee);
      box(knee,0,-0.19,0,0.21,0.4,0.23,skin);
      box(knee,0,-0.37,0.11,0.27,0.12,0.36,dark);
      leg.userData.knee=knee;
    }
    if(type==="armored"||data.boss) {
      box(torso,0,0.25,0.02,0.78,0.2,0.48,armour);
      box(torso,-0.39,0.2,0,0.24,0.26,0.34,armour);
      box(torso,0.39,0.2,0,0.24,0.26,0.34,armour);
      box(head,0,0.43,0,0.55,0.12,0.48,accent);
    }
    if(type==="explosive") {
      box(torso,0,-0.02,0.22,0.26,0.26,0.12,accent);
      box(torso,0,-0.02,0.29,0.1,0.1,0.04,eye);
    }
    if(data.boss) {
      box(head,-0.24,0.42,-0.02,0.13,0.38,0.15,dark);
      box(head,0.24,0.42,-0.02,0.13,0.38,0.15,dark);
      group.scale.multiplyScalar(1.05);
    }
    const flashMaterials=[];
    const seen=new Set();
    group.traverse(child=>{
      if(!child.isMesh)return;
      const material=child.material;
      if(!seen.has(material)){seen.add(material);flashMaterials.push({material,color:material.color.clone(),emissive:material.emissive.clone(),emissiveIntensity:material.emissiveIntensity||0});}
    });
    return {group,type,data,hp:data.health,maxHp:data.health,armL,armR,legL,legR,head,torso,flashMaterials,
      attackTimer:0,specialTimer:1.4,chargeTime:0,chargeDirection:new THREE.Vector3(),phase:Math.random()*Math.PI*2,
      dead:false,roomId:"start",hurt:0,walkBlend:0,entryWindow:null,entryState:"",entryProgress:0,entryStart:null};
  }
  spawn(type, position, roomId, round=1, entryWindow=null) {
    if(this.zombies.length>=this.maxAlive) return null;
    const zombie=this.makeZombie(type);
    const scaleHealth=type==="brute"||type==="experiment"||type==="overseer"?1:1+Math.max(0,round-1)*0.16;
    zombie.maxHp=Math.round(zombie.hp*scaleHealth);
    zombie.hp=zombie.maxHp;
    zombie.group.position.set(position.x,0,position.z);
    zombie.roomId=roomId;
    zombie.entryWindow=entryWindow;
    zombie.entryState=entryWindow?"approach":"";
    this.scene.add(zombie.group);
    this.zombies.push(zombie);
    if(zombie.data.boss) this.onBossChange?.(zombie);
    return zombie;
  }

  damageRay(origin,direction,range,damage,deadshot=false) {
    // Test a forgiving upright body capsule rather than a tiny sphere around the torso.
    // The old sphere sat below the default crosshair height, so straight-ahead shots missed.
    const ray=direction.clone().normalize();
    let target=null, nearest=range, hitY=0;
    for(const zombie of this.zombies) {
      if(zombie.dead) continue;
      const base=zombie.group.position;
      const to=new THREE.Vector3(base.x-origin.x,base.y+1.05*zombie.data.scale-origin.y,base.z-origin.z);
      const along=to.dot(ray);
      if(along<0 || along>nearest) continue;
      const point=origin.clone().addScaledVector(ray,along);
      const dx=point.x-base.x, dz=point.z-base.z;
      const scale=zombie.data.scale;
      const horizontalRadius=0.58*scale;
      const vertical=point.y-base.y;
      if(dx*dx+dz*dz<=horizontalRadius*horizontalRadius && vertical>=0.12*scale && vertical<=2.32*scale) {
        nearest=along;
        target=zombie;
        hitY=vertical;
      }
    }
    if(!target) return null;
    const headshot=Math.abs(hitY-1.86*target.data.scale)<0.38*target.data.scale;
    const actual=Math.round(damage*(headshot?(deadshot?2.15:1.65):1));
    this.damage(target,actual,headshot);
    return {zombie:target,headshot,damage:actual};
  }

  damage(zombie,amount,headshot=false) {
    if(zombie.dead || amount<=0) return;
    zombie.hp-=amount;
    zombie.hurt=0.18;
    this.onDamageScore?.(headshot?20:10);
    const flash=new THREE.Color(0xff5148);
    for(const entry of zombie.flashMaterials||[]) {
      if(entry.material.color && entry.color) entry.material.color.copy(entry.color).lerp(flash,0.68);
      if(entry.material.emissive && entry.emissive) {
        entry.material.emissive.copy(entry.emissive).lerp(flash,0.48);
        entry.material.emissiveIntensity=Math.max(entry.emissiveIntensity,0.42);
      }
    }
    this.audio?.play("hit");
    if(zombie.hp<=0) this.kill(zombie,headshot);
  }

  damageArea(position,radius,damage) {
    for(const zombie of [...this.zombies]) {
      if(zombie.dead) continue;
      const d=zombie.group.position.distanceTo(position);
      if(d<radius) this.damage(zombie,Math.round(damage*(1-d/radius)*0.72),false);
    }
  }

  kill(zombie,headshot=false) {
    if(zombie.dead) return;
    zombie.dead=true;
    this.scene.remove(zombie.group);
    this.audio?.play("kill");
    const bonus=zombie.data.points+(headshot?50:0);
    this.onKill?.(zombie,bonus,headshot);
    if(zombie.data.boss) this.onBossChange?.(null);
    if(zombie.type==="explosive") {
      this.damageArea(zombie.group.position,3.5,70);
      const d=Math.hypot(this.lastPlayerPosition.x-zombie.group.position.x,this.lastPlayerPosition.z-zombie.group.position.z);
      if(d<3.5) this.onPlayerDamage?.(34,zombie);
    }
  }

  chooseType(round) {
    const pool=["standard","standard","standard"];
    if(round>=2) pool.push("runner");
    if(round>=3) pool.push("armored");
    if(round>=4) pool.push("explosive");
    if(round>=6) pool.push("elite","runner");
    if(round>=9) pool.push("armored","elite");
    return pool[Math.floor(Math.random()*pool.length)];
  }

  update(dt, player, world, round) {
    this.clock=(this.clock||0)+dt;
    const targetPos=player.camera.position;
    this.lastPlayerPosition.copy(targetPos);
    const playerRoom=world.roomAt(targetPos);
    for(const zombie of this.zombies) {
      if(zombie.dead) continue;
      zombie.attackTimer=Math.max(0,zombie.attackTimer-dt);
      zombie.hurt=Math.max(0,zombie.hurt-dt);
      const flashAmount=Math.min(1,zombie.hurt/0.18);
      for(const entry of zombie.flashMaterials||[]) {
        if(entry.material.color && entry.color) entry.material.color.copy(entry.color).lerp(new THREE.Color(0xff5148),flashAmount*0.68);
        if(entry.material.emissive && entry.emissive) {
          entry.material.emissive.copy(entry.emissive).lerp(new THREE.Color(0xff5148),flashAmount*0.48);
          entry.material.emissiveIntensity=entry.emissiveIntensity+flashAmount*0.42;
        }
      }
      const zpos=zombie.group.position;
      let targetX=targetPos.x,targetZ=targetPos.z;
      if(zombie.entryWindow&&zombie.entryState==="approach") {
        targetX=zombie.entryWindow.approach.x;targetZ=zombie.entryWindow.approach.z;
        const dx=targetX-zpos.x,dz=targetZ-zpos.z,dist=Math.hypot(dx,dz);
        if(dist>0.35) {zpos.x+=dx/dist*Math.min(dist,zombie.data.speed*dt);zpos.z+=dz/dist*Math.min(dist,zombie.data.speed*dt);}
        else {zombie.entryState="climb";zombie.entryProgress=0;zombie.entryStart=zpos.clone();}
      } else if(zombie.entryWindow&&zombie.entryState==="climb") {
        zombie.entryProgress=Math.min(1,zombie.entryProgress+dt/1.25);
        const t=zombie.entryProgress,ease=t*t*(3-2*t),win=zombie.entryWindow;
        zpos.x=THREE.MathUtils.lerp(zombie.entryStart.x,win.inside.x,ease);
        zpos.z=THREE.MathUtils.lerp(zombie.entryStart.z,win.inside.z,ease);
        zombie.group.position.y=Math.sin(t*Math.PI)*0.82;
        if(t>=1) {zombie.roomId=win.roomId;zombie.entryWindow=null;zombie.entryState="";zombie.group.position.y=0;}
      } else {
        if(zombie.roomId!==playerRoom) {
          const route=world.route(zombie.roomId,playerRoom);
          if(route&&route.length) {
            const portal=world.portalFor(route[0],zombie.roomId);
            targetX=portal.x;targetZ=portal.z;
            if(Math.hypot(zpos.x-portal.x,zpos.z-portal.z)<1.55) zombie.roomId=portal.toRoom;
          } else {
            const room=world.rooms.get(zombie.roomId);
            if(room){targetX=room.x;targetZ=room.z;}
          }
        }
        const dx=targetX-zpos.x,dz=targetZ-zpos.z,dist=Math.hypot(dx,dz);
        const delta=new THREE.Vector3(dx,0,dz);
        if(dist>0.12) {
          delta.normalize();
          const speed=zombie.data.speed*(zombie.data.boss?1:1+Math.min(0.36,(round-1)*0.012));
          let moveDir=delta,step=speed*dt;
          if(zombie.chargeTime>0){moveDir=zombie.chargeDirection;step=7.6*dt;zombie.chargeTime=Math.max(0,zombie.chargeTime-dt);}
          let nx=zpos.x+moveDir.x*step,nz=zpos.z+moveDir.z*step;
          if(this.blocked(nx,nz,world,0.42*zombie.data.scale)) {
            const left=new THREE.Vector3(-delta.z,0,delta.x);
            const candidates=[{x:zpos.x+left.x*step,z:zpos.z+left.z*step},{x:zpos.x-left.x*step,z:zpos.z-left.z*step}];
            const chosen=candidates.find(p=>!this.blocked(p.x,p.z,world,0.42*zombie.data.scale));
            if(chosen){nx=chosen.x;nz=chosen.z;}else{nx=zpos.x;nz=zpos.z;}
          }
          zpos.x=nx;zpos.z=nz;
        }
      }
      const dist=Math.hypot(targetPos.x-zpos.x,targetPos.z-zpos.z);
      const time=this.clock+zombie.phase;
      const moving=dist>0.12;
      const gaitSpeed=zombie.type==="runner"?8.8:zombie.data.boss?4.2:5.8;
      zombie.walkBlend=THREE.MathUtils.damp(zombie.walkBlend,moving?1:0,5,dt);
      const gait=time*gaitSpeed;
      const stride=Math.sin(gait)*zombie.walkBlend;
      const lift=Math.max(0,Math.cos(gait))*zombie.walkBlend;
      const limp=zombie.type==="standard"||zombie.type==="elite"?0.16:0.07;
      zombie.legL.rotation.x=stride*0.62+limp*Math.sin(time*2.1);
      zombie.legR.rotation.x=-stride*0.62-limp*Math.sin(time*2.1);
      zombie.legL.userData.knee.rotation.x=Math.max(0,-stride)*0.9;
      zombie.legR.userData.knee.rotation.x=Math.max(0,stride)*0.9;
      zombie.legL.rotation.z=0.035*Math.sin(gait)*zombie.walkBlend;
      zombie.legR.rotation.z=-0.035*Math.sin(gait)*zombie.walkBlend;
      const drag=zombie.type==="runner"?0.18:0.48;
      zombie.armL.rotation.x=-drag+Math.sin(gait+1.1)*0.48*zombie.walkBlend;
      zombie.armR.rotation.x=-drag+Math.sin(gait+2.3)*0.38*zombie.walkBlend-0.18;
      zombie.armL.rotation.z=0.12+Math.sin(time*1.7)*0.08;
      zombie.armR.rotation.z=-0.1+Math.sin(time*1.5+1)*0.08;
      zombie.armL.userData.elbow.rotation.x=-0.25+Math.max(0,stride)*0.42;
      zombie.armR.userData.elbow.rotation.x=-0.38+Math.max(0,-stride)*0.35;
      if(zombie.entryState==="climb") {
        zombie.armL.rotation.x=-1.45;zombie.armR.rotation.x=-1.6;
        zombie.armL.userData.elbow.rotation.x=-0.75;zombie.armR.userData.elbow.rotation.x=-0.85;
        zombie.legL.rotation.x=0.8;zombie.legR.rotation.x=-0.55;
        zombie.torso.rotation.x=-0.28;
      }
      zombie.torso.rotation.x=-0.12-zombie.walkBlend*0.09+(zombie.data.boss?-0.08:0);
      zombie.torso.rotation.z=Math.sin(time*2.2)*0.035+stride*0.045;
      zombie.head.rotation.x=0.08+Math.sin(time*2.6)*0.055;
      zombie.head.rotation.z=Math.sin(time*1.8+zombie.phase)*0.09;
      if(zombie.entryState!=="climb") zombie.group.position.y=lift*0.045+Math.abs(Math.sin(time*2.1))*0.012;
      zombie.group.rotation.z=Math.sin(time*2.8+zombie.phase)*0.025;
      zombie.group.lookAt(targetPos.x,0,targetPos.z);
      const realDist=Math.hypot(targetPos.x-zpos.x,targetPos.z-zpos.z);
      const ranged=zombie.data.ranged;
      zombie.specialTimer=Math.max(0,zombie.specialTimer-dt);
      if(zombie.type==="brute") {
        if(realDist<8 && zombie.specialTimer<=0 && zombie.chargeTime<=0) {
          zombie.chargeDirection.set(targetPos.x-zpos.x,0,targetPos.z-zpos.z).normalize();
          zombie.chargeTime=0.72;
          zombie.specialTimer=4.5;
          zombie.attackTimer=0.9;
          this.audio?.play("boss");
        }
        if(zombie.chargeTime>0 && realDist<2.15 && zombie.attackTimer<=0) {
          this.onPlayerDamage?.(42,zombie);
          zombie.attackTimer=1.7;
          zombie.chargeTime=0;
          this.audio?.play("hurt");
        }
      } else if(zombie.type==="experiment" && realDist<14 && zombie.specialTimer<=0) {
        const start=zpos.clone().add(new THREE.Vector3(0,1.65,0));
        this.spawnProjectile(start,targetPos.clone());
        zombie.specialTimer=2.35;
        this.audio?.play("power");
      } else if(zombie.type==="overseer" && realDist<10 && zombie.specialTimer<=0) {
        this.spawnShockwave(zpos);
        zombie.specialTimer=6.2;
        this.audio?.play("boss");
      }
      const meleeRange=zombie.data.boss?1.8:1.45;
      if((!ranged || zombie.type==="brute") && realDist<meleeRange && zombie.attackTimer<=0) {
        const damage=zombie.data.damage+(round>10?Math.floor(round/5):0);
        this.onPlayerDamage?.(damage,zombie);
        zombie.attackTimer=zombie.data.boss?1.45:1.15;
        this.audio?.play("hurt");
      }
    }
    this.updateSpecialAttacks(dt,player);
    this.zombies=this.zombies.filter(z=>!z.dead);
  }

  spawnProjectile(origin,target) {
    const geometry=new THREE.SphereGeometry(0.22,7,6);
    const material=new THREE.MeshStandardMaterial({color:0x61fff2,emissive:0x16bfc3,emissiveIntensity:2,roughness:0.2});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const direction=target.sub(origin).normalize();
    this.projectiles.push({mesh,direction,life:3,speed:8.5});
  }

  spawnShockwave(position) {
    const geometry=new THREE.TorusGeometry(0.65,0.075,6,28);
    const material=new THREE.MeshBasicMaterial({color:0xd66bff,transparent:true,opacity:0.92});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.rotation.x=Math.PI/2;
    mesh.position.set(position.x,0.09,position.z);
    this.scene.add(mesh);
    this.shockwaves.push({mesh,x:position.x,z:position.z,timer:1.8});
  }

  updateSpecialAttacks(dt,player) {
    for(const projectile of this.projectiles) {
      projectile.life-=dt;
      projectile.mesh.position.addScaledVector(projectile.direction,projectile.speed*dt);
      if(projectile.mesh.position.distanceTo(player.camera.position)<0.85) {
        this.onPlayerDamage?.(23,null);
        projectile.life=0;
      }
    }
    this.projectiles=this.projectiles.filter(p=>{
      if(p.life<=0) {this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();return false;}
      return true;
    });
    for(const wave of this.shockwaves) {
      wave.timer-=dt;
      const elapsed=1.8-wave.timer;
      const scale=1+elapsed*2.6;
      wave.mesh.scale.setScalar(scale);
      wave.mesh.material.opacity=Math.max(0,wave.timer/1.8);
      if(wave.timer<=0) {
        if(Math.hypot(player.camera.position.x-wave.x,player.camera.position.z-wave.z)<6.0) this.onPlayerDamage?.(48,null);
        wave.mesh.userData.done=true;
      }
    }
    this.shockwaves=this.shockwaves.filter(w=>{
      if(w.mesh.userData.done) {this.scene.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();return false;}
      return true;
    });
  }

  blocked(x,z,world,radius=0.4) {
    for(const c of world.colliders) {
      if(c.kind==="window")continue;
      if(Math.abs(x-c.x)<c.sx/2+radius&&Math.abs(z-c.z)<c.sz/2+radius)return true;
    }
    return false;
  }

  count() { return this.zombies.length; }
  boss() { return this.zombies.find(z=>z.data.boss&&!z.dead)||null; }

  clear() {
    for(const zombie of this.zombies) this.scene.remove(zombie.group);
    for(const projectile of this.projectiles) {this.scene.remove(projectile.mesh);projectile.mesh.geometry.dispose();projectile.mesh.material.dispose();}
    for(const wave of this.shockwaves) {this.scene.remove(wave.mesh);wave.mesh.geometry.dispose();wave.mesh.material.dispose();}
    this.zombies.length=0;
    this.projectiles.length=0;
    this.shockwaves.length=0;
    this.onBossChange?.(null);
  }
}