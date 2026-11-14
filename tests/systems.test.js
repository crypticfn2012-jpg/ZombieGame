import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ProgressionSystem } from "../src/game/Progression.js";
import { WeaponSystem } from "../src/game/Weapons.js";

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
