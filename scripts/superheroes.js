/* СУПЕРГЕРОИ — Foundry VTT v12 */
const SH_DEFAULTS = {
  rank: 1,
  karma: 1,
  health: {value: 10, bonus: 0},
  focus: {value: 10, bonus: 0},
  initiative: {bonus: 0},
  biography: {name:"", nickname:"", age:"", gender:"", height:"", weight:"", eyes:"", hair:"", history:"", notes:""},
  stats: {
    strength:{value:10, defense:0, nonCombat:0, hit:0, multiplier:0, stable:0},
    agility:{value:10, defense:0, nonCombat:0, hit:0, multiplier:0, stable:0},
    endurance:{value:10, defense:0, nonCombat:0, hit:0, multiplier:0, stable:0},
    vigilance:{value:10, defense:0, nonCombat:0, hit:0, multiplier:0, stable:0},
    ego:{value:10, defense:0, nonCombat:0, hit:0, multiplier:0, stable:0},
    logic:{value:10, defense:0, nonCombat:0, hit:0, multiplier:0, stable:0}
  },
  powers: [], traits: [], gear: []
};

function deepClone(o){ return foundry.utils.deepClone(o); }

function mergeDefaults(source={}) {
  const d = deepClone(SH_DEFAULTS);
  foundry.utils.mergeObject(d, source, {inplace:true, recursive:true});
  for (const key of Object.keys(d.stats)) {
    const s=d.stats[key];
    s.value=Number.isFinite(Number(s.value)) ? Number(s.value) : 10;
    for (const k of ["defense","nonCombat","hit","multiplier","stable"])
      s[k]=Number.isFinite(Number(s[k])) ? Number(s[k]) : 0;
  }
  d.rank=Math.min(5,Math.max(1,Number(d.rank)||1));
  d.karma=Math.max(0,Number.isFinite(Number(d.karma))?Number(d.karma):d.rank);
  d.health.value=Math.max(0,Number(d.health.value)||0);
  d.focus.value=Math.max(0,Number(d.focus.value)||0);
  d.health.bonus=Number(d.health.bonus)||0;
  d.focus.bonus=Number(d.focus.bonus)||0;
  d.initiative.bonus=Number(d.initiative.bonus)||0;
  return d;
}

function statMod(value){ return Number(value)-10; }

function resourceMax(statValue, bonus=0){
  const v=Number(statValue);
  const base=v<=10 ? 10 : 30*(v-10);
  return Math.max(10,base+Number(bonus||0));
}

function statDerived(actor,key){
  const s=mergeDefaults(actor.system).stats[key];
  const rank=Number(actor.system.rank)||1;
  const mod=statMod(s.value);
  return {
    value:s.value,
    mod,
    defense:s.value+Number(s.defense||0),
    nonCombat:s.value+Number(s.nonCombat||0),
    hit:s.value+Number(s.hit||0),
    stable:mod+Number(s.stable||0),
    multiplier:rank+Number(s.multiplier||0)
  };
}

function randomD6(){ return Math.floor(Math.random()*6)+1; }

async function renderSuperRoll(data){
  const payload=foundry.utils.deepClone(data);
  const msg=await ChatMessage.create({
    speaker:ChatMessage.getSpeaker({actor:data.actor}),
    content:"<div class=\"sh-chat-card\"><div class=\"chat-title\">Бросок…</div></div>",
    flags:{superheroes:{roll:payload}}
  });
  payload._id=msg.id;
  const html=await foundry.applications.handlebars.renderTemplate(
    "systems/superheroes-foundry/templates/roll-card.hbs",payload
  );
  await msg.update({content:html,flags:{superheroes:{roll:payload}}});
}

async function roll3d6(actor,label,statKey){
  const s=statDerived(actor,statKey);
  const dice=[randomD6(),randomD6(),randomD6()];
  const critical=dice[1]===1;
  const totalDice=critical ? 6 : dice.reduce((a,b)=>a+b,0);
  await renderSuperRoll({
    actor,kind:"check",label,statKey,dice,modifier:s.mod,
    total:totalDice+s.mod,critical,rerolled:false
  });
}

async function rollNonCombat(actor,statKey){
  const s=statDerived(actor,statKey);
  const dice=[randomD6(),randomD6(),randomD6()];
  const critical=dice[1]===1;
  const totalDice=critical ? 6 : dice.reduce((a,b)=>a+b,0);
  await renderSuperRoll({
    actor,kind:"check",
    label:`${game.i18n.localize(`SUPERHEROES.Stat.${statKey}`)} — Вне боя`,
    statKey,dice,modifier:s.mod,total:totalDice+s.mod,critical,nonCombat:true,rerolled:false
  });
}

