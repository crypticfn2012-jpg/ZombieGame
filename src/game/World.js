import * as THREE from "three";

const ROOM_DATA = [
  { id:"start", name:"SECURITY CHECKPOINT", x:0, z:0, color:0x9a9b83, doors:["start-lab","start-storage","start-medical"] },
  { id:"lab", name:"DECONTAMINATION", x:0, z:-22, color:0x9b987e, doors:["start-lab","lab-arena"] },
  { id:"storage", name:"SUPPLY DEPOT", x:22, z:0, color:0xa68b63, doors:["start-storage","storage-research"] },
  { id:"medical", name:"INFIRMARY", x:-22, z:0, color:0x8caa9b, doors:["start-medical","medical-power"] },
  { id:"power", name:"GENERATOR HALL", x:-22, z:-22, color:0xb08c56, doors:["medical-power","power-testing"] },
  { id:"research", name:"BIOLOGY LAB", x:22, z:-22, color:0x829a8b, doors:["storage-research","research-pap"] },
  { id:"testing", name:"OBSERVATION WARD", x:-22, z:-44, color:0x9b8272, doors:["power-testing","testing-arena"] },
  { id:"pap", name:"REACTOR CHAMBER", x:22, z:-44, color:0x9a9a78, doors:["research-pap","pap-arena"] },
  { id:"arena", name:"CORE ACCESS", x:0, z:-44, color:0x938b7b, doors:["lab-arena","testing-arena","pap-arena"] }
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

const toonRamp = new THREE.DataTexture(new Uint8Array([48,48,48,255,126,126,126,255,226,226,226,255]),3,1,THREE.RGBAFormat);
toonRamp.minFilter=THREE.NearestFilter; toonRamp.magFilter=THREE.NearestFilter; toonRamp.generateMipmaps=false; toonRamp.needsUpdate=true;

const surfacePixels=new Uint8Array(16*4);
for(let i=0;i<16;i++){const shade=(i%4===0||Math.floor(i/4)%2===0)?218:244;surfacePixels.set([shade,shade,shade,255],i*4);}
const surfaceTexture=new THREE.DataTexture(surfacePixels,4,4,THREE.RGBAFormat);
surfaceTexture.wrapS=THREE.RepeatWrapping;surfaceTexture.wrapT=THREE.RepeatWrapping;
surfaceTexture.magFilter=THREE.NearestFilter;surfaceTexture.minFilter=THREE.NearestFilter;
surfaceTexture.repeat.set(5,5);surfaceTexture.colorSpace=THREE.SRGBColorSpace;surfaceTexture.needsUpdate=true;

export class FacilityWorld {
  constructor(scene) {
    this.scene = scene;
    this.rooms = new Map(ROOM_DATA.map(r => [r.id, { ...r }]));
    this.doors = [];
    this.interactables = [];
    this.colliders = [];
    this.spawnPoints = [];
    this.windows = [];
    this.radiationZones=[];
    this.powerOn = false;
    this.machineRefs = {};
    this.textures=this.makeTextures();
    this.materials = {
      wall: new THREE.MeshToonMaterial({color:0xc0b9a4,map:this.textures.concrete,gradientMap:toonRamp}),
      darkWall: this.mat(0x1b272e, 0.9, 0.1),
      floor: new THREE.MeshToonMaterial({color:0x9d9a88,map:this.textures.floor,gradientMap:toonRamp}),
      trim: this.mat(0x758286, 0.75, 0.08),
      metal: this.mat(0x6f7c7d, 0.62, 0.3),
      black: this.mat(0x11191e, 0.45, 0.45),
      cyan: this.mat(0x38d9dc, 0.35, 0.18, 0x0c6267),
      amber: this.mat(0xffb34f, 0.4, 0.18, 0x71421c),
      red: this.mat(0xd94c48, 0.5, 0.15, 0x5b100e),
      glass: new THREE.MeshStandardMaterial({ color:0x6ac6d0, roughness:0.15, metalness:0.25, transparent:true, opacity:0.22 }),
      wood: new THREE.MeshToonMaterial({color:0xc49a64,map:this.textures.wood,gradientMap:toonRamp}),
      chalk: this.mat(0xe4dfc9,0.95,0),
      paint: this.mat(0x68786a,0.9,0.02),
      rust: this.mat(0x704b36,0.95,0.05),
      tile: new THREE.MeshToonMaterial({color:0xb0ad9b,map:this.textures.tile,gradientMap:toonRamp})
    };
    this.build();
  }

  makeTextures() {
    const make=(kind,base,repeatX=2,repeatY=2)=>{
      const size=32,data=new Uint8Array(size*size*4);
      let seed=kind==="wood"?9173:kind==="floor"?1729:kind==="tile"?4817:7727;
      const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      const rgb=[(base>>16)&255,(base>>8)&255,base&255];
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        let n=(rand()-0.5)*(kind==="concrete"?38:kind==="wood"?28:18);
        if(kind==="concrete"&&y%8===0)n-=18;
        if(kind==="concrete"&&x%16===0&&y%8<2)n-=12;
        if(kind==="wood"){
          if(x%8===0)n-=34;
          if(y%11===0)n-=10;
          if((x+y*3)%29===0)n+=20;
        }
        if(kind==="floor"&&(x%8===0||y%8===0))n-=30;
        if(kind==="tile"&&(x%16===0||y%16===0))n-=35;
        const i=(y*size+x)*4;
        for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,Math.round(rgb[c]+n)));
        data[i+3]=255;
      }
      const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
      tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
      tex.repeat.set(repeatX,repeatY);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps=true;tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;
      return tex;
    };
    return {
      concrete:make("concrete",0x999589,2,1),
      wood:make("wood",0x9a7048,1,2),
      floor:make("floor",0x77766d,4,4),
      tile:make("tile",0x99988c,4,4)
    };
  }

  mat(color, roughness=0.8, metalness=0.1, emissive=0x000000) {
    return new THREE.MeshToonMaterial({ color, gradientMap:toonRamp, emissive, emissiveIntensity: emissive ? 0.3 : 0 });
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
    key.castShadow = false;
    key.shadow.mapSize.set(512,512);
    key.shadow.camera.left = -70; key.shadow.camera.right = 70;
    key.shadow.camera.top = 30; key.shadow.camera.bottom = -75;
    key.shadow.bias = -0.00035;
    this.scene.add(key);
    const fill = new THREE.PointLight(0x3acbd0, 7, 42, 2);
    fill.position.set(0, 4, -22);
    this.scene.add(fill);
    this.buildExterior();
    for (const room of ROOM_DATA) this.buildRoom(room);
    for (const link of DOOR_DATA) this.buildDoor(link);
    this.buildProps();
    this.buildHazards();
    this.buildMachines();
    this.buildAmbientDetails();
    this.spawnPoints = this.windows.map(win=>({room:win.roomId,x:win.outside.x,z:win.outside.z,window:win}));
    this.baseColliders = this.colliders.filter(c=>!c.door).map(c=>({...c}));
  }

  buildExterior() {
    const ground=this.mat(0x222c30,0.96,0.02);
    const fence=this.mat(0x3d4a4e,0.75,0.18);
    const concrete=this.mat(0x566166,0.9,0.02);
    const hazard=this.mat(0xb38b4e,0.72,0.08);
    this.box(this.scene,0,-0.94,-22,108,0.22,112,ground,{castShadow:false});
    // A fenced service yard surrounds the nine-room research facility.
    for(const x of [-46,46]) {
      this.box(this.scene,x,2.2,-22,0.35,4.4,104,fence,{castShadow:false});
      for(let z=-70;z<=26;z+=8)this.box(this.scene,x,2.2,z,0.65,4.6,0.65,concrete,{castShadow:false});
    }
    for(const z of [-74,30]) {
      this.box(this.scene,0,2.2,z,92,4.4,0.35,fence,{castShadow:false});
      for(let x=-44;x<=44;x+=8)this.box(this.scene,x,2.2,z,0.65,4.6,0.65,concrete,{castShadow:false});
    }
    // A few low voxel cargo stacks make the perimeter feel like a real compound.
    for(const [x,z,w,d,c] of [[-38,-60,8,4,0x435158],[37,-56,7,4,0x4b5557],[-38,15,7,5,0x46545a],[37,17,8,4,0x3d4e55]]) {
      this.box(this.scene,x,1.2,z,w,2.4,d,this.mat(c),{castShadow:false});
      this.box(this.scene,x,2.45,z,w+0.08,0.12,d+0.08,hazard,{castShadow:false});
    }
    // Simple square floodlight pylons at the outer corners.
    for(const [x,z] of [[-43,-70],[43,-70],[-43,26],[43,26]]) {
      this.box(this.scene,x,3,z,0.65,6,0.65,concrete,{castShadow:false});
      this.box(this.scene,x,6.15,z,1.7,0.22,0.8,this.materials.amber,{castShadow:false});
      const light=new THREE.PointLight(0xffc777,2.2,22,2);
      light.position.set(x,5.8,z);this.scene.add(light);
    }
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
    this.box(group,0,-0.42,0,18,0.8,18,room.id==="medical"||room.id==="lab"?this.materials.tile:this.materials.floor);
    this.box(group,0,4.9,0,18,0.35,18,this.materials.darkWall,{castShadow:false});
    this.box(group,0,0.11,-8.56,17.8,0.16,0.08,this.materials.paint,{castShadow:false});
    this.box(group,0,0.11,8.56,17.8,0.16,0.08,this.materials.paint,{castShadow:false});
    this.box(group,0,0.04,-8.8,18,0.3,0.35,this.materials.trim);
    this.box(group,0,0.04,8.8,18,0.3,0.35,this.materials.trim);
    const windowSide=["south","east","west","north"].find(side=>!this.hasDoorAt(room,side));
    room.windowSide=windowSide;
    this.buildWallEdge(group, room, "north", this.hasDoorAt(room,"north"),windowSide==="north");
    this.buildWallEdge(group, room, "south", this.hasDoorAt(room,"south"),windowSide==="south");
    this.buildWallEdge(group, room, "east", this.hasDoorAt(room,"east"),windowSide==="east");
    this.buildWallEdge(group, room, "west", this.hasDoorAt(room,"west"),windowSide==="west");
    for (let i=-7;i<=7;i+=2) {
      this.box(group,i,4.7,-8.6,0.18,0.25,0.4,this.materials.metal,{castShadow:false});
      this.box(group,i,4.7,8.6,0.18,0.25,0.4,this.materials.metal,{castShadow:false});
    }
    const light = new THREE.PointLight(room.color, room.id==="start" ? 8 : 4, 14, 2);
    light.position.set(0,3.6,0);
    group.add(light);
    const lamp = this.box(group,0,4.45,0,2.5,0.12,0.7,this.mat(0xb7d0c5,0.3,0.05,room.color),{castShadow:false});
    lamp.userData.emissiveLamp = true;
    this.box(group,0,3.65,-8.55,5.8,0.92,0.22,this.materials.darkWall,{castShadow:false});
    this.box(group,0,4.12,-8.41,5.55,0.06,0.05,this.materials.amber,{castShadow:false});
    this.box(group,-2.25,3.65,-8.4,0.12,0.55,0.06,this.materials.amber,{castShadow:false});
    this.box(group,2.25,3.65,-8.4,0.12,0.55,0.06,this.materials.amber,{castShadow:false});
    this.box(group,0,3.18,-8.41,5.55,0.06,0.05,this.materials.amber,{castShadow:false});
    for(let i=0;i<5;i++)this.box(group,-1.5+i*0.75,3.62,-8.38,0.35,0.08,0.04,this.mat(room.color),{castShadow:false});
    if (room.id === "start") {
      this.box(group,0,0.6,0,2.7,1.2,2.7,this.materials.darkWall);
      this.box(group,0,1.28,0,2.2,0.16,2.2,this.materials.trim);
    }
  }

  buildWallEdge(group, room, side, hasDoor, hasWindow=false) {
    const material=this.materials.wall;
    const half=9,height=5,thickness=0.7;
    const opening=hasDoor?4.2:0;
    const windowWidth=3.4;
    const windowBottom=0.82;
    const windowTop=3.15;
    const makeWindow=()=>{
      const normal=side==="north"?{x:0,z:-1}:side==="south"?{x:0,z:1}:side==="east"?{x:1,z:0}:{x:-1,z:0};
      const x=room.x+(side==="east"?9:side==="west"?-9:0);
      const z=room.z+(side==="south"?9:side==="north"?-9:0);
      const win={id:room.id+"-window",roomId:room.id,side,x,z,normal,
        outside:{x:x+normal.x*7.5,z:z+normal.z*7.5},
        approach:{x:x+normal.x*0.85,z:z+normal.z*0.85},
        inside:{x:x-normal.x*1.8,z:z-normal.z*1.8}};
      this.windows.push(win);
      const sill=this.mat(0x66747a,0.75,0.2), board=this.mat(0x76563e,0.92,0.02), frame=this.materials.darkWall;
      if(side==="north"||side==="south") {
        this.addCollider(x,z,windowWidth,0.8,"window");
        this.box(group,0,windowBottom/2,side==="north"?-half:half,windowWidth,windowBottom,thickness,sill);
        this.box(group,0,(height+windowTop)/2,side==="north"?-half:half,windowWidth,height-windowTop,thickness,material);
        this.box(group,-(windowWidth/2+ (18-windowWidth)/4),height/2,side==="north"?-half:half,(18-windowWidth)/2,height,thickness,material);
        this.box(group,(windowWidth/2+ (18-windowWidth)/4),height/2,side==="north"?-half:half,(18-windowWidth)/2,height,thickness,material);
        this.box(group,0,windowBottom+0.04,side==="north"?-half:half,windowWidth+0.25,0.12,0.95,frame);
        for(let i=0;i<3;i++) this.box(group,-1.05+i*1.05,1.65,side==="north"?-half+0.12:half-0.12,0.12,0.12,0.42,board,{castShadow:false});
        this.addCollider(room.x-(windowWidth/2+(18-windowWidth)/4),z,(18-windowWidth)/2,0.8);
        this.addCollider(room.x+(windowWidth/2+(18-windowWidth)/4),z,(18-windowWidth)/2,0.8);
      } else {
        this.addCollider(x,z,0.8,windowWidth,"window");
        this.box(group,side==="west"?-half:half,windowBottom/2,0,thickness,windowBottom,windowWidth,sill);
        this.box(group,side==="west"?-half:half,(height+windowTop)/2,0,thickness,height-windowTop,windowWidth,material);
        this.box(group,side==="west"?-half:half,height/2,-(windowWidth/2+(18-windowWidth)/4),thickness,height,(18-windowWidth)/2,material);
        this.box(group,side==="west"?-half:half,height/2,(windowWidth/2+(18-windowWidth)/4),thickness,height,(18-windowWidth)/2,material);
        this.box(group,side==="west"?-half:half,windowBottom+0.04,0,0.95,0.12,windowWidth+0.25,frame);
        for(let i=0;i<3;i++) this.box(group,side==="west"?-half+0.12:half-0.12,1.65,-1.05+i*1.05,0.42,0.12,0.12,board,{castShadow:false});
        this.addCollider(x,room.z-(windowWidth/2+(18-windowWidth)/4),0.8,(18-windowWidth)/2);
        this.addCollider(x,room.z+(windowWidth/2+(18-windowWidth)/4),0.8,(18-windowWidth)/2);
      }
    };
    if(hasWindow&&!hasDoor) { makeWindow(); return; }
    if(side==="north"||side==="south") {
      const z=side==="north"?-half:half;
      if(hasDoor) {
        const segment=(18-opening)/2;
        this.box(group,-(opening/2+segment/2),height/2,z,segment,height,thickness,material);
        this.box(group,(opening/2+segment/2),height/2,z,segment,height,thickness,material);
        this.addCollider(room.x-(opening/2+segment/2),room.z+(side==="north"?-9:9),segment,0.8);
        this.addCollider(room.x+(opening/2+segment/2),room.z+(side==="north"?-9:9),segment,0.8);
      } else {
        this.box(group,0,height/2,z,18,height,thickness,material);
        this.addCollider(room.x,room.z+(side==="north"?-9:9),18,0.8);
      }
    } else {
      const x=side==="west"?-half:half;
      if(hasDoor) {
        const segment=(18-opening)/2;
        this.box(group,x,height/2,-(opening/2+segment/2),thickness,height,segment,material);
        this.box(group,x,height/2,(opening/2+segment/2),thickness,height,segment,material);
        this.addCollider(room.x+(side==="west"?-9:9),room.z-(opening/2+segment/2),0.8,segment);
        this.addCollider(room.x+(side==="west"?-9:9),room.z+(opening/2+segment/2),0.8,segment);
      } else {
        this.box(group,x,height/2,0,thickness,height,18,material);
        this.addCollider(room.x+(side==="west"?-9:9),room.z,0.8,18);
      }
    }
  }
  buildDoor(link) {
    const a=this.rooms.get(link.a),b=this.rooms.get(link.b);
    const x=(a.x+b.x)/2,z=(a.z+b.z)/2;
    const mesh=new THREE.Group();mesh.position.set(x,0,z);
    const alongZ=link.axis==="x";
    const wood=this.materials.wood, dark=this.materials.darkWall, metal=this.materials.metal;
    const post=(px,pz,sx,sz)=>this.box(mesh,px,1.95,pz,sx,3.9,sz,dark);
    if(alongZ){
      post(0,-2.18,0.46,0.42);post(0,2.18,0.46,0.42);
      this.box(mesh,0,3.95,0,0.48,0.28,4.65,metal);
      for(let i=0;i<8;i++){
        const zz=-1.75+i*0.5;
        this.box(mesh,0,1.88,zz,0.28,3.72,0.48,wood);
        this.box(mesh,0.16,1.88,zz,0.035,3.62,0.035,this.materials.rust,{castShadow:false});
      }
      for(const y of [0.65,2.95]){
        this.box(mesh,0.2,y,0,3.75,0.18,0.12,metal,{castShadow:false});
        this.box(mesh,-0.2,y,0,3.75,0.18,0.12,metal,{castShadow:false});
      }
      this.box(mesh,0,1.95,0,0.16,0.18,0.18,this.materials.amber,{castShadow:false});
    }else{
      post(-2.18,0,0.42,0.46);post(2.18,0,0.42,0.46);
      this.box(mesh,0,3.95,0,4.65,0.28,0.48,metal);
      for(let i=0;i<8;i++){
        const xx=-1.75+i*0.5;
        this.box(mesh,xx,1.88,0,0.48,3.72,0.28,wood);
        this.box(mesh,xx,1.88,0.16,0.035,3.62,0.035,this.materials.rust,{castShadow:false});
      }
      for(const y of [0.65,2.95]){
        this.box(mesh,0.0,y,0.2,0.12,0.18,3.75,metal,{castShadow:false});
        this.box(mesh,0.0,y,-0.2,0.12,0.18,3.75,metal,{castShadow:false});
      }
      this.box(mesh,0,1.95,0.2,0.18,0.18,0.16,this.materials.amber,{castShadow:false});
    }
    const lintel=this.box(mesh,0,4.28,0,alongZ?0.6:4.8,0.12,alongZ?4.8:0.6,this.materials.amber,{castShadow:false});
    lintel.userData.doorId=link.id;
    this.scene.add(mesh);
    const door={...link,x,z,mesh,panel:mesh,indicator:lintel,open:false,collider:true};
    this.doors.push(door);
    this.interactables.push({id:link.id,type:"door",name:"BOARDED SECURITY DOOR",description:"CLEAR THE BARRICADE",price:link.cost,position:new THREE.Vector3(x,1.5,z),mesh,ref:door});
    this.addDoorCollider(door);
    this.box(this.scene,x,-0.48,z,4.25,0.12,4.25,this.materials.floor,{castShadow:false});
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

  spawnWindows(openRooms=["start"]) { return this.windows.filter(win=>openRooms.includes(win.roomId)); }

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
    const material=typeof color==="number" ? new THREE.MeshToonMaterial({color,gradientMap:toonRamp}) : color;
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
    // Room-specific furniture and practical clutter give each space a readable purpose.
    // Supply depot: steel shelving, crates and stacked cases.
    for(let side=0;side<2;side++){
      const x=side?7:-7;
      this.addProp("storage",x,-1,0.45,3.2,5.4,0x59645f,{collider:false});
      for(let y=0;y<3;y++)this.addProp("storage",x,-2+y*1.15,4.8,0.12,0.9,0x68766d,{collider:false});
    }
    // Infirmary: two beds with raised headboards and privacy screens.
    for(const x of [-5,5]){
      this.addProp("medical",x,0,2.4,0.55,4.8,0x9a9a87,{collider:false});
      this.addProp("medical",x,1.15,-1.75,2.4,0.35,0.22,0x657c75,{collider:false});
      this.addProp("medical",x,0.78,0,2.0,0.18,3.7,0xb5b6a8,{collider:false});
    }
    // Biology lab: work benches and observation tanks.
    for(const x of [-5,5]){
      this.addProp("research",x,0,2.4,1.1,3.8,0x53625d,{collider:false});
      for(let i=0;i<3;i++)this.addProp("research",x-0.6+i*0.6,0.62,-0.5,0.18,0.16,0.18,0xc1b99c,{collider:false});
    }
    // Generator hall: cable cabinets and chunky pipe runs.
    for(const z of [-5,5]){
      this.addProp("power",-7,z,1.4,3.6,1.5,0x3b4644,{collider:false});
      this.addProp("power",-7,z,1.45,0.12,1.52,0xb28a4f,{collider:false});
    }
    // Observation ward: reinforced glass cells and floor warning stripes.
    for(const x of [-6,6]){
      this.addProp("testing",x,-1,0.35,3.2,5.5,0x637b78,{collider:false});
      this.addProp("testing",x,0.68,0,0.42,0.12,5.3,0xb28d53,{collider:false});
    }
    // Reactor chamber: segmented containment pylons around the central machine.
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2, x=Math.cos(a)*5.6,z=Math.sin(a)*5.6;
      this.addProp("pap",x,z,0.85,3.6,0.85,0x596b61,{collider:false});
      this.addProp("pap",x,1.95,z,1.05,0.12,1.05,0xb2a16d,{collider:false});
    }
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

  buildHazards() {
    const glow=this.mat(0x9acb55,0.3,0,0x5d8c25);
    const stripe=this.mat(0xc49b53,0.7,0.05);
    const barrel=this.mat(0x65704a,0.85,0.1);
    for(const [roomId,x,z,radius] of [["research",-6,5,3.2],["pap",6,-5,3.4],["testing",0,5,2.8]]) {
      const room=this.rooms.get(roomId),wx=room.x+x,wz=room.z+z;
      this.radiationZones.push({roomId,x:wx,z:wz,radius});
      const pool=this.box(this.scene,wx,0.025,wz,3.2,0.045,2.4,glow,{castShadow:false});
      pool.material.transparent=true;pool.material.opacity=0.42;
      for(let i=0;i<3;i++){
        const bx=wx-1.4+i*1.4;
        this.box(this.scene,bx,0.9,wz+2.0,0.68,1.8,0.68,barrel,{castShadow:false});
        this.box(this.scene,bx,1.84,wz+2.0,0.72,0.08,0.72,stripe,{castShadow:false});
        this.box(this.scene,bx,0.95,wz+1.64,0.72,0.16,0.08,glow,{castShadow:false});
      }
      const lamp=new THREE.PointLight(0x9acb55,1.7,8,2);
      lamp.position.set(wx,1.8,wz);this.scene.add(lamp);
    }
  }

  isInRadiation(position) {
    return this.radiationZones.some(zone=>Math.hypot(position.x-zone.x,position.z-zone.z)<zone.radius);
  }

  addMachine(id,type,name,roomId,x,z,color,cost,description) {
    const room=this.rooms.get(roomId);
    const group=new THREE.Group();
    group.position.set(room.x+x,0,room.z+z);
    this.scene.add(group);
    const base=new THREE.MeshToonMaterial({color:0x17252b,gradientMap:toonRamp});
    const shell=new THREE.MeshToonMaterial({color,gradientMap:toonRamp,emissive:color,emissiveIntensity:0.12});
    if(type==="wallbuy") {
      this.box(group,0,1.7,0,2.9,2.35,0.22,this.materials.wood,{castShadow:false});
      this.box(group,0,1.7,0.13,2.65,2.12,0.06,this.materials.darkWall,{castShadow:false});
    } else {
      this.box(group,0,0.8,0,1.35,1.6,1.0,base);
      this.box(group,0,1.72,0,1.15,0.3,0.9,shell);
      this.box(group,0,1.1,0.51,0.72,0.64,0.08,shell);
      this.box(group,0,0.35,0.51,0.42,0.12,0.08,this.materials.amber);
      this.box(group,-0.58,1.1,0.52,0.08,0.72,0.06,this.materials.amber,{castShadow:false});
      this.box(group,0.58,1.1,0.52,0.08,0.72,0.06,this.materials.amber,{castShadow:false});
    }
    let light=null,rotor=null;
    if(type!=="wallbuy") {
      light=new THREE.PointLight(color,1.2,4.5);
      light.position.set(0,2,0);group.add(light);
      rotor=this.box(group,0,2.05,0,0.26,0.08,0.26,this.materials.cyan,{castShadow:false});
    }
    const obj={id,type,name,price:cost,description,position:new THREE.Vector3(room.x+x,1.3,room.z+z),mesh:group,rotor,roomId,active:false,light};
    this.interactables.push(obj);
    this.machineRefs[id]=obj;
    return obj;
  }

  addWallBuySilhouette(item,weaponId,color) {
    const chalk=this.materials.chalk;
    const board=this.materials.darkWall;
    const frame=this.materials.wood;
    // A plywood wall plaque with a hand-drawn, blocky chalk weapon profile.
    this.box(item.mesh,0,1.72,0,2.8,2.25,0.22,frame,{castShadow:false});
    this.box(item.mesh,0,1.72,0.14,2.55,2.02,0.06,board,{castShadow:false});
    const long=["shotgun","autoShotgun","sniper","launcher","tactical"].includes(weaponId);
    const width=weaponId==="launcher"?1.15:long?1.35:0.98;
    const z=0.2;
    const line=(x,y,w,h)=>this.box(item.mesh,x,y,z,w,h,0.045,chalk,{castShadow:false});
    // Chalk profile is deliberately geometric, like a hand-drawn wall-buy icon.
    line(-0.05,1.95,width,0.11);line(0.52,2.04,0.62,0.065);line(-0.62,1.95,0.22,0.16);
    line(-0.18,1.73,0.14,0.38);line(0.08,1.73,0.16,0.34);
    line(0.08,2.17,0.38,0.07);line(0.1,2.25,0.12,0.1);
    line(-0.68,2.1,0.16,0.07);
    if(weaponId==="sniper"||weaponId==="tactical"){line(-0.02,2.28,0.38,0.08);line(-0.02,2.38,0.12,0.12);}
    if(weaponId==="shotgun"||weaponId==="autoShotgun"){line(-0.12,1.56,0.12,0.15);line(0.02,1.55,0.12,0.13);}
    if(weaponId==="launcher"){line(0.02,1.96,0.82,0.28);line(0.62,1.96,0.12,0.34);}
    // Small chalk price ticks and a colour-coded weapon family strip.
    const digits=item.price.toString();
    const segments={a:[0,0.09,0.19,0.045],b:[0.095,0.045,0.045,0.16],c:[0.095,-0.14,0.045,0.16],d:[0,-0.235,0.19,0.045],e:[-0.095,-0.14,0.045,0.16],f:[-0.095,0.045,0.045,0.16],g:[0,-0.075,0.19,0.045]};
    const active={0:"abcdef",1:"bc",2:"abged",3:"abgcd",4:"fgbc",5:"afgcd",6:"afgecd",7:"abc",8:"abcdefg",9:"abfgcd"};
    const startX=-(digits.length-1)*0.28;
    [...digits].forEach((digit,index)=>{
      for(const key of active[digit]||"abcdefg"){
        const [dx,dy,sx,sy]=segments[key];
        this.box(item.mesh,startX+index*0.56+dx,0.78+dy,0.2,sx,sy,0.04,chalk,{castShadow:false});
      }
    });
    this.box(item.mesh,0,0.48,0.2,2.15,0.055,0.04,this.mat(color),{castShadow:false});
  }
  buildMachines() {
    this.addMachine("jugger","perk","JUGGERNAUT", "medical", -5,-3,0xb4473e,2500,"INCREASE MAXIMUM HEALTH");
    this.addMachine("speed","perk","SPEED COLA", "storage",5,-4,0x31b76b,2000,"FASTER RELOADS");
    this.addMachine("quick","perk","QUICK REVIVE", "testing",5,3,0x3e9fd1,1500,"FASTER RECOVERY");
    this.addMachine("double","perk","DOUBLE DAMAGE", "lab",-5,-3,0xd6a23b,3000,"INCREASE WEAPON DAMAGE");
    this.addMachine("stamina","perk","STAMIN-UP", "start",-6,5,0x8e6bd1,2000,"MOVE AND SPRINT FASTER");
    this.addMachine("deadshot","perk","DEADSHOT", "research",5,-3,0x4ab2aa,2500,"MORE CRITICAL DAMAGE");
    this.addMachine("mule","perk","MULE KICK", "power",5,-3,0xc18b48,3000,"CARRY THREE WEAPONS");
    const pap=this.addMachine("pack","pap","PACK-A-PUNCH","pap",0,0,0x28c9d2,5000,"UPGRADE YOUR HELD WEAPON");
    pap.mesh.scale.set(1.55,1.5,1.55);
    this.addMachine("power-switch","power","GENERATOR SWITCH","power",-5,3,0xffc35e,0,"RESTORE FACILITY POWER");
    const box=this.addMachine("mystery","mystery","MYSTERY CRATE","lab",5,3,0x8f5ce3,950,"RANDOM WEAPON / 950 CREDITS");
    box.mesh.scale.set(1.15,1.1,1.15);
    this.addMachine("terminal","terminal","ARCHIVE TERMINAL","research",-5,3,0x3ec9d2,0,"ACCESS CLASSIFIED FILE");
    this.addMachine("document-a","document","INCIDENT REPORT 07","start",-6,-5,0xd7ca9a,0,"COLLECT RESEARCH DOCUMENT");
    this.addMachine("document-b","document","SUBJECT R-09","testing",5,3,0xd7ca9a,0,"COLLECT RESEARCH DOCUMENT");
    this.addMachine("document-c","document","FINAL TRANSMISSION","arena",0,5,0xd7ca9a,0,"COLLECT RESEARCH DOCUMENT");
    const buys = [
      ["buy-rifle","rifle","SERVICE RIFLE","start",0,"east",0x9b9a80,1200],
      ["buy-smg","smg","COMPACT SMG","storage",-4,"east",0xb7a05d,1400],
      ["buy-shotgun","shotgun","PUMP SHOTGUN","lab",4,"west",0xc18b48,1700],
      ["buy-burst","burst","BURST RIFLE","research",-4,"west",0x8e9d8c,1900],
      ["buy-sniper","sniper","TACTICAL DMR","testing",0,"west",0x9a9c90,2400],
      ["buy-launcher","launcher","GRENADE LAUNCHER","pap",-4,"east",0x8eab77,3200],
      ["buy-revolver","revolver","HEAVY REVOLVER","medical",0,"east",0x9c8167,1800],
      ["buy-tactical","tactical","TACTICAL CARBINE","storage",4,"east",0x758b7c,2300],
      ["buy-heavy-smg","heavySmg","DRUM SMG","power",4,"west",0xb09156,2000],
      ["buy-auto-shotgun","autoShotgun","BREACH AUTO SHOTGUN","arena",6,"north",0x9d644b,2600]
    ];
    for(const [id,weapon,name,roomId,offset,side,color,cost] of buys) {
      const room=this.rooms.get(roomId);
      const item=this.addMachine(id,"wallbuy",name,roomId,0,0,color,cost,"PURCHASE "+name);
      item.weapon=weapon;
      const mount={
        north:{x:room.x+offset,z:room.z-8.35,rotation:0},
        south:{x:room.x+offset,z:room.z+8.35,rotation:Math.PI},
        east:{x:room.x+8.35,z:room.z+offset,rotation:-Math.PI/2},
        west:{x:room.x-8.35,z:room.z+offset,rotation:Math.PI/2}
      }[side];
      item.mesh.position.set(mount.x,0,mount.z);
      item.mesh.rotation.y=mount.rotation;
      item.position.set(mount.x,1.3,mount.z);
      this.addWallBuySilhouette(item,weapon,color);
      item.mesh.scale.set(0.9,0.9,0.9);
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
    const grid=new THREE.GridHelper(220,55,0x333c36,0x242d29);
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