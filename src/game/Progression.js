import { WEAPON_DATA } from "./Weapons.js";

const PERKS = {
  jugger:{name:"JUGGERNAUT",effect:"Maximum health increased to 150.",max:150},
  speed:{name:"SPEED COLA",effect:"Reloads are 45% faster."},
  quick:{name:"QUICK REVIVE",effect:"One emergency recovery per run."},
  double:{name:"DOUBLE DAMAGE",effect:"All weapon damage increased by 65%."},
  stamina:{name:"STAMIN-UP",effect:"Movement and sprint speed increased."},
  deadshot:{name:"DEADSHOT",effect:"Critical hits deal much more damage."},
  mule:{name:"MULE KICK",effect:"Carry a third weapon."}
};

export class ProgressionSystem {
  constructor(world,weapons,player,audio,save,onNotify,onObjective,onMission) {
    this.world=world;
    this.weapons=weapons;
    this.player=player;
    this.audio=audio;
    this.save=save;
    this.onNotify=onNotify;
    this.onObjective=onObjective;
    this.onMission=onMission;
    this.points=500;
    this.totalEarned=500;
    this.perks=new Set();
    this.maxPerks=4;
    this.powerOn=false;
    this.quickUsed=false;
    this.secretUnlocked=false;
    this.mysteryReveal=null;
    this.roundsSurvived=0;
    this.documentsCollected=new Set((this.save?.data?.documents||[]).filter(id=>["document-a","document-b","document-c"].includes(id)));
    this.terminalRead=false;
    this.packUsed=false;
    this.finalBossKilled=false;
    this.missionStage=0;
  }

  earn(amount,critical=false) {
    const value=Math.max(0,Math.round(amount));
    this.points+=value;
    this.totalEarned+=value;
    if(value>0) this.onNotify?.("+"+value+" CREDITS",critical?"HEADSHOT CONFIRMED":"ELIMINATION");
  }

  spend(amount) {
    if(this.points<amount) {
      this.onNotify?.("INSUFFICIENT CREDITS","You need "+(amount-this.points)+" more.");
      return false;
    }
    this.points-=amount;
    this.audio?.play("buy");
    return true;
  }

  interact(item) {
    if(!item) return false;
    if(item.type==="door") return this.buyDoor(item);
    if(item.type==="wallbuy") return this.buyWallWeapon(item);
    if(item.type==="perk") return this.buyPerk(item);
    if(item.type==="power") return this.activatePower(item);
    if(item.type==="pap") return this.packWeapon(item);
    if(item.type==="mystery") return this.openMysteryBox(item);
    if(item.type==="document") return this.collectDocument(item);
    if(item.type==="terminal") return this.readTerminal(item);
    return false;
  }

  buyDoor(item) {
    if(item.ref.open) {
      this.onNotify?.("BULKHEAD OPEN","The route is clear.");
      return true;
    }
    if(!this.spend(item.price)) return false;
    this.world.openDoor(item.id);
    const door=this.world.doors.find(d=>d.id===item.id);
    this.onNotify?.("AREA UNLOCKED",this.world.rooms.get(door.b)?.name||"ACCESS GRANTED");
    this.onObjective?.("EXPLORE THE NEWLY OPENED AREA");
    return true;
  }

  buyWallWeapon(item) {
    if(!this.spend(item.price)) return false;
    const result=this.weapons.purchase(item.weapon,this.perks);
    this.onNotify?.(result.kind==="ammo"?"AMMUNITION RESTOCKED":WEAPON_DATA[item.weapon].name+" ACQUIRED",result.kind==="ammo"?"Magazine and reserve refilled":"Weapon added to your loadout");
    return true;
  }

  buyPerk(item) {
    if(!this.powerOn) {
      this.onNotify?.("POWER REQUIRED","Restore facility power first.");
      return false;
    }
    if(this.perks.has(item.id)) {
      this.onNotify?.("ALREADY ACTIVE",PERKS[item.id].effect);
      return false;
    }
    // Mule Kick is allowed to be the fifth perk; it then raises the active-perk cap to five.
    const capacity=(this.perks.has("mule")||item.id==="mule")?5:4;
    if(this.perks.size>=capacity) {
      this.onNotify?.("PERK LIMIT REACHED","You can carry "+capacity+" active perks.");
      return false;
    }
    if(!this.spend(item.price)) return false;
    this.perks.add(item.id);
    item.active=true;
    if(item.id==="jugger") this.player.setMaxHealth(150);
    if(item.id==="quick") this.player.heal(60);
    this.onNotify?.(PERKS[item.id].name+" ACQUIRED",PERKS[item.id].effect);
    return true;
  }

  activatePower(item) {
    if(this.powerOn) {
      this.onNotify?.("POWER ONLINE","All facility systems operational.");
      return true;
    }
    this.powerOn=true;
    this.world.powerOn=true;
    item.active=true;
    const machine=this.world.machineRefs;
    for(const [id,obj] of Object.entries(machine)) {
      if(id!=="power-switch") {
        obj.active=true;
        obj.mesh.traverse(child=>{ if(child.isPointLight) child.intensity=3.8; });
      }
    }
    this.audio?.play("power");
    this.onNotify?.("GENERATOR ONLINE","Emergency lighting restored. The facility is waking up.");
    this.updateMission();
    this.audio?.play("round");
    return true;
  }

