/* СУПЕРГЕРОИ — Foundry VTT 12 */
const SH_DEFAULTS = {
  rank: 1, karma: 1,
  health: { value: 10, bonus: 0 },
  focus: { value: 10, bonus: 0 },
  initiative: { bonus: 0 },
  biography: { name:"", nickname:"", age:"", gender:"", height:"", weight:"", eyes:"", hair:"", history:"", notes:"" },
  stats: {
    strength:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    agility:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    endurance:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    vigilance:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    ego:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0},
    logic:{value:10,defense:0,nonCombat:0,hit:0,multiplier:0,stable:0}
  },
  powers: [], traits: [], gear: []
};

const clone = o => foundry.utils.deepClone(o);
function mergeDefaults(source={}) {
  const d=clone(SH_DEFAULTS);
  foundry.utils.mergeObject(d,source,{inplace:true,recursive:true});
  for(const key of Object.keys(d.stats)){
    d.stats[key].value=Number.isFinite(Number(d.stats[key].value))?Number(d.stats[key].value):10;
    for(const p of ["defense","nonCombat","hit","multiplier","stable"])
      d.stats[key][p]=Number.isFinite(Number(d.stats[key][p]))?Number(d.stats[key][p]):0;
  }
  d.rank=Math.min(5,Math.max(1,Number(d.rank)||1));
  d.karma=Number.isFinite(Number(d.karma))?Math.max(0,Number(d.karma)):d.rank;
  for(const p of ["health","focus"]){
    d[p].value=Number.isFinite(Number(d[p].value))?Math.max(0,Number(d[p].value)):10;
    d[p].bonus=Number.isFinite(Number(d[p].bonus))?Number(d[p].bonus):0;
  }
  d.initiative.bonus=Number.isFinite(Number(d.initiative.bonus))?Number(d.initiative.bonus):0;
  return d;
}
function statMod(value){return Number(value)-10;}
function resourceMax(value,bonus=0){
  const n=Number(value);
  const base=n<=10?10:30*(n-10);
  return Math.max(10,base+Number(bonus||0));
}
function statDerived(actor,key){
  const system=mergeDefaults(actor.system),s=system.stats[key],mod=statMod(s.value);
  return {value:s.value,mod,defense:s.value+s.defense,nonCombat:s.value+s.nonCombat,hit:s.value+s.hit,
    stable:mod+s.stable,multiplier:Number(system.rank)+s.multiplier};
}

/* Броски 3d6: структура и ретро-перебросы сделаны по той же схеме, что и рабочая Marvel-система:
   {1d6,1ds,1d6}, где центральная кость — специальная s. */
