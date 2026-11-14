import * as THREE from "three";

const ROOM_DATA = [
  { id:"start", name:"SECURITY CHECKPOINT", x:0, z:0, color:0x60727b, doors:["start-lab","start-storage","start-medical"] },
  { id:"lab", name:"MAIN LABORATORY", x:0, z:-22, color:0x4b8c9a, doors:["start-lab","lab-arena"] },
  { id:"storage", name:"STORAGE FACILITY", x:22, z:0, color:0x9a744a, doors:["start-storage","storage-research"] },
  { id:"medical", name:"MEDICAL WING", x:-22, z:0, color:0x79a39a, doors:["start-medical","medical-power"] },
  { id:"power", name:"POWER CONTROL", x:-22, z:-22, color:0xc18b48, doors:["medical-power","power-testing"] },
  { id:"research", name:"RESEARCH WING", x:22, z:-22, color:0x6a7da1, doors:["storage-research","research-pap"] },
  { id:"testing", name:"TEST CHAMBER", x:-22, z:-44, color:0x9a5a54, doors:["power-testing","testing-arena"] },
  { id:"pap", name:"REACTOR VAULT", x:22, z:-44, color:0x6b9d99, doors:["research-pap","pap-arena"] },
  { id:"arena", name:"CONTAINMENT ARENA", x:0, z:-44, color:0x956c8e, doors:["lab-arena","testing-arena","pap-arena"] }
];

const DOOR_DATA = [
  { id:"start-lab", a:"start", b:"lab", cost:650, axis:"z" },
  { id:"start-storage", a:"start", b:"storage", cost:850, axis:"x" },
  { id:"start-medical", a:"start", b:"medical", cost:850, axis:"x" },
  { id:"lab-arena", a:"lab", b:"arena", cost:1250, axis:"z" },
  { id:"storage-research", a:"storage", b:"research", cost:1000, axis:"z" },
  { id:"medical-power", a:"medical", b:"power", cost:1000, axis:"z" },
  { id:"power-testing", a:"power", b:"testing", cost:1350, axis:"z" },
  { id:"research-pap", a:"research", b:"pap", cost:1450, axis:"z" },
  { id:"testing-arena", a:"testing", b:"arena", cost:1600, axis:"x" },
  { id:"pap-arena", a:"pap", b:"arena", cost:1850, axis:"x" }
];

export class FacilityWorld {
  constructor(scene) {
    this.scene = scene;
    this.rooms = new Map(ROOM_DATA.map(r => [r.id, { ...r }]));
    this.doors = [];
    this.interactables = [];
    this.colliders = [];
    this.spawnPoints = [];
    this.powerOn = false;
    this.machineRefs = {};
    this.materials = {
      wall: this.mat(0x34434b, 0.92, 0.08),
      darkWall: this.mat(0x1b272e, 0.9, 0.1),
      floor: this.mat(0x343f43, 0.88, 0.15),
      trim: this.mat(0x879294, 0.72, 0.16),
      metal: this.mat(0x6f7c7d, 0.62, 0.3),
      black: this.mat(0x11191e, 0.45, 0.45),
      cyan: this.mat(0x38d9dc, 0.35, 0.18, 0x0c6267),
      amber: this.mat(0xffb34f, 0.4, 0.18, 0x71421c),
      red: this.mat(0xd94c48, 0.5, 0.15, 0x5b100e),
      glass: new THREE.MeshStandardMaterial({ color:0x6ac6d0, roughness:0.15, metalness:0.25, transparent:true, opacity:0.22 })
    };
    this.build();
  }