async function rollAttack(actor,statKey){
  const s=statDerived(actor,statKey);
  const d6=randomD6();
  const total=d6*s.multiplier+s.stable;
  await renderSuperRoll({
    actor,kind:"attack",
    label:`Атака — ${game.i18n.localize(`SUPERHEROES.Stat.${statKey}`)}`,
    statKey,dice:[d6],multiplier:s.multiplier,modifier:s.stable,total,critical:false
  });
}

async function rerollDie(messageId,dieIndex){
  const msg=game.messages.get(messageId);
  if(!msg) return;
  const flag=foundry.utils.deepClone(msg.flags?.superheroes?.roll);
  if(!flag || flag.kind!=="check" || !Array.isArray(flag.dice)) return;
  if(!Number.isInteger(dieIndex) || dieIndex<0 || dieIndex>2) return;
  flag.dice[dieIndex]=randomD6();
  flag.critical=flag.dice[1]===1;
  const sum=flag.critical ? 6 : flag.dice.reduce((a,b)=>a+b,0);
  flag.total=sum+Number(flag.modifier||0);
  flag.rerolled=true;
  const html=await foundry.applications.handlebars.renderTemplate(
    "systems/superheroes-foundry/templates/roll-card.hbs",flag
  );
  await msg.update({content:html,flags:{superheroes:{roll:flag}}});
}

class SuperheroesActorSheet extends ActorSheet {
  static get defaultOptions(){
    return foundry.utils.mergeObject(super.defaultOptions,{
      classes:["superheroes","sheet","actor"],
      template:"systems/superheroes-foundry/templates/actor-sheet.hbs",
      width:1100,height:820,resizable:true,submitOnChange:false
    });
  }

  getData(options={}){
    const data=super.getData(options);
    const system=mergeDefaults(this.actor.system);
    const maxHP=resourceMax(system.stats.endurance.value,system.health.bonus);
    const maxFocus=resourceMax(system.stats.vigilance.value,system.focus.bonus);
    system.health.value=Math.min(system.health.value,maxHP);
    system.focus.value=Math.min(system.focus.value,maxFocus);
    const stats={};
    for(const [key,s] of Object.entries(system.stats))
      stats[key]={...s,...statDerived(this.actor,key)};
    data.system=system;
    data.derived={
      maxHP,maxFocus,maxKarma:system.rank,
      initiative:system.stats.vigilance.value-10+Number(system.initiative.bonus||0),
      stats
    };
    data.editable=this.isEditable;
    return data;
  }

  activateListeners(html){
    super.activateListeners(html);

    html.find("[data-action='roll-check']").click(ev=>{
      const key=ev.currentTarget.dataset.stat;
      roll3d6(this.actor,game.i18n.localize(`SUPERHEROES.Stat.${key}`),key);
    });
    html.find("[data-action='roll-noncombat']").click(ev=>{
      rollNonCombat(this.actor,ev.currentTarget.dataset.stat);
    });
    html.find("[data-action='roll-attack']").click(ev=>rollAttack(this.actor,ev.currentTarget.dataset.stat));
    html.find("[data-action='edit-stat']").click(ev=>this._editStat(ev.currentTarget.dataset.stat));
    html.find("[data-action='edit-resources']").click(()=>this._editResources());
    html.find("[data-action='edit-power']").click(ev=>this._editListItem("powers",Number(ev.currentTarget.dataset.index)));
    html.find("[data-action='edit-trait']").click(ev=>this._editListItem("traits",Number(ev.currentTarget.dataset.index)));
    html.find("[data-action='edit-gear']").click(ev=>this._editListItem("gear",Number(ev.currentTarget.dataset.index)));
    html.find("[data-action='add-power']").click(()=>this._editListItem("powers",-1));
    html.find("[data-action='add-trait']").click(()=>this._editListItem("traits",-1));
    html.find("[data-action='add-gear']").click(()=>this._editListItem("gear",-1));
    html.find("[data-action='delete-item']").click(ev=>this._deleteListItem(ev.currentTarget.dataset.type,Number(ev.currentTarget.dataset.index)));
    html.find("[data-action='toggle-description']").click(ev=>{
      ev.currentTarget.closest(".expandable")?.classList.toggle("expanded");
    });
    html.find("[data-action='edit-bio']").click(()=>this._editBiography());
    html.find("[data-action='edit-system']").click(()=>this._editSystem());
    html.find("[data-action='edit-rank']").click(()=>this._editRank());

    html.find("input[data-action='resource-current']").change(async ev=>{
      const field=ev.currentTarget.dataset.field;
      const sys=mergeDefaults(this.actor.system);
      const max=field==="health"
        ? resourceMax(sys.stats.endurance.value,sys.health.bonus)
        : resourceMax(sys.stats.vigilance.value,sys.focus.bonus);
      const val=Math.min(Math.max(0,Number(ev.currentTarget.value)||0),max);
      await this.actor.update({[`system.${field}.value`]:val});
    });

    html.find(".tab-button").click(ev=>{
      html.find(".tab-button").removeClass("active");
      html.find(".tab-panel").removeClass("active");
      ev.currentTarget.classList.add("active");
      html.find(`.tab-panel[data-tab='${ev.currentTarget.dataset.tab}']`).addClass("active");
    });
  }

