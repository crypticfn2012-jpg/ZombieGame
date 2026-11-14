import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ProgressionSystem } from "../src/game/Progression.js";
import { WeaponSystem } from "../src/game/Weapons.js";
import { ZombieDirector } from "../src/game/Zombies.js";
import { FacilityWorld } from "../src/game/World.js";

const quietAudio={play(){}};

function makeProgression() {
  const world={machineRefs:{},doors:[],rooms:new Map(),openDoor(){}};
  const weapons={current:{id:"pistol",upgraded:false},purchase(){return {ok:true,kind:"weapon"}},upgradeCurrent(){this.current.upgraded=true;return true}};
  const player={setMaxHealth(){},heal(){},addArmor(){}};
  const save={discover(){return true}};
  return new ProgressionSystem(world,weapons,player,quietAudio,save,()=>{},()=>{});
}

test("Mule Kick can be purchased as the fifth perk and unlocks the five-perk cap",()=>{
  const progression=makeProgression();
  progression.powerOn=true;
  progression.points=10000;
  progression.perks=new Set(["jugger","speed","double","stamina"]);
  assert.equal(progression.buyPerk({id:"mule",price:1000}),true);
  assert.equal(progression.perks.has("mule"),true);
  assert.equal(progression.perks.size,5);
  assert.equal(progression.buyPerk({id:"quick",price:1000}),false);
});

test("shotgun pellet count creates multiple hit checks for one shell",()=>{
  const camera=new THREE.PerspectiveCamera(75,1,0.1,100);
  camera.position.set(0,1.7,0);
  camera.lookAt(0,1.7,-1);
  camera.updateMatrixWorld(true);
  const weapons=new WeaponSystem(camera,quietAudio);
  weapons.addWeapon("shotgun");
  const hitDamage=[];
  const zombies={damageRay(_origin,_direction,_range,damage){hitDamage.push(damage);return null;},damageArea(){}};
  weapons.setTrigger(true);
  weapons.fire(zombies,new Set(),1/60,0);
  assert.equal(hitDamage.length,9);
  assert.equal(weapons.current.ammo,7);
});

test("Pack-a-Punch applies one 1.5x damage multiplier, not a double multiplier",()=>{
  const camera=new THREE.PerspectiveCamera(75,1,0.1,100);
  camera.position.set(0,1.7,0);
  camera.lookAt(0,1.7,-1);
  camera.updateMatrixWorld(true);
  const weapons=new WeaponSystem(camera,quietAudio);
  const baseDamage=weapons.current.baseDamage;
  assert.equal(weapons.upgradeCurrent(),true);
  assert.equal(weapons.current.damage,baseDamage);
  const hitDamage=[];
  const zombies={damageRay(_origin,_direction,_range,damage){hitDamage.push(damage);return null;},damageArea(){}};
  weapons.setTrigger(true);
  weapons.fire(zombies,new Set(),1/60,0);
  assert.equal(hitDamage[0],Math.round(baseDamage*1.5));
});


test("loadout supports a pistol plus three firearm slots and a separate knife",()=>{
  const camera=new THREE.PerspectiveCamera(75,1,0.1,100);
  camera.position.set(0,1.7,0);
  camera.lookAt(0,1.7,-1);
  camera.updateMatrixWorld(true);
  const weapons=new WeaponSystem(camera,quietAudio);
  weapons.addWeapon("rifle");
  weapons.addWeapon("shotgun");
  assert.equal(weapons.inventory.length,3);
  assert.deepEqual(weapons.hud().slots.map(item=>item.slot),[1,2,3]);
  weapons.equipKnife();
  assert.equal(weapons.hud().melee,true);
  assert.equal(weapons.model.visible,false);
  assert.equal(weapons.knifeModel.visible,true);
  let damage=0;
  assert.equal(weapons.meleeAttack({damageRay(_origin,_direction,_range,amount){damage=amount;return null;}}),true);
  assert.equal(damage,115);
  assert.equal(weapons.meleeAttack({damageRay(){return null;}}),false);
  weapons.equipKnife();
  assert.equal(weapons.hud().melee,false);
});