class SuperheroesDie extends foundry.dice.terms.Die {
  static DENOMINATION = "s";
  constructor(termData={}) { super({...termData, faces: 6}); }
  getResultCSS(result) {
    const css=["superheroes-roll","die","d6"];
    if(Number(result?.result)===1) css.push("fantastic");
    else if(Number(result?.result)===6) css.push("max");
    if(result?.discarded) css.push("discarded");
    return css;
  }
  getResultLabel(result) { return Number(result?.result)===1 ? "★" : String(result?.result ?? ""); }
  roll({minimize=false,maximize=false}={}) {
    const result=super.roll({minimize,maximize});
    if(result.result===1) this.results[this.results.length-1].count=6;
    return result;
  }
  get total() { const total=super.total; return total===1?6:total; }
}
function effectiveResult(v){const n=Number(v??0);return n===1?6:n;}
function isSuperheroesPool(roll){
  const t=roll?.terms?.[0];
  return t instanceof foundry.dice.terms.PoolTerm && t.rolls?.length===3 && t.rolls[1]?.terms?.[0] instanceof SuperheroesDie;
}
function getSuperheroesPool(roll){
  if(!roll) return null;
  const first=roll.terms?.[0];
  if(first instanceof foundry.dice.terms.PoolTerm) return first;
  if(first instanceof foundry.dice.terms.ParentheticalTerm && first.roll?.terms?.[0] instanceof foundry.dice.terms.PoolTerm) return first.roll.terms[0];
  return null;
}
function poolValues(roll){
  const pool=getSuperheroesPool(roll);
  if(!pool) return [];
  return pool.rolls.map((r,i)=>{
    const die=r.terms[0];
    const active=[...die.results].reverse().find(x=>x.active) || die.results.at(-1);
    const result=Number(active?.result??0);
    return {result,effective:effectiveResult(result),critical:i===1&&result===1};
  });
}
async function sendCheckRoll(actor,key,label,nonCombat=false){
  const s=statDerived(actor,key);
  const roll=new Roll(`{1d6,1ds,1d6} + ${s.mod}`);
  await roll.evaluate({async:true});
  return roll.toMessage({
    speaker:ChatMessage.getSpeaker({actor}),
    flavor:label,
    flags:{superheroes:{type:"3d6",statKey:key,kind:nonCombat?"nonCombat":"check"}}
  });
}
async function createCheckRoll(actor,key,label){return sendCheckRoll(actor,key,label,false);}
async function createNonCombatRoll(actor,key){return sendCheckRoll(actor,key,`${game.i18n.localize(`SUPERHEROES.Stat.${key}`)} — Вне боя`,true);}
async function createAttackRoll(actor,key){
  const s=statDerived(actor,key), count=Math.max(1,Number(s.multiplier)||1);
  const roll=new Roll(`${count}d6`); await roll.evaluate({async:true});
  return roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`Атака — ${game.i18n.localize(`SUPERHEROES.Stat.${key}`)}`,flags:{superheroes:{type:"attack",key}}});
}
async function rerollSuperheroesDie(messageId,dieIndex,mode="edge"){
  const message=game.messages.get(messageId), roll=message?.rolls?.[0];
  if(!message||!roll||!isSuperheroesPool(roll)||![0,1,2].includes(dieIndex)) return;
  const pool=getSuperheroesPool(roll), targetRoll=pool.rolls[dieIndex], targetDie=targetRoll.terms[0];
  const modifier=mode==="edge"?"kh":"kl";
  const old=targetDie.results.find(r=>r.active) || targetDie.results.at(-1);
  const oldResult=effectiveResult(old?.result);
  const dieType=dieIndex===1?"s":"6";
  const newRoll=new Roll(`2d${dieType}${modifier}`);
  await newRoll.evaluate({async:true});
  const newDie=newRoll.terms[0];
  const newResultObj=newDie.results.find(r=>r.active)||newDie.results.at(-1);
  const newResult=effectiveResult(newResultObj?.result);
  // Сохраняем обе стороны в самом RollTerm: старый результат остаётся discarded/active,
  // новый результат добавляется как второй результат, как в Marvel.
  const keepNew=mode==="edge"?newResult>=oldResult:newResult<=oldResult;
  old.active=!keepNew; old.discarded=keepNew;
  newResultObj.active=keepNew; newResultObj.discarded=!keepNew;
  targetDie.results.push(newResultObj);
  targetDie.number=2;
  targetDie.modifiers=[modifier];
  targetRoll._formula=`2d${dieType}${modifier}`;
  const values=poolValues(roll);
  const oldTotal=roll.total;
  const newTotal=values.reduce((a,v)=>a+v.effective,0)+(Number(roll.terms.find(t=>t instanceof foundry.dice.terms.OperatorTerm)?.operator==="+"?0:0));
  // Foundry уже считает PoolTerm с выбранным результатом; просто переоцениваем итог через выбранные кости + модификатор.
  const modMatch=String(roll.formula).match(/\}\s*([+-]\s*\d+(?:\.\d+)?)\s*$/);
  const mod=modMatch?Number(modMatch[1].replace(/\s/g,"")):0;
  roll._total=values.reduce((a,v)=>a+v.effective,0)+mod;
  await message.update({content:await renderRollContent(roll,message),rolls:[roll]});
  if(game.dice3d?.showForRoll){try{await game.dice3d.showForRoll(newRoll,game.user,true);}catch(e){}}
  return oldTotal;
}
async function renderRollContent(roll,message){
  // Не заменяем стандартную механику Foundry; этот метод используется только для
  // сохранения кнопок после ретро-переброса.
  const values=poolValues(roll), total=roll.total, critical=values[1]?.critical;
  const dice=values.map((v,i)=>`<div class="superheroes-chat-die ${i===1?"middle":""} ${v.critical?"critical":""}">${v.critical?"★":v.result}</div>`).join("");
  return `<div class="superheroes dice-roll"><div class="dice-result"><div class="superheroes-roll-title">${foundry.utils.escapeHTML(message.flavor?.content||message.flavor||"Бросок")}</div><div class="superheroes-dice-row">${values.map((v,i)=>`<div class="superheroes-die-cell"><div class="superheroes-chat-die ${i===1?"middle":""} ${v.critical?"critical":""}">${v.critical?"★":v.result}</div><div class="superheroes-reroll-row"><button type="button" class="retroEdgeMode" data-retro-action="edge" data-index="${i}">Преимущество</button><button type="button" class="retroEdgeMode" data-retro-action="trouble" data-index="${i}">Помеха</button></div></div>`).join("")}</div><h4 class="dice-total">${total}</h4></div></div>`;
}
/* Диалоги */
function showDialog(content,title,callback){
  new Dialog({title,content,buttons:{save:{label:"Сохранить",callback},cancel:{label:"Отмена"}},default:"save"}).render(true);
}
function safe(v){return foundry.utils.escapeHTML(v??"");}