  async _editRank(){
    const sys=mergeDefaults(this.actor.system);
    const content=`<div class="sh-dialog"><label>Ранг (1–5)</label><input id="rank" type="number" min="1" max="5" value="${sys.rank}"></div>`;
    new Dialog({
      title:"Ранг",content,
      buttons:{
        save:{label:"Сохранить",callback:async html=>{
          const r=Math.min(5,Math.max(1,Number(html.find("#rank").val())||1));
          await this.actor.update({"system.rank":r});
          await this.actor.update({"system.karma":Math.min(sys.karma,r)});
        }},
        cancel:{label:"Отмена"}
      }
    }).render(true);
  }

  async _editResources(){
    const sys=mergeDefaults(this.actor.system);
    const content=`<div class="sh-dialog">
      <h3>Здоровье</h3><label>Дополнительный максимум</label><input id="hb" type="number" value="${sys.health.bonus}">
      <h3>Фокус</h3><label>Дополнительный максимум</label><input id="fb" type="number" value="${sys.focus.bonus}">
      <h3>Инициатива</h3><label>Поправка</label><input id="ib" type="number" value="${sys.initiative.bonus}">
    </div>`;
    new Dialog({
      title:"Настройки ресурсов",content,
      buttons:{
        save:{label:"Сохранить",callback:async html=>{
          await this.actor.update({
            "system.health.bonus":Number(html.find("#hb").val())||0,
            "system.focus.bonus":Number(html.find("#fb").val())||0,
            "system.initiative.bonus":Number(html.find("#ib").val())||0
          });
        }},
        cancel:{label:"Отмена"}
      }
    }).render(true);
  }

  async _editStat(key){
    const sys=mergeDefaults(this.actor.system),s=sys.stats[key];
    const content=`<div class="sh-dialog">
      <label>Базовая характеристика</label><input id="value" type="number" value="${s.value}">
      <label>Изменение защиты</label><input id="defense" type="number" value="${s.defense}">
      <label>Изменение вне боя</label><input id="nonCombat" type="number" value="${s.nonCombat}">
      <label>Изменение попадания</label><input id="hit" type="number" value="${s.hit}">
      <label>Изменение множителя урона</label><input id="multiplier" type="number" value="${s.multiplier}">
      <label>Изменение стабильного урона</label><input id="stable" type="number" value="${s.stable}">
    </div>`;
    new Dialog({
      title:`Настройки — ${game.i18n.localize(`SUPERHEROES.Stat.${key}`)}`,content,
      buttons:{
        save:{label:"Сохранить",callback:async html=>{
          const p=`system.stats.${key}.`;
          await this.actor.update({
            [`${p}value`]:Number(html.find("#value").val())||0,
            [`${p}defense`]:Number(html.find("#defense").val())||0,
            [`${p}nonCombat`]:Number(html.find("#nonCombat").val())||0,
            [`${p}hit`]:Number(html.find("#hit").val())||0,
            [`${p}multiplier`]:Number(html.find("#multiplier").val())||0,
            [`${p}stable`]:Number(html.find("#stable").val())||0
          });
        }},
        cancel:{label:"Отмена"}
      }
    }).render(true);
  }

  async _editBiography(){
    const b=mergeDefaults(this.actor.system).biography;
    const fields=[["name","Имя"],["nickname","Прозвище"],["age","Возраст"],["gender","Пол"],["height","Рост"],["weight","Вес"],["eyes","Глаза"],["hair","Волосы"]];
    const inputs=fields.map(([k,l])=>`<label>${l}</label><input id="${k}" value="${foundry.utils.escapeHTML(b[k]??"")}">`).join("");
    const content=`<div class="sh-dialog">${inputs}<label>История</label><textarea id="history">${foundry.utils.escapeHTML(b.history??"")}</textarea><label>Заметки</label><textarea id="notes">${foundry.utils.escapeHTML(b.notes??"")}</textarea></div>`;
    new Dialog({
      title:"Биография",content,
      buttons:{
        save:{label:"Сохранить",callback:async html=>{
          const update={};
          for(const [k] of fields) update[`system.biography.${k}`]=html.find(`#${k}`).val();
          update["system.biography.history"]=html.find("#history").val();
          update["system.biography.notes"]=html.find("#notes").val();
          await this.actor.update(update);
        }},
        cancel:{label:"Отмена"}
      }
    }).render(true);
  }

