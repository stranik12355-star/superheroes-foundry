/* СУПЕРГЕРОИ — Foundry VTT 12 */
const SH_DEFAULTS = {
  rank: 1, karma: 1,
  health: { value: 10, bonus: 0, max: 10, reduction: 0 },
  focus: { value: 10, bonus: 0, max: 10, reduction: 0 },
  initiative: { bonus: 0 },
  speed: { running: 0, climbing: 0, swimming: 0, jumping: 0, flying: 0 },
  biography: { name:"", nickname:"", age:"", gender:"", height:"", weight:"", eyes:"", hair:"", history:"", notes:"" },
  stats: {
    strength:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    agility:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    endurance:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    vigilance:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    ego:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    logic:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0}
  },
  powers: [], traits: [], gear: [], gearFolders: [],
  tokenGallery: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
};

const clone = o => foundry.utils.deepClone(o);

function mergeDefaults(source={}) {
  const d = clone(SH_DEFAULTS);
  foundry.utils.mergeObject(d, source, {inplace: true, recursive: true});
  
  for(const key of Object.keys(d.stats)){
    d.stats[key].value = Number.isFinite(Number(d.stats[key].value)) ? Number(d.stats[key].value) : 10;
    for(const p of ["defense","nonCombat","hit","multiplier","stable"])
      d.stats[key][p] = Number.isFinite(Number(d.stats[key][p])) ? Number(d.stats[key][p]) : 0;
  }
  for(const p of ["running","climbing","swimming","jumping","flying"])
    d.speed[p] = Number.isFinite(Number(d.speed[p])) ? Number(d.speed[p]) : 0;
  
  d.rank = Math.min(5, Math.max(1, Number(d.rank) || 1));
  d.karma = Number.isFinite(Number(d.karma)) ? Math.max(0, Number(d.karma)) : d.rank;
  
  for(const p of ["health","focus"]){
    d[p].value = Number.isFinite(Number(d[p].value)) ? Math.max(0, Number(d[p].value)) : 10;
    d[p].bonus = Number.isFinite(Number(d[p].bonus)) ? Number(d[p].bonus) : 0;
    d[p].reduction = Number.isFinite(Number(d[p].reduction)) ? Number(d[p].reduction) : 0;
  }
  d.initiative.bonus = Number.isFinite(Number(d.initiative.bonus)) ? Number(d.initiative.bonus) : 0;
  
  ["powers", "traits", "gear"].forEach(type => {
    d[type].forEach((item, index) => {
      if (!item.id) item.id = foundry.utils.randomID();
      item.sort = item.sort ?? index;
    });
  });

  return d;
}

function statMod(value) { return Number(value) - 10; }

function resourceMax(value, bonus=0) {
  const n = Number(value);
  const base = n <= 10 ? 10 : 30 * (n - 10);
  return Math.max(10, base + Number(bonus || 0));
}

function statDerived(actor, key) {
  const system = mergeDefaults(actor.system), s = system.stats[key], mod = statMod(s.value);
  const ncMod = (s.value + s.nonCombat) - 10;
  const hitMod = mod + s.hit;

  let berserkDefMod = 0;
  const traits = actor.system?.traits || [];
  const isBerserk = traits.find(t => t.name === "Берсерк" && t.active);
  if (isBerserk) {
    if (["strength", "endurance", "ego"].includes(key)) berserkDefMod = 2;
    if (key === "agility") berserkDefMod = -2;
  }

  return {
    value: s.value,
    mod: mod,
    defense: s.value + s.defense + berserkDefMod,
    nonCombat: s.value + s.nonCombat,
    nonCombatLabel: ncMod > 0 ? "+" + ncMod : ncMod,
    hit: hitMod,
    hitLabel: hitMod > 0 ? "+" + hitMod : hitMod,
    stable: mod + s.stable,
    multiplier: Number(system.rank) + s.multiplier
  };
}

function speedDerived(actor) {
  const s = mergeDefaults(actor.system), a = Number(s.stats.agility.value);
  const agilityBonus = a >= 10 ? Math.floor((a - 10) / 5) : 0;
  return {
    running: 5 + agilityBonus + s.speed.running,
    climbing: 3 + s.speed.climbing,
    swimming: 3 + s.speed.swimming,
    jumping: 3 + s.speed.jumping,
    flying: 0 + s.speed.flying
  };
}

class SuperheroesDie extends foundry.dice.terms.Die {
  static DENOMINATION = "s";
  constructor(termData={}) { super({...termData, faces:6}); }
  getResultCSS(result){
    const css=["superheroes-roll","die","d6"];
    if(result.result===1) css.push("fantastic");
    else if(result.result===6) css.push("max");
    if(result.discarded) css.push("discarded");
    return css;
  }
  getResultLabel(result){ return result.result===1 ? "★" : String(result.result); }
  roll({minimize=false,maximize=false}={}){
    const result=super.roll({minimize,maximize});
    if(result.result===1) this.results[this.results.length-1].count=6;
    return result;
  }
  get total(){ const total=super.total; return total===1?6:total; }
}

class SuperheroesRoll extends Roll {
  constructor(formula,data,options={}){
    super(formula,data,options);
    if(!this.options.configured) this.configureModifiers();
  }
  static fromRoll(roll){
    const r=new this(roll.formula,roll.data,roll.options); Object.assign(r,roll); return r;
  }
  get valid3d6(){
    return this.dice.length===3 && this.terms[0] instanceof foundry.dice.terms.PoolTerm &&
      this.terms[0].rolls?.length===3 && this.terms[0].rolls[1]?.terms?.[0] instanceof SuperheroesDie;
  }
  get isFantastic(){
    if(!this._evaluated) return undefined;
    const die=this.dice?.[1];
    return die instanceof SuperheroesDie && die.results?.some(r=>r.active && r.result===1);
  }
  configureModifiers(){
    if(!this.valid3d6) return;
    this.options.configured=true;
  }
  async toMessage(messageData={},options={}){
    if(!this._evaluated) await this.evaluate();
    messageData.flavor = messageData.flavor || "";
    options.rollMode = options.rollMode ?? this.options.rollMode;
    return super.toMessage(messageData,options);
  }
  static CHAT_TEMPLATE="systems/superheroes/templates/dice/roll.hbs";
  static TOOLTIP_TEMPLATE="systems/superheroes/templates/chat/roll-breakdown.hbs";
}

function getPool(roll){
  const first=roll?.terms?.[0];
  if(first instanceof foundry.dice.terms.PoolTerm) return first;
  if(first instanceof foundry.dice.terms.ParentheticalTerm && first.roll?.terms?.[0] instanceof foundry.dice.terms.PoolTerm) return first.roll.terms[0];
  return null;
}

function isSuperheroesRoll(roll){
  const pool=getPool(roll);
  return !!(pool?.rolls?.length===3 && pool.rolls[1]?.terms?.[0] instanceof SuperheroesDie);
}

