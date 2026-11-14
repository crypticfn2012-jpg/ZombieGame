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
  constructor(world,weapons,player,audio,save,onNotify,onObjective) {
    this.world=world;
    this.weapons=weapons;
    this.player=player;
    this.audio=audio;
    this.save=save;
    this.onNotify=onNotify;
    this.onObjective=onObjective;
    this.points=500;
    this.totalEarned=500;
    this.perks=new Set();
    this.maxPerks=4;
    this.powerOn=false;
    this.quickUsed=false;
    this.secretUnlocked=false;
    this.mysteryReveal=null;
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
    const capacity=this.perks.has("mule")?5:4;
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
    this.onNotify?.("FACILITY POWER RESTORED","Perk machines and the reactor vault are now online.");
    this.onObjective?.("ACTIVATE PACK-A-PUNCH IN THE REACTOR VAULT");
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
    this.onNotify?.("PACK-A-PUNCH COMPLETE",this.weapons.current.name+" / MK-II");
    return true;
  }

  openMysteryBox(item) {
    if(!this.spend(item.price)) return false;
    const pool=[
      ["revolver",22],["rifle",19],["smg",18],["shotgun",15],["burst",12],["sniper",7],["launcher",5],["experimental",2]
    ];
    const roll=Math.random()*100;
    let acc=0, selected="rifle";
    for(const [id,chance] of pool) { acc+=chance; if(roll<=acc) {selected=id;break;} }
    const result=this.weapons.purchase(selected,this.perks);
    const rarity=selected==="experimental"?"EXPERIMENTAL":selected==="launcher"||selected==="sniper"?"RARE":"STANDARD";
    item.active=true;
    this.onNotify?.("MYSTERY CRATE / "+rarity,WEAPON_DATA[selected].name+" — "+(result.kind==="ammo"?"AMMO REFILL":"WEAPON ACQUIRED"));
    setTimeout(()=>{item.active=false;},1200);
    return true;
  }

  collectDocument(item) {
    if(this.save.discover(item.id)) {
      item.active=true;
      this.onNotify?.("CLASSIFIED FILE RECOVERED",this.documentText(item.id));
      this.onObjective?.("SURVIVE. THE FACILITY LOGS MAY EXPLAIN THE OUTBREAK.");
      return true;
    }
    this.onNotify?.("FILE ALREADY RECOVERED","This document is already in your field notes.");
    return false;
  }

  documentText(id) {
    if(id==="document-a") return "INCIDENT 07: Subject R-09 breached isolation at 03:17.";
    if(id==="document-b") return "SUBJECT R-09: Neural activity continues after cardiac failure.";
    return "FINAL TRANSMISSION: The signal is not coming from outside. It is beneath us.";
  }

  readTerminal() {
    if(!this.powerOn) {
      this.onNotify?.("TERMINAL OFFLINE","Restore power in the control room.");
      return false;
    }
    this.onNotify?.("NORTHSTAR ARCHIVE", "PROJECT LANTERN / TRANSMISSION ORIGIN: REACTOR VAULT");
    this.onObjective?.("REACH THE CONTAINMENT ARENA");
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

  applyRoundBonus(round) {
    const bonus=round*30;
    this.earn(bonus);
    if(round%5===0) this.onNotify?.("SUPPLY BONUS","+"+bonus+" credits for surviving round "+round);
  }
}