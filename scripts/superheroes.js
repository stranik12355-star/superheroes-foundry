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
  for(const key of ["powers","traits","gear"]){
    if(!Array.isArray(d[key])) d[key]=[];
    d[key]=d[key].map(item=>({name:String(item?.name??""),description:String(item?.description??""),...(key==="powers"?{movement:String(item?.movement??""),cost:String(item?.cost??""),range:String(item?.range??""),damageType:String(item?.damageType??"")}: {})}));
  }
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

/* Броски 3d6: три отдельные кости, центральная использует специальный тип s.
   Это намеренно не PoolTerm: так проще надёжно адресовать каждую кость для Edge/Trouble. */
class SuperheroesDie extends foundry.dice.terms.Die {
  static DENOMINATION = "s";
  constructor(termData={}) { super({...termData, faces: 6}); }
  getResultLabel(result) { return Number(result?.result) === 1 ? "★" : String(result?.result ?? ""); }
  getResultCSS(result) {
    const css = ["superheroes-die", "die", "d6"];
    if (Number(result?.result) === 1) css.push("superheroes-critical");
    if (result?.discarded) css.push("discarded");
    return css;
  }
}
function effectiveResult(v) {
  const n = Number(v ?? 0);
  return n === 1 ? 6 : n;
}
function getThreeDice(roll) {
  if (!roll) return [];
  return roll.terms.filter(t => t instanceof foundry.dice.terms.Die).slice(0,3).map((die,i) => {
    const active = [...die.results].reverse().find(r => r.active) || die.results[die.results.length-1];
    const result = Number(active?.result ?? 0);
    return {result, effective: effectiveResult(result), critical: i === 1 && result === 1};
  });
}
function diceCard(label, values, total, critical=false, messageId="") {
  const dies = values.map((v,i) => `
    <div class="superheroes-die-cell">
      <div class="superheroes-chat-die ${i===1?"middle":""} ${v.critical?"critical":""}">${v.critical?"★":v.result}</div>
      <div class="superheroes-reroll-row">
        <button type="button" data-action="superheroes-reroll" data-message-id="${messageId}" data-die-index="${i}" data-mode="edge">Преимущество</button>
        <button type="button" data-action="superheroes-reroll" data-message-id="${messageId}" data-die-index="${i}" data-mode="trouble">Помеха</button>
      </div>
    </div>`).join("");
  return `<div class="superheroes-chat-card ${critical?"critical":""}" data-superheroes-roll="true">
    <div class="superheroes-roll-title">${foundry.utils.escapeHTML(label)}</div>
    <div class="superheroes-dice-row">${dies}</div>
    <div class="superheroes-chat-total"><span>ИТОГ</span><strong>${total}</strong></div>
    ${critical?'<div class="critical-note">КРИТИЧЕСКИЙ РЕЗУЛЬТАТ</div>':""}
  </div>`;
}
async function sendCheckRoll(actor,key,label,nonCombat=false) {
  const s=statDerived(actor,key);
  const formula="1d6 + 1ds + 1d6";
  const roll=new Roll(formula);
  await roll.evaluate({async:true});
  const values=getThreeDice(roll);
  const total=values.reduce((a,v)=>a+v.effective,0)+s.mod;
  const content=diceCard(label,values,total,values[1]?.critical,"");
  const message=await ChatMessage.create({
    speaker:ChatMessage.getSpeaker({actor}),
    flavor:label,
    content,
    rolls:[roll],
    flags:{superheroes:{type:"3d6",statKey:key,kind:nonCombat?"nonCombat":"check",modifier:s.mod,dice:values.map(v=>v.result)}}
  });
  await message.update({content:diceCard(label,values,total,values[1]?.critical,message.id)});
  return roll;
}
async function createCheckRoll(actor,key,label){return sendCheckRoll(actor,key,label,false);}
async function createNonCombatRoll(actor,key){return sendCheckRoll(actor,key,`${game.i18n.localize(`SUPERHEROES.Stat.${key}`)} — Вне боя`,true);}
async function createAttackRoll(actor,key){
  const s=statDerived(actor,key);
  const diceCount=Math.max(1,Number(s.multiplier)||1);
  const roll=new Roll(`${diceCount}d6`);
  await roll.evaluate({async:true});
  const total=roll.total+s.stable;
  const formula=`(${diceCount}d6 × ${diceCount}) + ${s.stable}`;
  await ChatMessage.create({
    speaker:ChatMessage.getSpeaker({actor}),
    flavor:`Атака — ${game.i18n.localize(`SUPERHEROES.Stat.${key}`)}`,
    content:`<div class="superheroes-chat-card attack-card"><div class="superheroes-roll-title">АТАКА — ${foundry.utils.escapeHTML(game.i18n.localize(`SUPERHEROES.Stat.${key}`))}</div><div class="attack-roll"><span>${formula}</span><strong>${total}</strong></div></div>`,
    rolls:[roll],flags:{superheroes:{type:"attack",key}}
  });
  return roll;
}
async function rerollSuperheroesDie(messageId,dieIndex,mode="edge"){
  const message=game.messages.get(messageId);
  const flag=message?.flags?.superheroes;
  if(!message || !flag || flag.type!=="3d6" || ![0,1,2].includes(dieIndex)) return;
  const oldValues=(flag.dice||[]).map(Number);
  if(oldValues.length!==3) return;
  const isMiddle=dieIndex===1;
  const reroll=new Roll(isMiddle ? "1ds" : "1d6");
  await reroll.evaluate({async:true});
  const die=reroll.terms.find(t=>t instanceof foundry.dice.terms.Die);
  const active=[...die.results].reverse().find(r=>r.active)||die.results[die.results.length-1];
  const newValue=Number(active?.result||0);
  const oldEff=effectiveResult(oldValues[dieIndex]), newEff=effectiveResult(newValue);
  const keepNew=mode==="edge" ? newEff>=oldEff : newEff<=oldEff;
  if(keepNew) oldValues[dieIndex]=newValue;
  const values=oldValues.map((result,i)=>({result,effective:effectiveResult(result),critical:i===1&&result===1}));
  const total=values.reduce((a,v)=>a+v.effective,0)+Number(flag.modifier||0);
  await message.update({
    content:diceCard(message.flavor?.content ?? message.flavor ?? "Бросок",values,total,values[1].critical,message.id),
    flags:{superheroes:{...flag,dice:oldValues}}
  });
  if(game.dice3d?.showForRoll) {
    try { await game.dice3d.showForRoll(reroll,game.user,true); } catch(e) {}
  }
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
    const b=mergeDefaults(this.actor.system).biography;
    const fields=[["nickname","Прозвище"],["age","Возраст"],["gender","Пол"],["height","Рост"],["weight","Вес"],["eyes","Глаза"],["hair","Волосы"]];
    const inputs=fields.map(([k,l])=>`<label>${l}</label><input id="${k}" value="${safe(b[k])}">`).join("");
    showDialog(`<div class="sh-dialog"><label>Имя персонажа</label><input id="actorName" value="${safe(this.actor.name)}">${inputs}<label>История</label><textarea id="history">${safe(b.history)}</textarea><label>Заметки</label><textarea id="notes">${safe(b.notes)}</textarea></div>`,
      "Биография",async h=>{
        const u={"name":h.find("#actorName").val(),"system.biography.name":h.find("#actorName").val()};
        for(const [k] of fields)u[`system.biography.${k}`]=h.find("#"+k).val();
        u["system.biography.history"]=h.find("#history").val();u["system.biography.notes"]=h.find("#notes").val();
        await this.actor.update(u);
      });
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
  root.querySelectorAll("[data-action='superheroes-reroll']").forEach(button=>{
    button.addEventListener("click",async e=>{
      e.preventDefault();e.stopPropagation();
      const card=e.currentTarget.closest(".chat-message"),id=card?.dataset?.messageId||message.id;
      await rerollSuperheroesDie(id,Number(e.currentTarget.dataset.dieIndex),e.currentTarget.dataset.mode);
    });
  });
});
window.SuperheroesSystem={SuperheroesDie,createCheckRoll,createNonCombatRoll,createAttackRoll,rerollSuperheroesDie};