async function make3d6Roll(actor, formula, flavor, flags={}){
  const roll = new SuperheroesRoll(formula, actor.getRollData());
  roll.options.flavor = flavor;
  await roll.evaluate();
  
  const msg = await roll.toMessage({
    speaker: ChatMessage.getSpeaker({actor}),
    flags: { superheroes: { ...flags, threeD6: true } }
  });

  if (flags.kind === "initiative") {
    let combat = game.combat;
    if (!combat) {
      combat = await Combat.create({ scene: canvas.scene?.id, active: true });
    }
    let combatant = combat.combatants.find(c => c.actorId === actor.id);
    const finalInit = roll._total === 1 ? 6 : roll._total; 
    
    if (!combatant) {
      const activeTokens = actor.getActiveTokens();
      const tokenDoc = activeTokens.length > 0 ? activeTokens[0].document : null;
      const combatantData = { actorId: actor.id, initiative: finalInit };
      if (tokenDoc) {
        combatantData.tokenId = tokenDoc.id;
        combatantData.sceneId = tokenDoc.parent.id;
      }
      await combat.createEmbeddedDocuments("Combatant", [combatantData]);
    } else {
      await combat.updateEmbeddedDocuments("Combatant", [{ _id: combatant.id, initiative: finalInit }]);
    }
  }
  return msg;
}

async function createCheckRoll(actor,key,label){
  const s=statDerived(actor,key);
  return make3d6Roll(actor,`{1d6,1ds,1d6} + ${s.mod}`,label,{kind:"check",statKey:key,modifier:s.mod});
}

async function createNonCombatRoll(actor,key){
  const s=statDerived(actor,key);
  return make3d6Roll(actor,`{1d6,1ds,1d6} + ${s.nonCombat-10}`,game.i18n.localize("SUPERHEROES.Stat."+key)+" — Вне боя",{kind:"nonCombat",statKey:key,modifier:s.nonCombat-10});
}

async function createAttackRoll(actor,key){
  const s=statDerived(actor,key), rankMult=Math.max(1,Number(s.multiplier));
  return make3d6Roll(actor,`{1d6,1ds,1d6} + ${s.hit}`,"Атака — "+game.i18n.localize("SUPERHEROES.Stat."+key),{kind:"attack",statKey:key,modifier:s.hit,damageMultiplier:rankMult,stable:s.stable,ability:s.value-10});
}

async function createInitiativeRoll(actor){
  const s=mergeDefaults(actor.system);
  const modifier=statMod(s.stats.vigilance.value)+Number(s.initiative.bonus||0);
  return make3d6Roll(actor,`{1d6,1ds,1d6} + ${modifier}`,"Инициатива",{kind:"initiative",modifier});
}

async function executeMacro(actorId, statKey, rollType) {
  const actor = game.actors.get(actorId);
  if (!actor) return ui.notifications.warn("Персонаж не найден на сцене!");
  if (rollType === "attack") return createAttackRoll(actor, statKey);
  if (rollType === "noncombat") return createNonCombatRoll(actor, statKey);
}

function activeResult(die){return [...(die.results||[])].reverse().find(r=>r.active) || die.results?.at(-1);}
function effectiveDieResult(die){const r=activeResult(die); return die instanceof SuperheroesDie && r?.result===1 ? 6 : Number(r?.result||0);}