test("shots register against the zombie body at normal first-person crosshair height",()=>{
  const scene=new THREE.Scene();
  const director=new ZombieDirector(scene,quietAudio,()=>{},()=>{},()=>{},()=>{});
  const zombie=director.spawn("standard",{x:0,z:-5},"start",1);
  const hit=director.damageRay(new THREE.Vector3(0,1.7,0),new THREE.Vector3(0,0,-1),60,34,false);
  assert.ok(hit);
  assert.equal(hit.zombie,zombie);
  assert.equal(hit.damage,56);
  assert.equal(hit.headshot,true);
  assert.equal(zombie.hp,39);
  assert.ok(zombie.hurt>0);
  assert.ok(zombie.flashMaterials.length>0);
});


test("facility map exposes an exterior zombie entry window for every room",()=>{
  const scene=new THREE.Scene();
  const world=new FacilityWorld(scene);
  assert.equal(world.windows.length,9);
  for(const win of world.windows) {
    assert.ok(Math.hypot(win.outside.x-win.x,win.outside.z-win.z)>7);
    assert.ok(Math.hypot(win.inside.x-win.x,win.inside.z-win.z)>1);
    assert.ok(world.rooms.has(win.roomId));
  }
});

test("zombies spawned at a window begin outside and enter through the authored window",()=>{
  const scene=new THREE.Scene();
  const world=new FacilityWorld(scene);
  const director=new ZombieDirector(scene,quietAudio,()=>{},()=>{},()=>{},()=>{});
  const win=world.windows[0];
  const zombie=director.spawn("standard",win.outside,win.roomId,1,win);
  assert.equal(zombie.entryState,"approach");
  assert.equal(zombie.group.position.x,win.outside.x);
  assert.equal(zombie.group.position.z,win.outside.z);
  assert.equal(zombie.entryWindow,win);
});


test("facility art kit builds textured walls, timber doors, chalk wall buys and separated perk rooms",()=>{
  const scene=new THREE.Scene();
  const world=new FacilityWorld(scene);
  assert.ok(world.materials.wall.map);
  assert.ok(world.materials.floor.map);
  assert.ok(world.materials.wood.map);
  assert.equal(world.doors.length,10);
  assert.ok(world.doors.every(door=>door.mesh.children.length>12));
  const wallBuys=world.interactables.filter(item=>item.type==="wallbuy");
  assert.equal(wallBuys.length,10);
  assert.ok(wallBuys.every(item=>item.mesh.children.filter(child=>child.isMesh).length>=4));
  const perkRooms=new Set(world.interactables.filter(item=>item.type==="perk").map(item=>item.roomId));
  assert.equal(perkRooms.size,7);
});

test("irradiated zones are present and irradiated infected have radiation traits",()=>{
  const scene=new THREE.Scene();
  const world=new FacilityWorld(scene);
  assert.equal(world.radiationZones.length,3);
  const zone=world.radiationZones[0];
  assert.equal(world.isInRadiation({x:zone.x,z:zone.z}),true);
  assert.equal(world.isInRadiation({x:500,z:500}),false);
  const director=new ZombieDirector(scene,quietAudio,()=>{},()=>{},()=>{},()=>{});
  const infected=director.makeZombie("irradiated");
  assert.equal(infected.data.radiation,true);
  assert.equal(infected.data.name,"IRRADIATED");
});

test("Operation Lantern advances through its six mission requirements",()=>{
  const progression=makeProgression();
  progression.roundsSurvived=3;
  progression.updateMission();
  assert.equal(progression.missionStage,1);
  progression.powerOn=true;
  progression.updateMission();
  assert.equal(progression.missionStage,2);
  progression.documentsCollected=new Set(["document-a","document-b","document-c"]);
  progression.updateMission();
  assert.equal(progression.missionStage,3);
  progression.terminalRead=true;
  progression.updateMission();
  assert.equal(progression.missionStage,4);
  progression.packUsed=true;
  progression.updateMission();
  assert.equal(progression.missionStage,5);
  progression.finalBossKilled=true;
  progression.updateMission();
  assert.equal(progression.missionStage,6);
});
