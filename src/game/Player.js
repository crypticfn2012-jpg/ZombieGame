import * as THREE from "three";

export class PlayerController {
  constructor(camera, canvas, world, settings, onDamage) {
    this.camera=camera;
    this.canvas=canvas;
    this.world=world;
    this.settings=settings;
    this.onDamage=onDamage;
    this.keys=new Set();
    this.velocity=new THREE.Vector3();
    this.yaw=0;
    this.pitch=0;
    this.health=100;
    this.maxHealth=100;
    this.armor=0;
    this.invulnerable=0;
    this.onGround=true;
    this.crouching=false;
    this.sprinting=false;
    this.active=false;
    this.mouseSensitivity=0.0022*(settings.sensitivity/70);
    this.jumpQueued=false;
    this.camera.position.set(0,1.7,5.8);
    this.camera.rotation.order="YXZ";
    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener("keydown",(event)=>{
      this.keys.add(event.code);
      if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code)) event.preventDefault();
      if(event.code==="Space") this.jumpQueued=true;
    });
    window.addEventListener("keyup",(event)=>this.keys.delete(event.code));
    window.addEventListener("blur",()=>this.keys.clear());
    document.addEventListener("mousemove",(event)=>{
      if(document.pointerLockElement!==this.canvas || !this.active) return;
      const invert=this.settings.invert?-1:1;
      this.yaw-=event.movementX*this.mouseSensitivity;
      this.pitch-=event.movementY*this.mouseSensitivity*invert;
      this.pitch=THREE.MathUtils.clamp(this.pitch,-1.45,1.45);
      this.camera.rotation.set(this.pitch,this.yaw,0,"YXZ");
    });
    this.canvas.addEventListener("click",()=>{
      if(this.active && document.pointerLockElement!==this.canvas) {
        const request=this.canvas.requestPointerLock?.();
        request?.catch?.(()=>{});
      }
    });
  }

  setActive(active) {
    this.active=active;
    if(!active) this.keys.clear();
  }

  update(dt, perks=new Set()) {
    if(!this.active || document.pointerLockElement!==this.canvas) return;
    this.invulnerable=Math.max(0,this.invulnerable-dt);
    const forward=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    const right=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    const move=new THREE.Vector3();
    if(this.keys.has("KeyW")) move.add(forward);
    if(this.keys.has("KeyS")) move.sub(forward);
    if(this.keys.has("KeyD")) move.add(right);
    if(this.keys.has("KeyA")) move.sub(right);
    if(move.lengthSq()>0) move.normalize();
    this.crouching=this.keys.has("ControlLeft")||this.keys.has("ControlRight");
    this.sprinting=(this.keys.has("ShiftLeft")||this.keys.has("ShiftRight"))&&!this.crouching&&move.lengthSq()>0;
    const base=this.crouching?2.6:this.sprinting?7.6:5.15;
    const speed=base*(perks.has("stamina")?1.22:1);
    const delta=move.multiplyScalar(speed*dt);
    const pos=this.camera.position;
    this.moveAxis(pos.x+delta.x,pos.z, "x");
    this.moveAxis(pos.x,pos.z+delta.z, "z");
    if(this.jumpQueued && this.onGround && !this.crouching) {
      this.velocity.y=5.1;
      this.onGround=false;
    }
    this.jumpQueued=false;
    this.velocity.y-=15.5*dt;
    pos.y+=this.velocity.y*dt;
    const targetHeight=this.crouching?1.12:1.7;
    if(pos.y<targetHeight) {
      pos.y=targetHeight;
      this.velocity.y=0;
      this.onGround=true;
    }
  }

  moveAxis(x,z,axis) {
    const radius=0.38;
    for(const c of this.world.colliders) {
      if(Math.abs(x-c.x)<c.sx/2+radius && Math.abs(z-c.z)<c.sz/2+radius) return;
    }
    if(axis==="x") this.camera.position.x=x;
    else this.camera.position.z=z;
  }

  damage(amount) {
    if(this.invulnerable>0 || this.health<=0) return false;
    const absorbed=Math.min(this.armor,Math.ceil(amount*0.45));
    this.armor-=absorbed;
    this.health=Math.max(0,this.health-(amount-absorbed));
    this.invulnerable=0.72;
    this.onDamage?.(amount);
    return true;
  }

  heal(amount) {
    this.health=Math.min(this.maxHealth,this.health+amount);
  }

  addArmor(amount) {
    this.armor=Math.min(100,this.armor+amount);
  }

  setMaxHealth(amount) {
    const difference=amount-this.maxHealth;
    this.maxHealth=amount;
    this.health=Math.min(this.maxHealth,this.health+Math.max(0,difference));
  }

  reset() {
    this.keys.clear();
    this.jumpQueued=false;
    this.health=this.maxHealth=100;
    this.armor=0;
    this.invulnerable=0;
    this.velocity.set(0,0,0);
    this.camera.position.set(0,1.7,5.8);
    this.yaw=0;
    this.pitch=0;
    this.camera.rotation.set(0,0,0,"YXZ");
  }

  setSensitivity(value) {
    this.mouseSensitivity=0.0022*(value/70);
  }
}