async function rerollSuperheroesDie(messageId,dieIndex,mode){
  const chatMessage=game.messages.get(messageId);
  const roll=chatMessage?.rolls?.[0];
  if(!chatMessage||!roll||!isSuperheroesRoll(roll)) throw new Error("Это не бросок 3d6 системы Супергерои");
  const pool=getPool(roll), modifier=mode==="edge"?"kh":"kl";
  const targetRoll=pool.rolls[dieIndex], targetDie=targetRoll.terms[0];
  const isMiddle=targetDie instanceof SuperheroesDie;
  const formulaReg=/(?<number>\d+)d(?<dieType>\d|s).*/;
  const formulaGroups=formulaReg.exec(targetRoll._formula)?.groups;
  if(!formulaGroups) throw new Error("Не удалось определить выбранную кость");
  targetDie.number=2;
  const targetFormula=`${targetDie.number}d${formulaGroups.dieType}`;
  targetRoll._formula=`${targetFormula}${modifier}`;
  pool.terms[dieIndex]=targetRoll._formula;
  targetDie.modifiers=[modifier];
  const oldRollResult=activeResult(targetDie);
  if(!oldRollResult) throw new Error("У выбранной кости нет результата");
  const oldResult=isMiddle&&oldRollResult.result===1?6:oldRollResult.result;
  
  const newRoll=new SuperheroesRoll(targetRoll._formula,{...targetRoll.data});
  await newRoll.evaluate(); 
  const newRollResult=newRoll.terms[0].results[0];
  const newFantastic=isMiddle&&newRollResult.result===1;
  const newResult=newFantastic?6:newRollResult.result;
  
  const setActive=(result,active)=>{result.active=active; result.discarded=!active;};
  if(modifier==="kh"){
    if(newFantastic||newResult>=oldResult){setActive(oldRollResult,false);setActive(newRollResult,true);}
    else setActive(newRollResult,false);
  } else {
    if(newFantastic){setActive(newRollResult,false);setActive(oldRollResult,true);}
    else if(newResult<=oldResult){setActive(oldRollResult,false);setActive(newRollResult,true);}
    else {setActive(newRollResult,false);setActive(oldRollResult,true);}
  }
  targetDie.results.push(newRollResult);
  
  const re=/(\(?{)(\dd6),(\dds),(\dd6)(}.*)/;
  let replacedFormula;
  switch(dieIndex){
    case 0: replacedFormula=roll.formula.replace(re,`$1${targetDie.number}d6${modifier},$3,$4$5`); break;
    case 1: replacedFormula=roll.formula.replace(re,`$1$2,${targetDie.number}ds${modifier},$4$5`); break;
    case 2: replacedFormula=roll.formula.replace(re,`$1$2,$3,${targetDie.number}d6${modifier}$5`); break;
  }
  roll._formula=replacedFormula;
  
  if(newRollResult.active) roll._total = roll.total - oldResult + newResult;
  const exactFinalTotal = roll._total;

  const isInitiative = chatMessage.flags?.superheroes?.kind === "initiative";
  const actorId = chatMessage.speaker?.actor;
  const tokenId = chatMessage.speaker?.token;

  const update=await roll.toMessage({flavor:chatMessage.flavor?.content||chatMessage.flavor||"Бросок"},{create:false});
  const merged=foundry.utils.mergeObject(chatMessage.toJSON(),update);
  await chatMessage.update(merged);
  
  if(game.dice3d?.showForRoll){try{await game.dice3d.showForRoll(newRoll,game.user,true);}catch(err){console.warn("Супергерои | Dice3D",err);}}
  
  if (isInitiative && game.combat) {
    const combatant = game.combat.combatants.find(c => 
      (tokenId && c.tokenId === tokenId) || c.actorId === actorId
    );
    if (combatant) {
      await game.combat.updateEmbeddedDocuments("Combatant", [{ _id: combatant.id, initiative: exactFinalTotal }]);
    }
  }
  return roll;
}

// ===== СЕКРЕТНОЕ И КРАСИВОЕ РАЗРЕШЕНИЕ АТАКИ С УКАЗАНИЕМ ЗАЩИТЫ =====
async function resolveAttack(messageId, htmlRoot) {
  const message = game.messages.get(messageId);
  if (!message) return;
  
  const targets = Array.from(game.user.targets);
  if (targets.length === 0) return ui.notifications.warn("Сначала выберите цель (наведите на врага и нажмите T)!");
  
  const defenseKey = htmlRoot.querySelector(".res-defense").value;
  const resourceKey = htmlRoot.querySelector(".res-resource").value;
  
  const attackTotal = message.rolls[0].total; 
  const attackerName = message.speaker.alias || "Атакующий";
  const flags = message.flags.superheroes;
  
  const resNameNames = {health:"ЗДОРОВЬЮ", focus:"ФОКУСУ"};
  const defNameNames = {strength:"СИЛЫ", agility:"ЛОВКОСТИ", endurance:"ВЫНОСЛИВОСТИ", vigilance:"БДИТЕЛЬНОСТИ", ego:"ЭГО", logic:"ЛОГИКИ"};

  for (const target of targets) {
      const targetActor = target.actor;
      if (!targetActor) continue;
      
      const sys = targetActor.system;
      
      // Считаем актуальную защиту
      let defenseValue = sys.stats[defenseKey].value + sys.stats[defenseKey].defense;
      const isBerserk = sys.traits?.find(t => t.name === "Берсерк" && t.active);
      if (isBerserk) {
          if (["strength", "endurance", "ego"].includes(defenseKey)) defenseValue += 2;
          if (defenseKey === "agility") defenseValue -= 2;
      }
      
      // Сравниваем бросок и защиту
      if (attackTotal >= defenseValue) {
          // ПОПАДАНИЕ! Бросаем 1d6
          const dmgRoll = new Roll("1d6");
          await dmgRoll.evaluate();
          const d6Result = dmgRoll.total;
          
          // Математика множителей
          const mult = Math.max(1, Number(flags.damageMultiplier) || 1);
          const stable = Number(flags.stable) || 0;
          const reduction = Number(sys[resourceKey].reduction) || 0;
          
          const finalMult = Math.max(0, mult - reduction);
          const finalDamage = (d6Result * finalMult) + stable;
          
          // Автоматически вычитаем здоровье/фокус
          const newHp = Math.max(0, sys[resourceKey].value - finalDamage);
          await targetActor.update({[`system.${resourceKey}.value`]: newHp});
          
          // Красивая визуальная карточка с названием пробитой защиты
          const hitHtml = `
          <div class="superheroes dice-roll">
            <div style="text-align: center; color: #a4d65e; font-weight: bold; font-size: 13px; margin-bottom: 5px; padding: 4px; background: rgba(164, 214, 94, 0.1); border-radius: 4px; border: 1px solid rgba(164, 214, 94, 0.3);">
              ✅ ПРОБИЛ ЗАЩИТУ ${defNameNames[defenseKey]}:<br>${attackerName} ➔ ${target.name}
            </div>
            <div class="dice-result">
              <div class="dice-formula" style="margin-bottom: 5px;"><span>БРОСОК УРОНА</span></div>
              <div class="dice-tooltip" style="display:flex!important;justify-content:center;gap:8px;padding:8px!important;margin:0!important">
                <ol class="dice-rolls" style="display:flex!important;justify-content:center;gap:8px;list-style:none;margin:0;padding:0">
                  <li class="roll die d6" style="width:48px!important;height:48px!important;display:grid!important;place-items:center!important;border:2px solid #c0c4cc!important;border-radius:8px!important;background:linear-gradient(145deg,#f2f2f5,#dbdde3)!important;color:#1c1c22!important;font-weight:700!important;font-size:22px!important;line-height:1!important">${d6Result}</li>
                </ol>
              </div>
              <h4 class="dice-total" style="align-items:center;background:#b52f39;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 100%,10px 100%);color:#fff;display:flex;font-size:16px;font-weight:600;justify-content:center;margin:4px 0 0;padding:8px;position:relative;text-transform:uppercase;width:100%">
                <span style="z-index:1;color:#eee;">${finalDamage} УРОНА ПО ${resNameNames[resourceKey]}</span>
              </h4>
            </div>
          </div>`;
          
          // Используем ChatMessage.create вместо dmgRoll.toMessage чтобы избежать двойного кубика!
          await ChatMessage.create({ speaker: message.speaker, content: hitHtml, rolls: [dmgRoll] });
          
      } else {
          // ПРОМАХ! Строгая стильная карточка с указанием защиты
          const missHtml = `
          <div class="superheroes dice-roll">
            <div style="text-align: center; color: #d34a53; font-weight: bold; font-size: 13px; padding: 6px; background: rgba(211, 74, 83, 0.1); border-radius: 4px; border: 1px solid rgba(211, 74, 83, 0.3);">
              ❌ НЕ ПРОБИЛ ЗАЩИТУ ${defNameNames[defenseKey]}:<br>${attackerName} ➔ ${target.name}
            </div>
          </div>`;
          
          await ChatMessage.create({ speaker: message.speaker, content: missHtml });
      }
  }
}
// =================================================================

function showDialog(content,title,callback){new Dialog({title,content,buttons:{save:{label:"Сохранить",callback},cancel:{label:"Отмена"}},default:"save"}).render(true);}
function safe(v){return foundry.utils.escapeHTML(v??"");}

class SuperheroesItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["superheroes", "sheet", "item"],
      width: 400,
      height: 520,
      template: "systems/superheroes/templates/item-sheet.hbs"
    });
  }
  getData(options) {
    const data = super.getData(options);
    data.system = this.item.system;
    return data;
  }
}

class SuperheroesActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["superheroes", "sheet", "actor"],
      template: "systems/superheroes/templates/actor-sheet.hbs",
      width: 900,
      height: 820,
      resizable: true,
      submitOnChange: false,
      dragDrop: [{dragSelector: ".list-view-item", dropSelector: null}]
    });
  }
  
  getData(options={}) {
    const data = super.getData(options);
    const system = mergeDefaults(this.actor.system);
    
    if(!system.biography.name) system.biography.name = this.actor.name;
    const maxHP = resourceMax(system.stats.endurance.value, system.health.bonus);
    const maxFocus = resourceMax(system.stats.vigilance.value, system.focus.bonus);
    
    const stats = {};
    for(const key of Object.keys(system.stats)) {
      stats[key] = {...system.stats[key], ...statDerived(this.actor, key)};
    }
    
    data.system = system;
    if(!this._editing) this._editing = {powers: false, traits: false, gear: false};
    data.currentTokenImg = this.actor.prototypeToken.texture.src;

    const gearList = clone(system.gear || []).sort((a,b) => (a.sort || 0) - (b.sort || 0));
    const foldersList = clone(system.gearFolders || []).sort((a,b) => (a.sort || 0) - (b.sort || 0));
    
    const gearTree = { folders: [], rootItems: [] };
    const folderMap = {};
    
    foldersList.forEach(f => {
      folderMap[f.id] = { ...f, items: [] };
      gearTree.folders.push(folderMap[f.id]);
    });
    
    gearList.forEach(item => {
      if(item.folderId && folderMap[item.folderId]) {
        folderMap[item.folderId].items.push(item);
      } else {
        gearTree.rootItems.push(item);
      }
    });

    data.derived = {
      maxHP, maxFocus, maxKarma: system.rank, 
      initiative: statMod(system.stats.vigilance.value) + system.initiative.bonus, 
      stats, speed: speedDerived(this.actor), 
      editing: this._editing,
      gearTree: gearTree
    };
    data.editable = this.isEditable;
    
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html); 
    html.off(".superheroes");
    
    const listItems = html.find('.list-view-item');

    listItems.on('dragstart', (e) => {
      const el = e.currentTarget;
      const dragData = {
        type: "SortItem",
        listType: el.dataset.listType,
        id: el.dataset.id
      };
      e.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
      e.originalEvent.dataTransfer.effectAllowed = "move";
    });

    html.find('.stat-derived.clickable, .attack-button').on('dragstart', (e) => {
      const el = e.currentTarget;
      const stat = el.dataset.stat;
      const isAttack = el.dataset.action === "roll-attack";
      const dragData = {
        type: "Macro",
        system: "superheroes",
        macroType: isAttack ? "attack" : "noncombat",
        stat: stat,
        actorId: this.actor.id
      };
      e.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    });

    html.find('.folder-drop-zone, .list-view-item').on('dragover', (e) => {
      e.preventDefault();
      e.originalEvent.dataTransfer.dropEffect = "move";
      const target = e.currentTarget;
      
      html.find('.folder-drop-zone, .list-view-item').removeClass('drag-over-top drag-over-bottom drag-over');
      
      if (target.classList.contains('folder-drop-zone') && !target.classList.contains('list-view-item')) {
        target.classList.add('drag-over');
      } else {
        const rect = target.getBoundingClientRect();
        const isBottomHalf = (e.originalEvent.clientY - rect.top) > (rect.height / 2);
        if (isBottomHalf) target.classList.add('drag-over-bottom');
        else target.classList.add('drag-over-top');
      }
    });

    html.find('.folder-drop-zone, .list-view-item').on('dragleave', (e) => {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
    });

    html.find('.folder-drop-zone, .list-view-item').on('drop', async (e) => {
      html.find('.folder-drop-zone, .list-view-item').removeClass('drag-over-top drag-over-bottom drag-over');
      
      const dataString = e.originalEvent.dataTransfer.getData("text/plain");
      if (!dataString) return;
      let data;
      try { data = JSON.parse(dataString); } catch(err) { return; }
      
      if (data.type === "SortItem") {
        e.preventDefault();
        e.stopPropagation();
        
        const listType = data.listType;
        const itemId = data.id;
        const dropTarget = e.currentTarget;
        
        const arr = clone(this.actor.system[listType] || []);
        const itemIndex = arr.findIndex(x => x.id === itemId);
        if (itemIndex === -1) return;
        const item = arr[itemIndex];

        if (dropTarget.classList.contains('folder-drop-zone')) {
          const targetFolderId = dropTarget.dataset.folderId;
          item.folderId = targetFolderId === "root" ? null : targetFolderId;
          arr.splice(itemIndex, 1);
          arr.push(item); 
        } 
        else if (dropTarget.classList.contains('list-view-item')) {
          const targetId = dropTarget.dataset.id;
          const targetIndex = arr.findIndex(x => x.id === targetId);
          if (targetIndex === -1 || targetId === itemId) return;
          
          const targetItem = arr[targetIndex];
          if (listType === "gear") item.folderId = targetItem.folderId; 
          
          arr.splice(itemIndex, 1);
          const newTargetIndex = arr.findIndex(x => x.id === targetId);
          
          const rect = dropTarget.getBoundingClientRect();
          const isBottomHalf = (e.originalEvent.clientY - rect.top) > (rect.height / 2);
          
          arr.splice(isBottomHalf ? newTargetIndex + 1 : newTargetIndex, 0, item);
        }

        arr.forEach((x, idx) => x.sort = idx);
        await this.actor.update({[`system.${listType}`]: arr});
      }
    });

    html.on("change", "input[data-action='update-gear-hp']", async e => {
      e.preventDefault();
      const el = e.currentTarget;
      const id = el.dataset.id;
      const arr = clone(this.actor.system.gear || []);
      const item = arr.find(x => x.id === id);
      if(item) {
        let val = Math.max(0, Number(el.value) || 0);
        val = Math.min(val, Number(item.hp.max) || 0);
        item.hp.value = val;
        el.value = val;
        await this.actor.update({"system.gear": arr}, {render: false});
      }
    });

    html.on("click", "[data-action='toggle-folder']", async e => {
      e.preventDefault();
      const id = e.currentTarget.dataset.id;
      const folders = clone(this.actor.system.gearFolders || []);
      const folder = folders.find(x => x.id === id);
      if(folder) {
        folder.expanded = !folder.expanded;
        await this.actor.update({"system.gearFolders": folders}, {render: false});
        this.render(false);
      }
    });

    if (this._activeTab) {
      html.find(".tab-button").removeClass("active");
      html.find(".tab-panel").removeClass("active");
      html.find(`.tab-button[data-tab='${this._activeTab}']`).addClass("active");
      html.find(`.tab-panel[data-tab='${this._activeTab}']`).addClass("active");
    }

    html.on("click.superheroes", ".tab-button", e => {
      e.preventDefault();
      html.find(".tab-button").removeClass("active");
      html.find(".tab-panel").removeClass("active");
      const tab = e.currentTarget.dataset.tab;
      e.currentTarget.classList.add("active");
      html.find(`.tab-panel[data-tab='${tab}']`).addClass("active");
      this._activeTab = tab; 
    });

    html.on("input", ".actor-name, input[data-bio-field='name']", e => {
      const val = e.currentTarget.value;
      html.find(".actor-name").val(val);
      html.find("input[data-bio-field='name']").val(val);
    });

    html.on("change.superheroes", ".actor-name", async e => {
      const val = e.currentTarget.value;
      await this.actor.update({ name: val });
    });

    html.on("change.superheroes", ".temp-focus-input", async e => {
      e.preventDefault();
      const el = e.currentTarget;
      const id = el.dataset.id;
      const arr = clone(this.actor.system.powers || []);
      const item = arr.find(x => x.id === id);
      if(item) {
        item.tempFocus = Math.max(0, Number(el.value) || 0);
        await this.actor.update({"system.powers": arr}, {render: false});
      }
    });
    
    html.on("click", ".token-slot", async e => {
      e.preventDefault();
      const index = Number(e.currentTarget.dataset.index);
      const currentGallery = this.actor.system.tokenGallery || ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
      const imgPath = currentGallery[index];

      if (!imgPath) {
        new FilePicker({
          type: "image",
          callback: async path => {
            currentGallery[index] = path;
            await this.actor.update({"system.tokenGallery": currentGallery});
          }
        }).browse();
      } else {
        await this.actor.update({"prototypeToken.texture.src": imgPath});
        if (canvas.ready) {
          const tokens = this.actor.getActiveTokens();
          const updates = tokens.map(t => ({ _id: t.id, "texture.src": imgPath }));
          if (updates.length > 0) canvas.scene.updateEmbeddedDocuments("Token", updates);
        }
      }
    });

    html.on("contextmenu", ".token-slot", async e => {
      e.preventDefault();
      const index = Number(e.currentTarget.dataset.index);
      const currentGallery = this.actor.system.tokenGallery || ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
      new FilePicker({
        type: "image",
        current: currentGallery[index],
        callback: async path => {
          currentGallery[index] = path;
          await this.actor.update({"system.tokenGallery": currentGallery});
        }
      }).browse();
    });
    
    html.on("click.superheroes","[data-action]",async e=>{
      e.preventDefault();e.stopPropagation();const el=e.currentTarget,a=el.dataset.action;
      try{
        if(a==="roll-check")return createCheckRoll(this.actor,el.dataset.stat,game.i18n.localize("SUPERHEROES.Stat."+el.dataset.stat));
        if(a==="roll-noncombat")return createNonCombatRoll(this.actor,el.dataset.stat);
        if(a==="roll-attack")return createAttackRoll(this.actor,el.dataset.stat);
        if(a==="roll-initiative")return createInitiativeRoll(this.actor);
        if(a==="edit-stat")return this._editStat(el.dataset.stat);
        if(a==="edit-health")return this._editHealth();
        if(a==="edit-focus")return this._editFocus();
        if(a==="edit-initiative")return this._editInitiative();
        if(a==="edit-speed")return this._editSpeed();
        if(a==="sleep")return this._sleep();
        if(a==="edit-rank")return this._editRank();
        if(a==="toggle-edit")return this._toggleEdit(el.dataset.type);
        if(a==="add-list-row")return this._addListRow(el.dataset.type);
        if(a==="add-folder")return this._addFolder();
        if(a==="toggle-row-lock")return this._toggleRowLock(el.closest(".sh-list-editor-row"));
        if(a==="delete-item")return this._deleteListItem(el.dataset.type, el.dataset.id);
        if(a==="delete-folder")return this._deleteFolder(el.dataset.id);
        if(a==="toggle-description")return el.closest(".expandable")?.classList.toggle("expanded");
        if(a==="send-item")return this._sendItem(el.dataset.type, el.dataset.id);
        if(a==="edit-bio")return this._editBiography();
        if(a==="edit-token")return this._editToken();
        if(a==="edit-portrait")return this._editPortrait();
        
        if(a==="open-compendium"){
          const compName = el.dataset.compendium || "traits";
          const pack = game.packs.get(`superheroes.${compName}`);
          if(pack) return pack.render(true);
          else return ui.notifications.warn("Библиотека не найдена!");
        }

        if(a==="toggle-trait-active"){
          const type = el.dataset.type;
          const id = el.dataset.id;
          const arr = clone(this.actor.system[type] || []);
          const item = arr.find(x => x.id === id);
          if(item) {
            item.active = !item.active;
            return this.actor.update({[`system.${type}`]: arr});
          }
        }
      }catch(err){console.error("Супергерои | действие листа",a,err);ui.notifications.error("Не удалось выполнить действие. Подробности в консоли.");}
    });
    
    html.on("change.superheroes","[data-bio-field]",async e=>{
      const field=e.currentTarget.dataset.bioField,value=e.currentTarget.value??"";
      if(field==="name") {
         await this.actor.update({name:value});
      } else {
         await this.actor.update({["system.biography."+field]:value},{render:false});
      }
    });
    
    html.on("change.superheroes","input[data-action='resource-current']",e=>{
      const field = e.currentTarget.dataset.field;
      const s = mergeDefaults(this.actor.system);
      let raw = Math.max(0, Number(e.currentTarget.value) || 0);
      if(field === "karma") return this.actor.update({"system.karma": raw});
      const max = field === "health" ? resourceMax(s.stats.endurance.value, s.health.bonus) : resourceMax(s.stats.vigilance.value, s.focus.bonus);
      raw = Math.min(max, raw); 
      e.currentTarget.value = raw; 
      return this.actor.update({[`system.${field}.value`]: raw});
    });
    
    html.on("change.superheroes","[data-edit-field]",async e=>{
      const el=e.currentTarget, field=el.dataset.editField, type=el.dataset.type, id=el.dataset.id;
      const arr=clone(this.actor.system[type]||[]);
      const itemIndex = arr.findIndex(x => x.id === id);
      if(itemIndex === -1) return;
      
      let value;
      if (el.type === "checkbox") {
        value = el.checked;
      } else {
        value = el.value;
        if (field === "cost") value = Number(value) || 0;
      }

      if (field.includes('.')) {
        foundry.utils.setProperty(arr[itemIndex], field, value);
        if (field === 'hp.max') {
           arr[itemIndex].hp.value = Math.min(arr[itemIndex].hp.value || 0, value);
        }
      } else {
        arr[itemIndex][field] = value;
      }
      
      await this.actor.update({["system."+type]:arr},{render:false});
    });
  }

  async _onDrop(event) {
    const dataString = event.dataTransfer?.getData("text/plain");
    if (dataString) {
      try {
        const data = JSON.parse(dataString);
        if (data.type === "SortItem") return false; 
      } catch (e) {}
    }
    return super._onDrop(event);
  }

  async _onDropItem(event, data) {
    if (!this.isEditable) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    if (item.type === "trait") {
      const arr = clone(this.actor.system.traits || []);
      arr.push({ 
        id: foundry.utils.randomID(),
        name: item.name, 
        description: item.system?.description || "",
        active: false,
        sort: arr.length
      });
      await this.actor.update({ "system.traits": arr }, { render: false });
      this.render(false);
      return false; 
    }

    if (item.type === "power") {
      const arr = clone(this.actor.system.powers || []);
      arr.push({ 
        id: foundry.utils.randomID(),
        name: item.name, 
        description: item.system?.description || "",
        requirements: item.system?.requirements || "",
        action: item.system?.action || "",
        trigger: item.system?.trigger || "",
        duration: item.system?.duration || "",
        cost: Number(item.system?.cost) || 0,
        costExtra: item.system?.costExtra || "",
        reaction: Boolean(item.system?.reaction),
        concentration: Boolean(item.system?.concentration),
        active: false,
        tempFocus: 0,
        sort: arr.length
      });
      await this.actor.update({ "system.powers": arr }, { render: false });
      this.render(false);
      return false; 
    }

    return super._onDropItem(event, data);
  }

  async _editPortrait() {
    const currentImg = this.actor.img;
    new FilePicker({
      type: "image",
      current: currentImg,
      callback: async path => {
        const updates = { "img": path };
        if (this.actor.prototypeToken.texture.src === currentImg || this.actor.prototypeToken.texture.src === "icons/svg/mystery-man.svg") {
          updates["prototypeToken.texture.src"] = path;
        }
        await this.actor.update(updates);
      }
    }).browse();
  }

  async _editToken(){
    try {
      new CONFIG.Token.prototypeSheetClass(this.actor.prototypeToken).render(true);
    } catch(err) {
      console.error("Супергерои | Ошибка открытия токена:", err);
      ui.notifications.error("Не удалось открыть настройки токена.");
    }
  }

  async _editRank(){const s=mergeDefaults(this.actor.system);showDialog('<div class="sh-dialog"><label>Ранг (1–5)</label><input id="rank" type="number" min="1" max="5" value="'+s.rank+'"></div>',"Ранг",async h=>this.actor.update({"system.rank":Math.min(5,Math.max(1,Number(h.find("#rank").val())||1))}));}
  async _editHealth(){const s=mergeDefaults(this.actor.system);showDialog('<div class="sh-dialog"><label>Дополнительный максимум здоровья</label><input id="bonus" type="number" value="'+s.health.bonus+'"><label>Уменьшение множителя урона (-)</label><input id="reduction" type="number" value="'+s.health.reduction+'"></div>',"Настройки здоровья",async h=>this.actor.update({"system.health.bonus":Number(h.find("#bonus").val())||0, "system.health.reduction":Number(h.find("#reduction").val())||0}));}
  async _editFocus(){const s=mergeDefaults(this.actor.system);showDialog('<div class="sh-dialog"><label>Дополнительный максимум фокуса</label><input id="bonus" type="number" value="'+s.focus.bonus+'"><label>Уменьшение множителя урона (-)</label><input id="reduction" type="number" value="'+s.focus.reduction+'"></div>',"Настройки фокуса",async h=>this.actor.update({"system.focus.bonus":Number(h.find("#bonus").val())||0, "system.focus.reduction":Number(h.find("#reduction").val())||0}));}
  async _editInitiative(){const s=mergeDefaults(this.actor.system);showDialog('<div class="sh-dialog"><label>Поправка инициативы</label><input id="bonus" type="number" value="'+s.initiative.bonus+'"></div>',"Настройки инициативы",async h=>this.actor.update({"system.initiative.bonus":Number(h.find("#bonus").val())||0}));}
  async _editSpeed(){const s=mergeDefaults(this.actor.system);const labels={running:"Бег",climbing:"Лазание",swimming:"Плавание",jumping:"Прыжок",flying:"Полёт"};const fields=Object.entries(labels).map(function(e){return '<label>'+e[1]+' — дополнительное значение</label><input id="'+e[0]+'" type="number" value="'+s.speed[e[0]]+'">'}).join("");showDialog('<div class="sh-dialog">'+fields+'</div>',"Настройки скорости",async h=>{const p={};for(const k of Object.keys(labels))p["system.speed."+k]=Number(h.find("#"+k).val())||0;await this.actor.update(p);});}
  async _sleep(){const s=mergeDefaults(this.actor.system),hp=resourceMax(s.stats.endurance.value,s.health.bonus),focus=resourceMax(s.stats.vigilance.value,s.focus.bonus);await this.actor.update({"system.karma":s.rank,"system.health.value":hp,"system.focus.value":focus});}
  async _editStat(key){const s=mergeDefaults(this.actor.system).stats[key];showDialog('<div class="sh-dialog"><label>Изменение характеристики (от 10)</label><input id="value" type="number" value="'+(s.value-10)+'"><label>Изменение защиты</label><input id="defense" type="number" value="'+s.defense+'"><label>Изменение вне боя</label><input id="nonCombat" type="number" value="'+s.nonCombat+'"><label>Изменение попадания</label><input id="hit" type="number" value="'+s.hit+'"><label>Изменение множителя урона</label><input id="multiplier" type="number" value="'+s.multiplier+'"><label>Изменение стабильного урона</label><input id="stable" type="number" value="'+s.stable+'"></div>',"Настройки — "+game.i18n.localize("SUPERHEROES.Stat."+key),async h=>{const p="system.stats."+key+".";await this.actor.update({[p+"value"]:10+(Number(h.find("#value").val())||0),[p+"defense"]:Number(h.find("#defense").val())||0,[p+"nonCombat"]:Number(h.find("#nonCombat").val())||0,[p+"hit"]:Number(h.find("#hit").val())||0,[p+"multiplier"]:Number(h.find("#multiplier").val())||0,[p+"stable"]:Number(h.find("#stable").val())||0});});}
  async _editBiography(){const root=this.element?.[0]||this.element;const editing=root?.classList.toggle("biography-editing");root?.querySelectorAll("[data-bio-field]").forEach(function(el){el.readOnly=!editing;el.classList.toggle("editable",!!editing);});const button=root?.querySelector("[data-action='edit-bio']");if(button)button.title=editing?"Завершить редактирование":"Редактировать биографию";if(editing)root?.querySelector("[data-bio-field='nickname']")?.focus();}

  async _toggleEdit(type){
    if(!this._editing) this._editing={powers:false,traits:false,gear:false};
    this._editing[type]=!this._editing[type];
    this.render(false);
  }
  
  async _addFolder() {
    const arr = clone(this.actor.system.gearFolders || []);
    arr.push({
      id: foundry.utils.randomID(),
      name: "Новая папка",
      color: "#8d2b33",
      expanded: true,
      sort: arr.length
    });
    await this.actor.update({"system.gearFolders": arr});
  }

  async _deleteFolder(id) {
    const d = new Dialog({
      title: "Удаление папки",
      content: "<p>Вы уверены, что хотите удалить эту папку? <b>Все находящиеся внутри предметы также будут безвозвратно удалены!</b></p>",
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Удалить всё",
          callback: async () => {
            const folders = clone(this.actor.system.gearFolders || []).filter(f => f.id !== id);
            const items = clone(this.actor.system.gear || []).filter(i => i.folderId !== id);
            await this.actor.update({"system.gearFolders": folders, "system.gear": items});
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Отмена" }
      },
      default: "cancel"
    });
    d.render(true);
  }

  async _addListRow(type){
    if(!["powers","traits","gear"].includes(type)) return;
    const arr = clone(this.actor.system[type] || []);
    const newItem = { id: foundry.utils.randomID(), name: "", description: "", active: false, sort: arr.length };
    
    if (type === "powers") {
      newItem.requirements = ""; newItem.action = ""; newItem.trigger = ""; newItem.duration = "";
      newItem.costExtra = ""; newItem.cost = 0; newItem.reaction = false; newItem.concentration = false; newItem.tempFocus = 0;
    }
    if (type === "gear") {
      newItem.folderId = null;
      newItem.quantity = 1;
      newItem.weight = 0;
      newItem.hp = { value: 0, max: 0 };
    }
    
    arr.push(newItem);
    await this.actor.update({["system."+type]: arr});
  }
  
  async _toggleRowLock(row){
    if(!row) return;
    const editor = row.closest("[data-editor-type]");
    const type = editor?.dataset.editorType;
    const id = row.dataset.id;
    if(!["powers","traits","gear"].includes(type) || !id) return;
    
    const arr = clone(this.actor.system[type] || []);
    const item = arr.find(x => x.id === id);
    if(item) {
      item.locked = !item.locked;
      await this.actor.update({["system."+type]: arr});
    }
  }
  
  async _deleteListItem(type, id){
    const arr = clone(this.actor.system[type] || []);
    const index = arr.findIndex(x => x.id === id);
    if(index !== -1) {
      arr.splice(index, 1);
      await this.actor.update({["system."+type]: arr});
    }
  }

  async _sendItem(type, id) {
    const itemArray = this.actor.system[type] || [];
    const item = itemArray.find(x => x.id === id);

    if (!item) {
      return ui.notifications.warn("Не удалось найти данные для отправки.");
    }

    const esc = (str) => {
      if (!str) return "";
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };

    const title = type === "powers" ? "СПОСОБНОСТЬ" : type === "traits" ? "ОСОБЕННОСТЬ" : "СНАРЯЖЕНИЕ";

    let meta = "";
    let detailsStr = "";
    
    if (type === "powers") {
      const metaItems = [];
      const costText = item.costExtra ? `${item.cost} ${item.costExtra}` : `${item.cost}`;
      if (item.cost && Number(item.cost) > 0) {
        metaItems.push(`<span style="padding: 2px 5px; background: #b7323c; color: #fff; border-radius: 4px; font-weight: bold; font-size: 8px;">ФОКУС: ${esc(costText)}</span>`);
      }
      if (item.reaction) metaItems.push(`<span style="padding: 2px 5px; background: #4a3b00; border: 1px solid #997a00; color: #ffda33; border-radius: 4px; font-weight: bold; font-size: 8px;">⚡ РЕАКЦИЯ</span>`);
      if (item.concentration) metaItems.push(`<span style="padding: 2px 5px; background: #2a004a; border: 1px solid #6600cc; color: #d899ff; border-radius: 4px; font-weight: bold; font-size: 8px;">👁 КОНЦЕНТРАЦИЯ</span>`);
      if (item.name === "Поглощение Энергии" && item.tempFocus > 0) metaItems.push(`<span style="padding: 2px 5px; background: #2b003b; border: 1px solid #cc00ff; color: #f2ccff; border-radius: 4px; font-weight: bold; font-size: 8px;">НАКОПЛ.: ${item.tempFocus}</span>`);

      if (metaItems.length > 0) meta = metaItems.join("");

      const details = [];
      if (item.requirements) details.push(`<b>Требования:</b> ${esc(item.requirements)}`);
      if (item.action) details.push(`<b>Действие:</b> ${esc(item.action)}`);
      if (item.trigger) details.push(`<b>Вызвано:</b> ${esc(item.trigger)}`);
      if (item.duration) details.push(`<b>Продолжительность:</b> ${esc(item.duration)}`);
      
      if (details.length > 0) {
        detailsStr = `<div style="background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px; margin-bottom: 8px; font-size: 10px; color: #aaa;">${details.join('<br>')}</div>`;
      }
    } else if (type === "gear") {
      const metaItems = [];
      if (item.quantity) metaItems.push(`<span style="padding: 2px 5px; background: #1e1e24; border: 1px solid #3d3d46; color: #aaa; border-radius: 4px; font-weight: bold; font-size: 8px;">КОЛ: ${item.quantity}</span>`);
      if (item.weight) metaItems.push(`<span style="padding: 2px 5px; background: #1e1e24; border: 1px solid #3d3d46; color: #aaa; border-radius: 4px; font-weight: bold; font-size: 8px;">ВЕС: ${item.weight}</span>`);
      if (item.hp?.max) metaItems.push(`<span style="padding: 2px 5px; background: #2a1518; border: 1px solid #8d2b33; color: #e8898f; border-radius: 4px; font-weight: bold; font-size: 8px;">ХП: ${item.hp.value} / ${item.hp.max}</span>`);
      if (metaItems.length > 0) meta = metaItems.join("");
    }

    const descriptionFormatted = esc(item.description || "").replace(/\n/g, '<br>');
    const effectPrefix = type === "powers" ? `<b>Эффект:</b> ` : "";

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <div class="sh-chat-card">
          <div class="chat-title">${title}</div>
          <h3 style="margin: 5px 0; color: #fff; text-transform: uppercase; font-size: 15px; letter-spacing: 0.5px;">${esc(item.name || "Без названия")}</h3>
          ${meta ? `<div class="power-meta" style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px;">${meta}</div>` : ''}
          ${detailsStr}
          <div style="color: #ccc; font-size: 11px; line-height: 1.45;">
            ${effectPrefix}${descriptionFormatted}
          </div>
        </div>
      `
    });
  }
}

Hooks.once("init",()=>{
  Handlebars.registerHelper("concat",function(a,b){return (a??"")+(b??"");}); Handlebars.registerHelper("eq",function(a,b){return a===b;});
  CONFIG.Dice.terms.s=SuperheroesDie;
  if(!CONFIG.Dice.types.includes(SuperheroesDie))CONFIG.Dice.types.push(SuperheroesDie);
  CONFIG.Dice.rolls.push(SuperheroesRoll);
  
  Actors.registerSheet("superheroes",SuperheroesActorSheet,{types:["character"],makeDefault:true,label:"Лист персонажа"});
  Items.registerSheet("superheroes",SuperheroesItemSheet,{makeDefault:true,label:"Лист предмета"});

  Combat.prototype.rollInitiative = async function(ids, options={}) {
    ids = typeof ids === "string" ? [ids] : ids;
    const combatants = ids.map(id => this.combatants.get(id));
    
    for (let c of combatants) {
      if (!c.actor) continue;
      await createInitiativeRoll(c.actor);
    }
    return this;
  };
});

Hooks.once("ready",function(){if(game.dice3d)registerDiceSoNice(game.dice3d);});
Hooks.once("diceSoNiceReady",function(dice3d){registerDiceSoNice(dice3d);});
function registerDiceSoNice(dice3d){try{dice3d.addDicePreset({type:"s",labels:["★","2","3","4","5","6"],colorset:"red",system:"standard"});dice3d.addDicePreset({type:"d6",labels:["1","2","3","4","5","6"],colorset:"white",system:"standard"});}catch(err){console.warn("Супергерои | Dice So Nice",err);}}
Hooks.once("ready",function(){for(const actor of game.actors.contents){const s=mergeDefaults(actor.system),hp=resourceMax(s.stats.endurance.value,s.health.bonus),focus=resourceMax(s.stats.vigilance.value,s.focus.bonus);if(actor.system?.health?.value>hp)actor.update({"system.health.value":hp},{render:false});if(actor.system?.focus?.value>focus)actor.update({"system.focus.value":focus},{render:false});}});

Hooks.on("preCreateActor", function(actor) {
  const s = mergeDefaults(actor.system);
  s.health.max = resourceMax(s.stats.endurance.value, s.health.bonus);
  s.focus.max = resourceMax(s.stats.vigilance.value, s.focus.bonus);

  actor.updateSource({
    system: s,
    prototypeToken: {
      actorLink: true,                            
      displayName: 20, 
      displayBars: 20, 
      bar1: { attribute: "health" },              
      bar2: { attribute: "focus" }                
    }
  });
});

Hooks.on("preUpdateActor", function(actor, changes) {
  const expandedChanges = foundry.utils.expandObject(changes);
  const merged = foundry.utils.mergeObject(clone(actor.system), expandedChanges.system || {}, {inplace: false, recursive: true});
  const s = mergeDefaults(merged);
  
  const hp = resourceMax(s.stats.endurance.value, s.health.bonus);
  const focus = resourceMax(s.stats.vigilance.value, s.focus.bonus);

  foundry.utils.setProperty(changes, "system.health.max", hp);
  foundry.utils.setProperty(changes, "system.focus.max", focus);
  
  if(s.health.value > hp) foundry.utils.setProperty(changes, "system.health.value", hp);
  if(s.focus.value > focus) foundry.utils.setProperty(changes, "system.focus.value", focus);
  
  if(changes.name) {
    foundry.utils.setProperty(changes, "system.biography.name", changes.name);
    foundry.utils.setProperty(changes, "prototypeToken.name", changes.name);
  }
});

Hooks.on("updateActor", function(actor, changes) {
  if (changes.name && canvas.ready) {
    const tokens = actor.getActiveTokens();
    const tokenUpdates = tokens.map(t => ({ _id: t.id, name: changes.name }));
    if (tokenUpdates.length > 0) {
      canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates);
    }
  }
});

Hooks.on("renderChatMessage",function(message,html){
  const root=html[0]||html;
  
  root.querySelectorAll("button.retroEdgeMode").forEach(function(button){
    button.addEventListener("click",async function(e){
      e.preventDefault();e.stopPropagation();
      try{await rerollSuperheroesDie(message.id,Number(e.currentTarget.dataset.index),e.currentTarget.dataset.retroAction);}
      catch(err){console.error("Супергерои | переброс",err);ui.notifications.error("Не удалось перебросить: "+err.message);}
    });
  });

  if(message.flags?.superheroes?.kind === "attack") {
      const oldDamageBtn = root.querySelector("button.superheroes-damage");
      if (oldDamageBtn) oldDamageBtn.style.display = "none";

      if(!root.querySelector(".attack-resolution-panel")) {
          const statKey = message.flags.superheroes.statKey;
          const isPhys = ["strength", "agility", "endurance"].includes(statKey);
          
          const panelHtml = `
          <div class="attack-resolution-panel" style="margin-top: 8px; padding: 6px; background: #151519; border: 1px solid #36363d; border-radius: 5px;">
              <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                  <div style="flex:1;">
                      <span style="display:block; font-size: 8px; color: #888; letter-spacing: 0.5px; margin-bottom: 2px;">ЗАЩИТА ЦЕЛИ:</span>
                      <select class="res-defense" style="width:100%; height:22px; font-size:11px; background:#fff; color:#111; border:1px solid #aaa; border-radius:3px;">
                          <option value="strength" ${statKey==="strength"?"selected":""}>Силы</option>
                          <option value="agility" ${statKey==="agility"?"selected":""}>Ловкости</option>
                          <option value="endurance" ${statKey==="endurance"?"selected":""}>Выносливости</option>
                          <option value="vigilance" ${statKey==="vigilance"?"selected":""}>Бдительности</option>
                          <option value="ego" ${statKey==="ego"?"selected":""}>Эго</option>
                          <option value="logic" ${statKey==="logic"?"selected":""}>Логики</option>
                      </select>
                  </div>
                  <div style="flex:1;">
                      <span style="display:block; font-size: 8px; color: #888; letter-spacing: 0.5px; margin-bottom: 2px;">УРОН ПО:</span>
                      <select class="res-resource" style="width:100%; height:22px; font-size:11px; background:#fff; color:#111; border:1px solid #aaa; border-radius:3px;">
                          <option value="health" ${isPhys?"selected":""}>Здоровью</option>
                          <option value="focus" ${!isPhys?"selected":""}>Фокусу</option>
                      </select>
                  </div>
              </div>
              <button class="resolve-attack-btn" style="width:100%; background: #b52f39; color: white; border: 1px solid #8d2b33; font-weight: bold; cursor: pointer; padding: 4px; border-radius: 3px; font-size: 11px;">⚔️ РАЗРЕШИТЬ АТАКУ</button>
          </div>`;
          
          const diceTotal = root.querySelector(".dice-total");
          if(diceTotal) {
            diceTotal.insertAdjacentHTML("afterend", panelHtml);
            
            root.querySelector(".resolve-attack-btn").addEventListener("click", async (e) => {
                e.preventDefault();
                await resolveAttack(message.id, root);
            });
          }
      }
  }
});

window.SuperheroesSystem={SuperheroesDie,SuperheroesRoll,createCheckRoll,createNonCombatRoll,createAttackRoll,rerollSuperheroesDie,executeMacro};

let shFastCombatEnabled = false;

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "fast-combat",
      title: "Быстрое добавление в бой (Клик по токену)",
      icon: "fas fa-bolt", 
      toggle: true,
      active: shFastCombatEnabled,
      onClick: (toggled) => {
        shFastCombatEnabled = toggled;
      }
    });
  }
});

Hooks.on("controlToken", async (token, controlled) => {
  if (controlled && game.user.isGM && shFastCombatEnabled) {
    await token.document.toggleCombatant();
  }
});

Hooks.once("ready", async function() {
  if (!game.user.isGM) return;

  const packTraits = game.packs.get("superheroes.traits");
  if (packTraits && packTraits.index.size === 0 && window.SuperheroesTraitsLibrary) {
    const wasLocked = packTraits.locked;
    if (wasLocked) await packTraits.configure({ locked: false });
    const itemsToCreate = window.SuperheroesTraitsLibrary.map(t => ({
      name: t.name, type: "trait", system: { description: t.description }
    }));
    try { await Item.createDocuments(itemsToCreate, { pack: packTraits.collection }); } catch (err) {}
    if (wasLocked) await packTraits.configure({ locked: true });
  }

  const packPowers = game.packs.get("superheroes.powers");
  if (packPowers && packPowers.index.size === 0 && window.SuperheroesPowersLibrary) {
    const wasLocked = packPowers.locked;
    if (wasLocked) await packPowers.configure({ locked: false });

    const folderNames = [...new Set(window.SuperheroesPowersLibrary.map(p => p.folder).filter(f => f))];
    const colors = window.SuperheroesFolderColors || {};
    
    const folderDocs = await Folder.createDocuments(
      folderNames.map(name => ({ name: name, type: "Item", color: colors[name] || "#000000" })),
      { pack: packPowers.collection }
    );

    const folderMap = {};
    folderDocs.forEach(f => folderMap[f.name] = f.id);

    const itemsToCreate = window.SuperheroesPowersLibrary.map(p => ({
      name: p.name,
      type: "power",
      folder: folderMap[p.folder] || null,
      system: { 
        description: p.description, 
        requirements: p.requirements || "",
        action: p.action || "",
        trigger: p.trigger || "",
        duration: p.duration || "",
        costExtra: p.costExtra || "",
        cost: p.cost || 0,
        reaction: p.reaction || false,
        concentration: p.concentration || false
      }
    }));

    try { await Item.createDocuments(itemsToCreate, { pack: packPowers.collection }); } catch (err) {}
    if (wasLocked) await packPowers.configure({ locked: true });
  }
});

Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type === "Macro" && data.system === "superheroes") {
      createSuperheroesMacro(data, slot);
      return false; 
  }
});

async function createSuperheroesMacro(data, slot) {
  const actor = game.actors.get(data.actorId);
  if (!actor) return;

  const statNames = {
      strength: "Сила", agility: "Ловкость", endurance: "Выносливость",
      vigilance: "Бдительность", ego: "Эго", logic: "Логика"
  };
  
  const statName = statNames[data.stat] || data.stat;
  const isAttack = data.macroType === "attack";
  
  const name = isAttack ? `⚔️ ${statName}` : `🎲 ${statName}`;
  const img = `systems/superheroes/assets/icons/${data.stat}.png`;
  const command = `SuperheroesSystem.executeMacro("${data.actorId}", "${data.stat}", "${data.macroType}");`;

  let macro = game.macros.find(m => m.name === name && m.command === command);
  
  if (!macro) {
      macro = await Macro.create({
          name: name,
          type: "script",
          img: img,
          command: command,
          flags: { "superheroes.macro": true }
      });
  }
  
  game.user.assignHotbarMacro(macro, slot);
}