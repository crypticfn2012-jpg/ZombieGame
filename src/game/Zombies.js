import * as THREE from "three";

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
    const data=TYPES[type] || TYPES.standard;
    const group=new THREE.Group();
    const scale=data.scale;
    group.scale.setScalar(scale);
    const mat=(color,rough=0.88,metal=0.04)=>new THREE.MeshToonMaterial({color});
    const skin=mat(data.color), dark=mat(0x273a32), cloth=mat(type==="armored"?0x303a43:0x3b4640), eye=mat(0xff443b,0.3,0);
    const part=(x,y,z,sx,sy,sz,material)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      m.position.set(x,y,z);
      m.castShadow=false;
      m.receiveShadow=false;
      group.add(m);
      return m;
    };
    const torso=part(0,1.03,0,0.66,0.86,0.38,cloth);
    part(0,1.86,-0.02,0.48,0.48,0.43,skin);
    part(-0.13,1.98,-0.235,0.075,0.06,0.035,eye);
    part(0.13,1.98,-0.235,0.075,0.06,0.035,eye);
    part(-0.12,1.55,0,0.2,0.3,0.2,dark);
    part(0.15,1.18,-0.2,0.12,0.15,0.025,skin);
    const armL=part(-0.47,1.05,0,0.23,0.74,0.25,skin);
    const armR=part(0.47,1.05,0,0.23,0.74,0.25,skin);
    const legL=part(-0.2,0.4,0,0.23,0.8,0.27,dark);
    const legR=part(0.2,0.4,0,0.23,0.8,0.27,dark);
    if(type==="armored"||data.boss) {
      part(0,1.42,0.03,0.78,0.19,0.45,mat(data.boss?0x493e4e:0x8e9899,0.4,0.6));
      part(-0.4,1.34,0,0.35,0.25,0.4,mat(0x56656b,0.4,0.6));
      part(0.4,1.34,0,0.35,0.25,0.4,mat(0x56656b,0.4,0.6));
    }
    if(type==="explosive") {
      part(0,1.04,0.27,0.26,0.3,0.11,mat(0xec793d,0.4,0,0xd54a1c));
    }
    if(data.boss) {
      part(0,2.42,0,0.52,0.24,0.28,mat(0x1c2529));
      part(-0.34,2.1,-0.08,0.15,0.38,0.15,mat(0x2d303c));
      part(0.34,2.1,-0.08,0.15,0.38,0.15,mat(0x2d303c));
    }
    const aura=null;
    return {group,type,data,hp:data.health,maxHp:data.health,armL,armR,legL,legR,torso,aura,attackTimer:0,specialTimer:1.4,chargeTime:0,chargeDirection:new THREE.Vector3(),phase:Math.random()*Math.PI*2,dead:false,roomId:"start",hurt:0};
  }

  spawn(type, position, roomId, round=1) {
    if(this.zombies.length>=this.maxAlive) return null;
    const zombie=this.makeZombie(type);
    const scaleHealth=type==="brute"||type==="experiment"||type==="overseer"?1:1+Math.max(0,round-1)*0.16;
    zombie.maxHp=Math.round(zombie.hp*scaleHealth);
    zombie.hp=zombie.maxHp;
    zombie.group.position.set(position.x,0,position.z);
    zombie.roomId=roomId;
    this.scene.add(zombie.group);
    this.zombies.push(zombie);
    if(zombie.data.boss) this.onBossChange?.(zombie);
    return zombie;
  }

  damageRay(origin,direction,range,damage,deadshot=false) {
    let target=null, nearest=range;
    for(const zombie of this.zombies) {
      if(zombie.dead) continue;
      const center=zombie.group.position.clone().add(new THREE.Vector3(0,1.18*zombie.data.scale,0));
      const to=center.sub(origin);
      const along=to.dot(direction);
      if(along<0 || along>nearest) continue;
      const closest=origin.clone().add(direction.clone().multiplyScalar(along));
      const radius=0.54*zombie.data.scale;
      if(closest.distanceToSquared(center)<=radius*radius) {
        nearest=along;
        target=zombie;
      }
    }
    if(!target) return null;
    const headY=target.group.position.y+1.86*target.data.scale;
    const headshot=Math.abs((origin.y+direction.y*nearest)-headY)<0.35*target.data.scale;
    const actual=Math.round(damage*(headshot?(deadshot?2.15:1.65):1));
    this.damage(target,actual,headshot);
    return { zombie:target,headshot,damage:actual };
  }

  damage(zombie,amount,headshot=false) {
    if(zombie.dead) return;
    zombie.hp-=amount;
    zombie.hurt=0.11;
    this.onDamageScore?.(headshot?20:10);
    zombie.torso.material.emissive.setHex(0x8c2929);
    zombie.torso.material.emissiveIntensity=0.9;
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
      if(zombie.hurt<=0 && zombie.torso.material.emissiveIntensity>0) {
        zombie.torso.material.emissiveIntensity=0;
        zombie.torso.material.emissive.setHex(0x000000);
      }
      const zpos=zombie.group.position;
      let targetX=targetPos.x,targetZ=targetPos.z;
      if(zombie.roomId!==playerRoom) {
        const route=world.route(zombie.roomId,playerRoom);
        if(route && route.length) {
          const portal=world.portalFor(route[0],zombie.roomId);
          targetX=portal.x; targetZ=portal.z;
          if(Math.hypot(zpos.x-portal.x,zpos.z-portal.z)<1.55) zombie.roomId=portal.toRoom;
        } else {
          const room=world.rooms.get(zombie.roomId);
          if(room) {targetX=room.x; targetZ=room.z;}
        }
      }
      const dx=targetX-zpos.x,dz=targetZ-zpos.z;
      const dist=Math.sqrt(dx*dx+dz*dz);
      const delta=new THREE.Vector3(dx,0,dz);
      if(dist>0.12) {
        delta.normalize();
        const speed=zombie.data.speed*(zombie.data.boss?1:1+Math.min(0.36,(round-1)*0.012));
        let moveDir=delta;
        let step=speed*dt;
        if(zombie.chargeTime>0) {
          moveDir=zombie.chargeDirection;
          step=7.6*dt;
          zombie.chargeTime=Math.max(0,zombie.chargeTime-dt);
        }
        let nx=zpos.x+moveDir.x*step, nz=zpos.z+moveDir.z*step;
        if(this.blocked(nx,nz,world,0.42*zombie.data.scale)) {
          const left=new THREE.Vector3(-delta.z,0,delta.x);
          const candidates=[
            {x:zpos.x+left.x*step,z:zpos.z+left.z*step},
            {x:zpos.x-left.x*step,z:zpos.z-left.z*step}
          ];
          const chosen=candidates.find(p=>!this.blocked(p.x,p.z,world,0.42*zombie.data.scale));
          if(chosen) {nx=chosen.x;nz=chosen.z;}
          else {nx=zpos.x;nz=zpos.z;}
        }
        zpos.x=nx; zpos.z=nz;
      }
      const time=this.clock+zombie.phase;
      zombie.legL.rotation.x=Math.sin(time*5)*0.48;
      zombie.legR.rotation.x=-Math.sin(time*5)*0.48;
      zombie.armL.rotation.x=-0.55+Math.sin(time*5+1)*0.38;
      zombie.armR.rotation.x=-0.55-Math.sin(time*5+1)*0.38;
      zombie.group.position.y=Math.abs(Math.sin(time*5))*0.055;
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
      if(Math.abs(x-c.x)<c.sx/2+radius && Math.abs(z-c.z)<c.sz/2+radius) return true;
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