  mat(color, roughness=0.8, metalness=0.1, emissive=0x000000) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.6 : 0 });
  }

  box(parent, x, y, z, sx, sy, sz, material, extra={}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x,y,z);
    mesh.castShadow = extra.castShadow ?? true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  addCollider(x,z,sx,sz,kind="solid") {
    this.colliders.push({ x,z,sx,sz,kind });
  }

  build() {
    this.scene.background = new THREE.Color(0x0a1116);
    this.scene.fog = new THREE.FogExp2(0x0b151b, 0.012);
    const hemi = new THREE.HemisphereLight(0x9ecbd1, 0x151a1e, 1.05);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xa8cbd0, 1.6);
    key.position.set(-24, 34, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.left = -70; key.shadow.camera.right = 70;
    key.shadow.camera.top = 30; key.shadow.camera.bottom = -75;
    key.shadow.bias = -0.00035;
    this.scene.add(key);
    const fill = new THREE.PointLight(0x3acbd0, 16, 58, 2);
    fill.position.set(0, 4, -22);
    this.scene.add(fill);
    for (const room of ROOM_DATA) this.buildRoom(room);
    for (const link of DOOR_DATA) this.buildDoor(link);
    this.buildProps();
    this.buildMachines();
    this.buildAmbientDetails();
    this.spawnPoints = ROOM_DATA.flatMap(room => [
      { room:room.id, x:room.x-6, z:room.z-6 },
      { room:room.id, x:room.x+6, z:room.z-6 },
      { room:room.id, x:room.x-6, z:room.z+6 },
      { room:room.id, x:room.x+6, z:room.z+6 }
    ]);
    this.baseColliders = this.colliders.filter(c=>!c.door).map(c=>({...c}));
  }

  hasDoorAt(room, side) {
    return room.doors.some(id => {
      const link = DOOR_DATA.find(d => d.id === id);
      if (!link) return false;
      const otherId = link.a === room.id ? link.b : link.a;
      const other = this.rooms.get(otherId);
      if (side === "north") return other.z < room.z;
      if (side === "south") return other.z > room.z;
      if (side === "east") return other.x > room.x;
      return other.x < room.x;
    });
  }

  buildRoom(room) {
    const group = new THREE.Group();
    group.position.set(room.x,0,room.z);
    group.userData.roomId = room.id;
    this.scene.add(group);
    this.box(group,0,-0.42,0,18,0.8,18,this.materials.floor);
    this.box(group,0,4.9,0,18,0.35,18,this.materials.darkWall,{castShadow:false});
    this.box(group,0,0.04,-8.8,18,0.3,0.35,this.materials.trim);
    this.box(group,0,0.04,8.8,18,0.3,0.35,this.materials.trim);
    this.buildWallEdge(group, room, "north", this.hasDoorAt(room,"north"));
    this.buildWallEdge(group, room, "south", this.hasDoorAt(room,"south"));
    this.buildWallEdge(group, room, "east", this.hasDoorAt(room,"east"));
    this.buildWallEdge(group, room, "west", this.hasDoorAt(room,"west"));
    for (let i=-7;i<=7;i+=2) {
      this.box(group,i,4.7,-8.6,0.18,0.25,0.4,this.materials.metal,{castShadow:false});
      this.box(group,i,4.7,8.6,0.18,0.25,0.4,this.materials.metal,{castShadow:false});
    }
    const light = new THREE.PointLight(room.color, room.id==="start" ? 17 : 11, 17, 2);
    light.position.set(0,3.6,0);
    group.add(light);
    const lamp = this.box(group,0,4.45,0,2.5,0.12,0.7,this.mat(0xb7d0c5,0.3,0.05,room.color),{castShadow:false});
    lamp.userData.emissiveLamp = true;
    const sign = this.box(group,0,3.55,-8.6,4.6,0.8,0.18,this.materials.darkWall);
    const signGlow = this.box(group,0,3.55,-8.48,3.8,0.035,0.045,this.mat(room.color,0.3,0,room.color));
    signGlow.userData.sign = true;
    if (room.id === "start") {
      this.box(group,0,0.6,0,2.7,1.2,2.7,this.materials.darkWall);
      this.box(group,0,1.28,0,2.2,0.16,2.2,this.materials.trim);
    }
  }

  buildWallEdge(group, room, side, hasDoor) {
    const material = this.materials.wall;
    const half = 9;
    const height = 5;
    const thickness = 0.7;
    const opening = hasDoor ? 4.2 : 0;
    if (side === "north" || side === "south") {
      const z = side === "north" ? -half : half;
      if (hasDoor) {
        const segment = (18-opening)/2;
        this.box(group,-(opening/2+segment/2),height/2,z,segment,height,thickness,material);
        this.box(group,(opening/2+segment/2),height/2,z,segment,height,thickness,material);
      } else this.box(group,0,height/2,z,18,height,thickness,material);
      if (hasDoor) {
        const segment=(18-opening)/2;
        this.addCollider(room.x-(opening/2+segment/2),room.z+(side==="north"?-9:9),segment,0.8);
        this.addCollider(room.x+(opening/2+segment/2),room.z+(side==="north"?-9:9),segment,0.8);
      } else this.addCollider(room.x,room.z+(side==="north"?-9:9),18,0.8);
    } else {
      const x = side === "west" ? -half : half;
      if (hasDoor) {
        const segment = (18-opening)/2;
        this.box(group,x,height/2,-(opening/2+segment/2),thickness,height,segment,material);
        this.box(group,x,height/2,(opening/2+segment/2),thickness,height,segment,material);
      } else this.box(group,x,height/2,0,thickness,height,18,material);
      if (hasDoor) {
        const segment=(18-opening)/2;
        this.addCollider(room.x+(side==="west"?-9:9),room.z-(opening/2+segment/2),0.8,segment);
        this.addCollider(room.x+(side==="west"?-9:9),room.z+(opening/2+segment/2),0.8,segment);
      } else this.addCollider(room.x+(side==="west"?-9:9),room.z,0.8,18);
    }
  }

  buildDoor(link) {
    const a = this.rooms.get(link.a), b = this.rooms.get(link.b);
    const x = (a.x+b.x)/2, z = (a.z+b.z)/2;
    const mesh = new THREE.Group();
    mesh.position.set(x,0,z);
    const panel = this.box(mesh,0,1.95,0,link.axis==="x" ? 0.35 : 4.1,3.9,link.axis==="x" ? 4.1 : 0.35,this.materials.red);
    this.box(mesh,0,3.95,0,link.axis==="x" ? 0.55 : 4.3,0.18,link.axis==="x" ? 4.3 : 0.55,this.materials.amber);
    const indicator = this.box(mesh,0,2.2,0,link.axis==="x" ? 0.12 : 0.28,0.3,link.axis==="x" ? 0.28 : 0.12,this.materials.amber);
    this.scene.add(mesh);
    const door = { ...link, x,z,mesh,panel,indicator,open:false, collider:true };
    this.doors.push(door);
    this.interactables.push({ id:link.id, type:"door", name:"SECURITY BULKHEAD", description:"UNLOCK AREA", price:link.cost, position:new THREE.Vector3(x,1.5,z), mesh, ref:door });
    this.addDoorCollider(door);
    const corridorX = Math.abs(a.x-b.x)>0 ? (a.x+b.x)/2 : a.x;
    const corridorZ = Math.abs(a.z-b.z)>0 ? (a.z+b.z)/2 : a.z;
    this.box(this.scene,corridorX,-0.5,corridorZ,4.25,0.1,4.25,this.materials.floor,{castShadow:false});
  }

  addDoorCollider(door) {
    door.collider = true;
    if (door.axis === "x") this.colliders.push({ x:door.x,z:door.z,sx:0.7,sz:4.1,door:door.id,kind:"door" });
    else this.colliders.push({ x:door.x,z:door.z,sx:4.1,sz:0.7,door:door.id,kind:"door" });
  }

  openDoor(id) {
    const door = this.doors.find(d => d.id===id);
    if (!door || door.open) return false;
    door.open = true;
    door.mesh.visible = false;
    this.colliders = this.colliders.filter(c => c.door !== id);
    return true;
  }

  roomAt(position) {
    let best = "start", distance = Infinity;
    for (const room of this.rooms.values()) {
      const dx = position.x-room.x, dz = position.z-room.z;
      const d = dx*dx+dz*dz;
      if (d < distance) { distance=d; best=room.id; }
    }
    return best;
  }

  openRoomIds() {
    const seen = new Set(["start"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const door of this.doors) {
        if (!door.open) continue;
        if (seen.has(door.a) && !seen.has(door.b)) { seen.add(door.b); changed=true; }
        if (seen.has(door.b) && !seen.has(door.a)) { seen.add(door.a); changed=true; }
      }
    }
    return [...seen];
  }

  route(from, to) {
    if (from===to) return [];
    const queue=[[from,[]]], seen=new Set([from]);
    while(queue.length) {
      const [room,path]=queue.shift();
      for (const door of this.doors) {
        if (!door.open) continue;
        const next=door.a===room ? door.b : door.b===room ? door.a : null;
        if (!next || seen.has(next)) continue;
        const nextPath=[...path,door];
        if(next===to) return nextPath;
        seen.add(next); queue.push([next,nextPath]);
      }
    }
    return null;
  }

  portalFor(door, fromRoom) {
    const toRoom = door.a===fromRoom ? door.b : door.a;
    return { x:door.x,z:door.z,toRoom };
  }

  addProp(roomId, x,z, sx,sy,sz,color, options={}) {
    const room=this.rooms.get(roomId);
    const material=typeof color==="number" ? new THREE.MeshStandardMaterial({color,roughness:0.78,metalness:0.12}) : color;
    const mesh=this.box(this.scene,room.x+x,sy/2,room.z+z,sx,sy,sz,material);
    if(options.collider!==false) this.addCollider(room.x+x,room.z+z,sx+0.25,sz+0.25);
    return mesh;
  }

  buildProps() {
    for (const id of ["storage","medical","power","research","testing","pap"]) {
      for (let i=0;i<3;i++) {
        const x=-6+(i*6);
        this.addProp(id,x,-6,2.3,1.7,1.3,i===1?0x4d6269:0x303f45);
        this.box(this.scene,this.rooms.get(id).x+x,1.78,this.rooms.get(id).z-6,2.1,0.12,1.1,this.materials.trim);
      }
    }
    this.addProp("storage",-6,5,2.8,2.6,2.8,0x7b5b3e);
    this.addProp("storage",-6,5,2.25,0.08,2.25,0xc18b48,{collider:false});
    this.addProp("lab",-6,2,2.8,2.1,4.5,0x263a43);
    this.addProp("lab",-6,2,2.55,1.8,0.1,0x56bec0,{collider:false});
    this.addProp("medical",5,4,3,1.4,1.5,0x506b67);
    this.addProp("power",-5,5,4,2.5,2.2,0x303b3d);
    this.addProp("testing",0,-5,5.5,0.7,5.5,0x6d3230);
    this.addProp("pap",0,0,5.5,1,5.5,0x233c44);
    this.addProp("arena",0,0,4,1,4,0x4c3e55);
    for (const room of ROOM_DATA) {
      for (const side of [-1,1]) {
        this.addProp(room.id,side*7,0,0.7,3.6,0.7,0x2a363b);
        this.box(this.scene,room.x+side*7,3.7,room.z,0.95,0.18,0.95,this.materials.amber,{castShadow:false});
      }
      for (let i=0;i<3;i++) {
        this.box(this.scene,room.x-6+i*6,0.2,room.z+7,1.2,0.4,1.2,this.materials.black);
      }
    }
  }

  addMachine(id,type,name,roomId,x,z,color,cost,description) {
    const room=this.rooms.get(roomId);
    const group=new THREE.Group();
    group.position.set(room.x+x,0,room.z+z);
    this.scene.add(group);
    const base=new THREE.MeshStandardMaterial({color:0x17252b,roughness:0.35,metalness:0.6});
    const shell=new THREE.MeshStandardMaterial({color,roughness:0.3,metalness:0.32,emissive:color,emissiveIntensity:0.16});
    this.box(group,0,0.8,0,1.35,1.6,1.0,base);
    this.box(group,0,1.72,0,1.15,0.3,0.9,shell);
    this.box(group,0,1.1,0.51,0.72,0.64,0.08,shell);
    this.box(group,0,0.35,0.51,0.42,0.12,0.08,this.materials.amber);
    const light=new THREE.PointLight(color,1.6,5);
    light.position.set(0,2,0);
    group.add(light);
    const rotor=this.box(group,0,2.05,0,0.26,0.08,0.26,this.materials.cyan,{castShadow:false});
    const obj={id,type,name,price:cost,description,position:new THREE.Vector3(room.x+x,1.3,room.z+z),mesh:group,rotor,roomId,active:false};
    this.interactables.push(obj);
    this.machineRefs[id]=obj;
    return obj;
  }

  buildMachines() {
    this.addMachine("jugger","perk","JUGGERNAUT", "medical", -5,-3,0xb4473e,2500,"INCREASE MAXIMUM HEALTH");
    this.addMachine("speed","perk","SPEED COLA", "storage",5,-4,0x31b76b,2000,"FASTER RELOADS");
    this.addMachine("quick","perk","QUICK REVIVE", "medical",5,-3,0x3e9fd1,1500,"FASTER RECOVERY");
    this.addMachine("double","perk","DOUBLE DAMAGE", "lab",-5,-3,0xd6a23b,3000,"INCREASE WEAPON DAMAGE");
    this.addMachine("stamina","perk","STAMIN-UP", "start",6,5,0x8e6bd1,2000,"MOVE AND SPRINT FASTER");
    this.addMachine("deadshot","perk","DEADSHOT", "research",5,-3,0x4ab2aa,2500,"MORE CRITICAL DAMAGE");
    this.addMachine("mule","perk","MULE KICK", "power",5,-3,0xc18b48,3000,"CARRY THREE WEAPONS");
    const pap=this.addMachine("pack","pap","PACK-A-PUNCH","pap",0,0,0x28c9d2,5000,"UPGRADE YOUR HELD WEAPON");
    pap.mesh.scale.set(1.55,1.5,1.55);
    this.addMachine("power-switch","power","POWER RELAY","power",-5,3,0xffc35e,0,"RESTORE FACILITY POWER");
    const box=this.addMachine("mystery","mystery","MYSTERY CRATE","lab",5,3,0x8f5ce3,950,"RANDOM WEAPON / 950 CREDITS");
    box.mesh.scale.set(1.15,1.1,1.15);
    this.addMachine("terminal","terminal","RESEARCH TERMINAL","research",-5,3,0x3ec9d2,0,"ACCESS CLASSIFIED FILE");
    this.addMachine("document-a","document","INCIDENT REPORT 07","start",-6,-5,0xd7ca9a,0,"COLLECT RESEARCH DOCUMENT");
    this.addMachine("document-b","document","SUBJECT R-09","testing",5,3,0xd7ca9a,0,"COLLECT RESEARCH DOCUMENT");
    this.addMachine("document-c","document","FINAL TRANSMISSION","arena",0,5,0xd7ca9a,0,"COLLECT RESEARCH DOCUMENT");
    const buys = [
      ["buy-rifle","rifle","SERVICE RIFLE","start",7,-4,0x86a8ab,1200],
      ["buy-smg","smg","COMPACT SMG","storage",-5,3,0xb7a05d,1400],
      ["buy-shotgun","shotgun","PUMP SHOTGUN","lab",5,-3,0xc18b48,1700],
      ["buy-burst","burst","BURST RIFLE","research",-5,-3,0x66a7b7,1900],
      ["buy-sniper","sniper","TACTICAL DMR","testing",0,5,0x9a9cb0,2400],
      ["buy-launcher","launcher","GRENADE LAUNCHER","pap",-5,3,0x8eab77,3200],
      ["buy-revolver","revolver","HEAVY REVOLVER","medical",0,5,0x9c8167,1800]
    ];
    for(const [id,weapon,name,room,x,z,color,cost] of buys) {
      const item=this.addMachine(id,"wallbuy",name,room,x,z,color,cost,"PURCHASE " + name);
      item.weapon=weapon;
      item.mesh.scale.set(0.68,0.7,0.68);
    }
  }

  buildAmbientDetails() {
    const pipeMat=this.mat(0x53636a,0.4,0.7);
    for(const room of ROOM_DATA) {
      for(let i=0;i<4;i++) {
        this.box(this.scene,room.x-6+i*4,4.45,room.z-8,0.18,0.18,3.8,pipeMat,{castShadow:false});
      }
      const stripe=this.box(this.scene,room.x,0.015,room.z-8.35,17,0.025,0.12,this.materials.amber,{castShadow:false});
      stripe.material=this.mat(0x7a8a8c,0.65,0.15);
      for(let i=0;i<7;i++) {
        this.box(this.scene,room.x-7+i*2,0.012,room.z-7,0.035,0.02,0.035,this.materials.trim,{castShadow:false});
      }
    }
    const grid=new THREE.GridHelper(220,55,0x1d353b,0x14272d);
    grid.position.set(0,-0.045,-21);
    this.scene.add(grid);
  }

  reset() {
    this.powerOn=false;
    this.colliders=this.baseColliders.map(c=>({...c}));
    for(const door of this.doors) {
      door.open=false;
      door.mesh.visible=true;
      this.addDoorCollider(door);
    }
    for(const item of this.interactables) {
      item.active=false;
      if(item.rotor) item.rotor.rotation.y=0;
      item.mesh?.traverse?.(child=>{ if(child.isPointLight) child.intensity=1.6; });
    }
  }

  update(time) {
    for (const item of this.interactables) {
      if(item.rotor) {
        item.rotor.rotation.y=time*1.2;
        if(item.active) item.mesh.traverse(o=>{ if(o.isPointLight) o.intensity=2.6+Math.sin(time*5)*0.8; });
      }
    }
    for(const door of this.doors) {
      if(!door.open) door.indicator.material=this.materials.amber;
    }
  }
}

export { ROOM_DATA, DOOR_DATA };