  async _editListItem(type,index){
    const sys=mergeDefaults(this.actor.system);
    const item=index>=0?sys[type][index]:{name:"",description:""};
    const isPower=type==="powers";
    const content=isPower?`<div class="sh-dialog">
      <label>Название</label><input id="name" value="${foundry.utils.escapeHTML(item.name||"")}">
      <label>Тип перемещения</label><input id="movement" value="${foundry.utils.escapeHTML(item.movement||"")}">
      <label>Стоимость</label><input id="cost" value="${foundry.utils.escapeHTML(item.cost||"")}">
      <label>Дальность</label><input id="range" value="${foundry.utils.escapeHTML(item.range||"")}">
      <label>Тип урона</label><input id="damageType" value="${foundry.utils.escapeHTML(item.damageType||"")}">
      <label>Описание</label><textarea id="description">${foundry.utils.escapeHTML(item.description||"")}</textarea>
    </div>`:`<div class="sh-dialog">
      <label>Название</label><input id="name" value="${foundry.utils.escapeHTML(item.name||"")}">
      <label>Описание</label><textarea id="description">${foundry.utils.escapeHTML(item.description||"")}</textarea>
    </div>`;
    new Dialog({
      title:`${index<0?"Добавить":"Изменить"} — ${isPower?"Способность":type==="traits"?"Черта":"Снаряжение"}`,
      content,
      buttons:{
        save:{label:"Сохранить",callback:async html=>{
          const next={name:html.find("#name").val(),description:html.find("#description").val()};
          if(isPower){
            next.movement=html.find("#movement").val();
            next.cost=html.find("#cost").val();
            next.range=html.find("#range").val();
            next.damageType=html.find("#damageType").val();
          }
          const arr=deepClone(sys[type]);
          if(index<0) arr.push(next); else if(index<arr.length) arr[index]=next; else return;
          await this.actor.update({[`system.${type}`]:arr});
        }},
        cancel:{label:"Отмена"}
      }
    }).render(true);
  }

  async _deleteListItem(type,index){
    const sys=mergeDefaults(this.actor.system),arr=deepClone(sys[type]);
    if(index<0||index>=arr.length)return;
    arr.splice(index,1);
    await this.actor.update({[`system.${type}`]:arr});
  }

  async _editSystem(){
    const sys=mergeDefaults(this.actor.system);
    const content=`<div class="sh-dialog"><p>Здесь можно изменить текущие ресурсы и служебные значения.</p>
      <label>Текущая Карма</label><input id="karma" type="number" min="0" value="${sys.karma}">
      <label>Бонус максимума Здоровья</label><input id="hb" type="number" value="${sys.health.bonus}">
      <label>Бонус максимума Фокуса</label><input id="fb" type="number" value="${sys.focus.bonus}">
      <label>Поправка инициативы</label><input id="ib" type="number" value="${sys.initiative.bonus}">
    </div>`;
    new Dialog({
      title:"Общие настройки",content,
      buttons:{
        save:{label:"Сохранить",callback:async html=>{
          await this.actor.update({
            "system.karma":Math.max(0,Number(html.find("#karma").val())||0),
            "system.health.bonus":Number(html.find("#hb").val())||0,
            "system.focus.bonus":Number(html.find("#fb").val())||0,
            "system.initiative.bonus":Number(html.find("#ib").val())||0
          });
        }},
        cancel:{label:"Отмена"}
      }
    }).render(true);
  }
}

Hooks.once("init",()=>{
  Actors.registerSheet("superheroes-foundry",SuperheroesActorSheet,{
    types:["character"],makeDefault:true,label:"Лист персонажа"
  });
  Handlebars.registerHelper("eq",(a,b)=>a===b);
  Handlebars.registerHelper("and",(a,b)=>Boolean(a&&b));
  Handlebars.registerHelper("concat",(a,b)=>`${a??""}${b??""}`);
});

Hooks.on("preCreateActor",(actor)=>{
  if(actor.type!=="character")return;
  actor.updateSource({system:mergeDefaults(actor.system)});
});

Hooks.on("renderChatMessage",(message,html)=>{
  const root=html?.[0]||html;
  root?.querySelectorAll("[data-action='reroll-die']").forEach(btn=>{
    btn.addEventListener("click",()=>rerollDie(btn.dataset.messageId,Number(btn.dataset.die)),{once:true});
  });
});

window.SuperheroesSystem={roll3d6,rollAttack,rerollDie};