  packWeapon(item) {
    if(!this.powerOn) {
      this.onNotify?.("POWER REQUIRED","The reactor must be online.");
      return false;
    }
    const gun=this.weapons.current;
    if(!gun) return false;
    if(gun.upgraded) {
      this.onNotify?.("WEAPON ALREADY UPGRADED","This weapon is running MK-II hardware.");
      return false;
    }
    if(!this.spend(item.price)) return false;
    this.weapons.upgradeCurrent();
    this.audio?.play("power");
    this.packUsed=true;
    this.onNotify?.("PACK-A-PUNCH COMPLETE",this.weapons.current.name+" / MK-II");
    this.updateMission();
    return true;
  }

  openMysteryBox(item) {
    if(!this.spend(item.price)) return false;
    const pool=[
      ["revolver",16],["rifle",16],["smg",15],["heavySmg",10],["shotgun",10],["autoShotgun",8],["burst",9],["tactical",8],["sniper",4],["launcher",2],["experimental",2]
    ];
    const roll=Math.random()*100;
    let acc=0, selected="rifle";
    for(const [id,chance] of pool) { acc+=chance; if(roll<=acc) {selected=id;break;} }
    const result=this.weapons.purchase(selected,this.perks);
    const rarity=selected==="experimental"?"EXPERIMENTAL":["launcher","sniper","tactical"].includes(selected)?"RARE":"STANDARD";
    item.active=true;
    this.onNotify?.("MYSTERY CRATE / "+rarity,WEAPON_DATA[selected].name+" — "+(result.kind==="ammo"?"AMMO REFILL":"WEAPON ACQUIRED"));
    setTimeout(()=>{item.active=false;},1200);
    return true;
  }

  collectDocument(item) {
    if(this.save.discover(item.id)) {
      this.documentsCollected.add(item.id);
      item.active=true;
      this.onNotify?.("CLASSIFIED FILE RECOVERED",this.documentText(item.id));
      this.updateMission();
      return true;
    }
    this.onNotify?.("FILE ALREADY RECOVERED","This document is already in your field notes.");
    return false;
  }

  documentText(id) {
    if(id==="document-a") return "INCIDENT 07 / 03:17. Isolation on Sublevel C failed after the night crew reported a low-frequency signal in the ventilation system. Subject R-09 breached the observation glass without touching it. Security was ordered to seal the floor.";
    if(id==="document-b") return "SUBJECT R-09 / POST-MORTEM REVIEW. Cardiac activity stopped, but the subject continued to respond to the signal. The response became stronger when the reactor was powered. The project director ordered all recordings classified.";
    return "FINAL TRANSMISSION / DR. VALE. Northstar did not create the signal. We amplified it. Something below the reactor has been answering for months. If this reaches the surface, do not restore the uplink."
  }

  readTerminal() {
    if(!this.powerOn) {
      this.onNotify?.("TERMINAL OFFLINE","Restore power in the control room.");
      return false;
    }
    if(this.documentsCollected.size<3) {
      this.onNotify?.("ARCHIVE LOCKED","Recover all three Project Lantern files before accessing the full incident record.");
      return false;
    }
    this.terminalRead=true;
    this.onNotify?.("NORTHSTAR ARCHIVE","PROJECT LANTERN / SIGNAL ORIGIN: BELOW THE REACTOR");
    this.updateMission();
    return true;
  }

  tryQuickRevive() {
    if(!this.perks.has("quick") || this.quickUsed) return false;
    this.quickUsed=true;
    this.perks.delete("quick");
    const machine=this.world.machineRefs.quick;
    if(machine) machine.active=false;
    this.player.health=Math.max(45,Math.round(this.player.maxHealth*0.42));
    this.onNotify?.("QUICK REVIVE","Emergency dose administered. This perk has been consumed.");
    return true;
  }

  onRoundComplete(round) {
    this.roundsSurvived=Math.max(this.roundsSurvived,round);
    this.updateMission();
  }

  onBossDefeated(type) {
    if(type==="experiment"||type==="overseer") {
      this.finalBossKilled=true;
      this.updateMission();
    }
  }

  refreshMission() { this.updateMission(true); }

  updateMission(initial=false) {
    const steps=[
      {title:"HOLD THE CHECKPOINT",objective:"SURVIVE 3 WAVES"},
      {title:"BRING THE FACILITY ONLINE",objective:"FIND THE GENERATOR SWITCH"},
      {title:"RECOVER PROJECT LANTERN FILES",objective:"COLLECT ALL 3 CLASSIFIED RECORDS"},
      {title:"TRACE THE SIGNAL",objective:"ACCESS THE ARCHIVE TERMINAL"},
      {title:"ARM THE REACTOR",objective:"REACH THE REACTOR CHAMBER"},
      {title:"SILENCE THE SOURCE",objective:"DEFEAT THE EXPERIMENT"},
      {title:"OPERATION COMPLETE",objective:"THE SIGNAL HAS FALLEN SILENT"}
    ];
    const checks=[
      this.roundsSurvived>=3,
      this.powerOn,
      this.documentsCollected.size>=3,
      this.terminalRead,
      this.packUsed,
      this.finalBossKilled
    ];
    let next=this.missionStage;
    while(next<checks.length&&checks[next])next++;
    if(next>this.missionStage&&!initial) {
      for(let stage=this.missionStage;stage<next;stage++) {
        const completed=steps[stage];
        this.onNotify?.("MISSION COMPLETE / "+String(stage+1).padStart(2,"0"),completed.title);
      }
    }
    this.missionStage=next;
    const current=steps[Math.min(next,steps.length-1)];
    this.onMission?.(Math.min(next+1,steps.length),steps.length,current.title);
    this.onObjective?.(current.objective);
  }

  applyRoundBonus(round) {
    const bonus=round*30;
    this.earn(bonus);
    if(round%5===0) this.onNotify?.("SUPPLY BONUS","+"+bonus+" credits for surviving round "+round);
  }
}