class SuperheroesActorSheet extends ActorSheet {
  static get defaultOptions(){
    return foundry.utils.mergeObject(super.defaultOptions,{classes:["superheroes","sheet","actor"],template:"systems/superheroes/templates/actor-sheet.hbs",width:900,height:820,resizable:true,submitOnChange:false});
  }
  getData(options={}){
    const data=super.getData(options),system=mergeDefaults(this.actor.system);
    if(!system.biography.name)system.biography.name=this.actor.name;
    const maxHP=resourceMax(system.stats.endurance.value,system.health.bonus),maxFocus=resourceMax(system.stats.vigilance.value,system.focus.bonus),stats={};
    for(const key of Object.keys(system.stats))stats[key]={...system.stats[key],...statDerived(this.actor,key)};
    data.system=system;
    data.derived={maxHP,maxFocus,maxKarma:system.rank,initiative:statMod(system.stats.vigilance.value)+system.initiative.bonus,stats};
    data.editable=this.isEditable;
    return data;
  }
  activateListeners(html){
    super.activateListeners(html);
    html.off(".superheroes");
    html.on("click.superheroes","[data-action]",async e=>{
      e.preventDefault();
      e.stopPropagation();
      const el=e.currentTarget, a=el.dataset.action;
      try {
        if(a==="roll-check") return createCheckRoll(this.actor,el.dataset.stat,game.i18n.localize(`SUPERHEROES.Stat.${el.dataset.stat}`));
        if(a==="roll-noncombat") return createNonCombatRoll(this.actor,el.dataset.stat);
        if(a==="roll-attack") return createAttackRoll(this.actor,el.dataset.stat);
        if(a==="edit-stat") return this._editStat(el.dataset.stat);
        if(a==="edit-health") return this._editHealth();
        if(a==="edit-focus") return this._editFocus();
        if(a==="edit-initiative") return this._editInitiative();
        if(a==="sleep") return this._sleep();
        if(a==="edit-rank") return this._editRank();
        if(a==="add-power") return this._editListItem("powers",-1);
        if(a==="add-trait") return this._editListItem("traits",-1);
        if(a==="add-gear") return this._editListItem("gear",-1);
        if(a==="edit-power") return this._editListItem("powers",Number(el.dataset.index));
        if(a==="edit-trait") return this._editListItem("traits",Number(el.dataset.index));
        if(a==="edit-gear") return this._editListItem("gear",Number(el.dataset.index));
        if(a==="delete-item") return this._deleteListItem(el.dataset.type,Number(el.dataset.index));
        if(a==="toggle-description") return el.closest(".expandable")?.classList.toggle("expanded");
        if(a==="send-item") return this._sendItem(el.dataset.type,Number(el.dataset.index));
        if(a==="edit-bio") return this._editBiography();
        if(a==="edit-token") return this._editToken();
      } catch(err) {
        console.error("Супергерои | действие листа",a,err);
        ui.notifications.error("Не удалось выполнить действие. Подробности в консоли.");
      }
    });
    html.on("click.superheroes",".tab-button",e=>{
      e.preventDefault();
      html.find(".tab-button").removeClass("active");
      html.find(".tab-panel").removeClass("active");
      e.currentTarget.classList.add("active");
      html.find(`.tab-panel[data-tab='${e.currentTarget.dataset.tab}']`).addClass("active");
    });
    html.on("change.superheroes","[data-bio-field]",async e=>{
      const field=e.currentTarget.dataset.bioField, value=e.currentTarget.value??"";
      if(field==="name"){await this.actor.update({name:value,"system.biography.name":value});}
      else await this.actor.update({[`system.biography.${field}`]:value});
    });
    html.on("change.superheroes","input[data-action='resource-current']",e=>{
      const field=e.currentTarget.dataset.field,s=mergeDefaults(this.actor.system),raw=Math.max(0,Number(e.currentTarget.value)||0);
      if(field==="karma") return this.actor.update({"system.karma":raw});
      const max=field==="health"?resourceMax(s.stats.endurance.value,s.health.bonus):resourceMax(s.stats.vigilance.value,s.focus.bonus);
      return this.actor.update({[`system.${field}.value`]:Math.min(max,raw)});
    });
  }
  async _editRank(){
    const s=mergeDefaults(this.actor.system);
    showDialog(`<div class="sh-dialog"><label>Ранг (1–5)</label><input id="rank" type="number" min="1" max="5" value="${s.rank}"></div>`,"Ранг",async h=>this.actor.update({"system.rank":Math.min(5,Math.max(1,Number(h.find("#rank").val())||1))}));
  }
  async _editHealth(){
    const s=mergeDefaults(this.actor.system);
    showDialog(`<div class="sh-dialog"><label>Дополнительный максимум здоровья</label><input id="bonus" type="number" value="${s.health.bonus}"></div>`,"Настройки здоровья",async h=>this.actor.update({"system.health.bonus":Number(h.find("#bonus").val())||0}));
  }
  async _editFocus(){
    const s=mergeDefaults(this.actor.system);
    showDialog(`<div class="sh-dialog"><label>Дополнительный максимум фокуса</label><input id="bonus" type="number" value="${s.focus.bonus}"></div>`,"Настройки фокуса",async h=>this.actor.update({"system.focus.bonus":Number(h.find("#bonus").val())||0}));
  }
  async _editInitiative(){
    const s=mergeDefaults(this.actor.system);
    showDialog(`<div class="sh-dialog"><label>Поправка инициативы</label><input id="bonus" type="number" value="${s.initiative.bonus}"></div>`,"Настройки инициативы",async h=>this.actor.update({"system.initiative.bonus":Number(h.find("#bonus").val())||0}));
  }
  async _sleep(){
    const s=mergeDefaults(this.actor.system),hp=resourceMax(s.stats.endurance.value,s.health.bonus),focus=resourceMax(s.stats.vigilance.value,s.focus.bonus);
    await this.actor.update({"system.karma":s.rank,"system.health.value":hp,"system.focus.value":focus});
  }
  async _editStat(key){
    const s=mergeDefaults(this.actor.system).stats[key];
    showDialog(`<div class="sh-dialog"><label>Изменение характеристики (от 10)</label><input id="value" type="number" value="${s.value-10}">
      <label>Изменение защиты</label><input id="defense" type="number" value="${s.defense}">
      <label>Изменение вне боя</label><input id="nonCombat" type="number" value="${s.nonCombat}">
      <label>Изменение попадания</label><input id="hit" type="number" value="${s.hit}">
      <label>Изменение множителя урона</label><input id="multiplier" type="number" value="${s.multiplier}">
      <label>Изменение стабильного урона</label><input id="stable" type="number" value="${s.stable}"></div>`,
      `Настройки — ${game.i18n.localize(`SUPERHEROES.Stat.${key}`)}`,async h=>{
        const p=`system.stats.${key}.`;
        await this.actor.update({[p+"value"]:10+(Number(h.find("#value").val())||0),[p+"defense"]:Number(h.find("#defense").val())||0,[p+"nonCombat"]:Number(h.find("#nonCombat").val())||0,[p+"hit"]:Number(h.find("#hit").val())||0,[p+"multiplier"]:Number(h.find("#multiplier").val())||0,[p+"stable"]:Number(h.find("#stable").val())||0});
      });
  }
  async _editBiography(){
    const root=this.element?.[0]||this.element;
    const editing=root?.classList.toggle("biography-editing");
    root?.querySelectorAll("[data-bio-field]").forEach(el=>{el.readOnly=!editing;el.classList.toggle("editable",!!editing);});
    const button=root?.querySelector("[data-action=\"edit-bio\"]");
    if(button) button.title=editing?"Завершить редактирование":"Редактировать биографию";
    if(editing) root?.querySelector("[data-bio-field=\"nickname\"]")?.focus();
  }
  async _editToken(){
    try{
      const token=this.actor.prototypeToken;
      if(typeof TokenConfig==="function"){new TokenConfig(token).render(true);}
      else if(foundry?.applications?.sheets?.TokenConfig){new foundry.applications.sheets.TokenConfig({document:token}).render(true);}
      else ui.notifications.warn("Окно настройки токена недоступно в этой версии Foundry.");
    }catch(err){console.error(err);ui.notifications.error("Не удалось открыть настройки токена.");}
  }
  async _editListItem(type,index){
    const s=mergeDefaults(this.actor.system),item=index>=0?(s[type][index]||{}):{name:"",description:""},power=type==="powers";
    const content=power?`<div class="sh-dialog"><label>Название</label><input id="name" value="${safe(item.name)}"><label>Тип перемещения</label><input id="movement" value="${safe(item.movement)}"><label>Стоимость</label><input id="cost" value="${safe(item.cost)}"><label>Дальность</label><input id="range" value="${safe(item.range)}"><label>Тип урона</label><input id="damageType" value="${safe(item.damageType)}"><label>Описание</label><textarea id="description">${safe(item.description)}</textarea></div>`:`<div class="sh-dialog"><label>Название</label><input id="name" value="${safe(item.name)}"><label>Описание</label><textarea id="description">${safe(item.description)}</textarea></div>`;
    showDialog(content,`${index<0?"Добавить":"Изменить"} — ${power?"Способность":type==="traits"?"Черта":"Снаряжение"}`,async h=>{
      const next={name:h.find("#name").val(),description:h.find("#description").val()};
      if(power){next.movement=h.find("#movement").val();next.cost=h.find("#cost").val();next.range=h.find("#range").val();next.damageType=h.find("#damageType").val();}
      const arr=clone(s[type]);if(index<0)arr.push(next);else arr[index]=next;
      await this.actor.update({[`system.${type}`]:arr});
    });
  }
  async _deleteListItem(type,index){const s=mergeDefaults(this.actor.system),arr=clone(s[type]);arr.splice(index,1);await this.actor.update({[`system.${type}`]:arr});}
  async _sendItem(type,index){
    const item=mergeDefaults(this.actor.system)[type][index];if(!item)return;
    const esc=foundry.utils.escapeHTML,title=type==="powers"?"СПОСОБНОСТЬ":type==="traits"?"ЧЕРТА":"СНАРЯЖЕНИЕ";
    const meta=type==="powers"?[item.movement&&`<span>Перемещение: ${esc(item.movement)}</span>`,item.cost&&`<span>Стоимость: ${esc(item.cost)}</span>`,item.range&&`<span>Дальность: ${esc(item.range)}</span>`,item.damageType&&`<span>Тип урона: ${esc(item.damageType)}</span>`].filter(Boolean).join(""):"";
    await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this.actor}),content:`<div class="sh-chat-card"><div class="chat-title">${title}</div><h3>${esc(item.name||"Без названия")}</h3>${meta?`<div class="power-meta">${meta}</div>`:""}<p>${esc(item.description||"")}</p></div>`});
  }
}
Hooks.once("init",()=>{
  Handlebars.registerHelper("concat",(a,b)=>`${a??""}${b??""}`);
  CONFIG.Dice.terms.s=SuperheroesDie;
  if(!CONFIG.Dice.types.includes(SuperheroesDie))CONFIG.Dice.types.push(SuperheroesDie);
  Roll.TOOLTIP_TEMPLATE="systems/superheroes/templates/chat/roll-breakdown.hbs";
  Roll.CHAT_TEMPLATE="systems/superheroes/templates/dice/roll.hbs";
  Actors.registerSheet("superheroes",SuperheroesActorSheet,{types:["character"],makeDefault:true,label:"Лист персонажа"});
});
Hooks.once("ready",()=>{if(game.dice3d)registerDiceSoNice(game.dice3d);});
Hooks.once("diceSoNiceReady",dice3d=>registerDiceSoNice(dice3d));
function registerDiceSoNice(dice3d){
  try{
    dice3d.addDicePreset({type:"s",labels:["★","2","3","4","5","6"],colorset:"red",system:"standard"});
    dice3d.addDicePreset({type:"d6",labels:["1","2","3","4","5","6"],colorset:"white",system:"standard"});
  }catch(err){console.warn("Супергерои | Dice So Nice",err);}
}
Hooks.once("ready",()=>{
  for(const actor of game.actors.contents){
    const s=mergeDefaults(actor.system);
    if(actor.system?.health?.value>resourceMax(s.stats.endurance.value,s.health.bonus))actor.update({"system.health.value":resourceMax(s.stats.endurance.value,s.health.bonus)});
    if(actor.system?.focus?.value>resourceMax(s.stats.vigilance.value,s.focus.bonus))actor.update({"system.focus.value":resourceMax(s.stats.vigilance.value,s.focus.bonus)});
  }
});
Hooks.on("preCreateActor",(actor)=>actor.updateSource({system:mergeDefaults(actor.system)}));
Hooks.on("preUpdateActor",(actor,changes)=>{
  const s=mergeDefaults(foundry.utils.mergeObject(clone(actor.system),changes.system||{}, {inplace:false,recursive:true}));
  const hp=resourceMax(s.stats.endurance.value,s.health.bonus),focus=resourceMax(s.stats.vigilance.value,s.focus.bonus);
  if(s.health.value>hp)foundry.utils.setProperty(changes,"system.health.value",hp);
  if(s.focus.value>focus)foundry.utils.setProperty(changes,"system.focus.value",focus);
  if(foundry.utils.hasProperty(changes,"name"))foundry.utils.setProperty(changes,"system.biography.name",changes.name);
});
Hooks.on("renderChatMessage",(message,html)=>{
  const root=html[0]||html;
  root.querySelectorAll("button.retroEdgeMode").forEach(button=>{
    button.addEventListener("click",async e=>{
      e.preventDefault(); e.stopPropagation();
      const action=e.currentTarget.dataset.retroAction;
      const dieIndex=Number(e.currentTarget.dataset.index);
      try { await rerollSuperheroesDie(message.id,dieIndex,action==="edge"?"edge":"trouble"); }
      catch(err){ console.error("Супергерои | переброс",err); ui.notifications.error("Не удалось перебросить кость."); }
    });
  });
});
window.SuperheroesSystem={SuperheroesDie,createCheckRoll,createNonCombatRoll,createAttackRoll,rerollSuperheroesDie};
