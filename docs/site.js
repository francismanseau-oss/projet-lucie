(()=>{'use strict';const buttons=document.querySelectorAll('[data-set-lang]');const saved=localStorage.getItem('boreales-lang');function setLang(lang){if(!['fr','en'].includes(lang))lang='fr';document.documentElement.lang=lang==='fr'?'fr-CA':'en-CA';document.querySelectorAll('[data-fr][data-en]').forEach(el=>{el.textContent=el.dataset[lang]});buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.setLang===lang)));localStorage.setItem('boreales-lang',lang);window.dispatchEvent(new CustomEvent('boreales-lang-changed',{detail:{lang}}))}buttons.forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.setLang)));const browserLang=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'fr']).find(l=>/^fr(?:-|$)|^en(?:-|$)/i.test(l));setLang(saved||(/^en(?:-|$)/i.test(browserLang||'')?'en':'fr'));const y=document.getElementById('year');if(y)y.textContent=new Date().getFullYear();const menu=document.querySelector('.menu-toggle'),nav=document.getElementById('main-menu');if(menu&&nav)menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});document.querySelectorAll('#main-menu a').forEach(a=>{if(a.getAttribute('href')===location.pathname.split('/').pop()||(!location.pathname.split('/').pop()&&a.getAttribute('href')==='index.html'))a.setAttribute('aria-current','page')});})();
;(()=>{const filters=document.querySelectorAll('.shop-filter'),cards=[...document.querySelectorAll('.shop-product')],title=document.getElementById('shop-title'),sort=document.getElementById('shop-sort'),grid=document.querySelector('.shop-products');if(!grid)return;let shopAudience='tous',shopCategory='all';
const kidsNote=document.createElement('p');
kidsNote.id='kids-zipper-note';
kidsNote.className='kids-zipper-note';
kidsNote.hidden=true;
const kidsIcon=document.createElement('img');
kidsIcon.className='kids-zipper-icon';
kidsIcon.alt='';
kidsIcon.width=30;
kidsIcon.height=30;
kidsIcon.setAttribute('aria-hidden','true');
const kidsCss=document.querySelector('link[href$="style.css"],link[href*="style.css?"]');
const kidsHref=kidsCss?kidsCss.getAttribute('href'):'style.css';
kidsIcon.src=kidsHref.replace(/style\.css.*$/,'')+'assets/icones/fermeture-eclair-28.png';
const kidsText=document.createElement('span');
kidsText.dataset.fr="Toutes nos mitaines pour bébés et enfants sont munies d'une fermeture éclair pour faciliter l'enfilage.";
kidsText.dataset.en="All our baby and children's mittens feature a zipper for easier dressing.";
kidsText.textContent=document.documentElement.lang.startsWith('en')?kidsText.dataset.en:kidsText.dataset.fr;
kidsNote.appendChild(kidsIcon);
kidsNote.appendChild(kidsText);
grid.parentNode.insertBefore(kidsNote,grid);
function applyShopFilters(){
  cards.forEach(c=>{
    const catOk=shopCategory==='all'||c.dataset.category===shopCategory;
    const aud=c.dataset.audience||'';
    let audOk=true;
    if(shopAudience!=='tous'){
      if(aud==='unisexe')audOk=shopAudience==='femmes'||shopAudience==='hommes';
      else audOk=aud===shopAudience;
    }
    c.hidden=!(catOk&&audOk);
  });
  kidsNote.hidden=!(shopCategory==='mitaines'&&(shopAudience==='tous'||shopAudience==='enfants'));
}
document.querySelectorAll('.audience-filter').forEach(b=>b.addEventListener('click',()=>{
  shopAudience=b.dataset.audience||'tous';
  document.querySelectorAll('.audience-filter').forEach(x=>x.classList.toggle('active',x===b));
  applyShopFilters();
}));
filters.forEach(b=>b.addEventListener('click',()=>{filters.forEach(x=>x.classList.toggle('active',x===b));shopCategory=b.dataset.filter||'all';applyShopFilters();if(title){const lab=b.querySelector('[data-fr]');if(lab){title.dataset.fr=lab.dataset.fr;title.dataset.en=lab.dataset.en;title.textContent=document.documentElement.lang.startsWith('en')?title.dataset.en:title.dataset.fr}}}));
fetch('catalog/audience.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(doc=>{
  const map=doc&&doc.products||{};
  cards.forEach(c=>{const row=map[c.dataset.productId];c.dataset.audience=row&&row.audience?row.audience:'';});
  applyShopFilters();
  window.dispatchEvent(new CustomEvent('boreales-audience-ready'));
}).catch(()=>{applyShopFilters();window.dispatchEvent(new CustomEvent('boreales-audience-ready'));});if(sort)sort.addEventListener('change',()=>{const ordered=[...cards].sort((a,b)=>sort.value==='name'?a.dataset.name.localeCompare(b.dataset.name,'fr'):cards.indexOf(a)-cards.indexOf(b));ordered.forEach(c=>grid.appendChild(c))});(function setupSizesAndCart(){
const en=()=>document.documentElement.lang.startsWith('en');
function iconSrc(file){
  const css=document.querySelector('link[href$="style.css"],link[href*="style.css?"]');
  const href=css?css.getAttribute('href'):'style.css';
  return href.replace(/style\.css.*$/,'')+'assets/icones/'+file;
}
function withoutZipperWords(text){
  return String(text||'')
    .replace(/,\s*munies d'une fermeture éclair/gi,'')
    .replace(/,\s*avec fermeture éclair/gi,'')
    .replace(/,\s*with zipper/gi,'')
    .replace(/\s+/g,' ')
    .trim();
}
const sizesApi=()=>window.BOREALES_PRODUCT_SIZES;
const LETTERS=['S','M','L','XL'];
const LETTER_LABELS={
  S:{fr:'Petit',en:'Small',abbrFr:'P',abbrEn:'S'},
  M:{fr:'Moyen',en:'Medium',abbrFr:'M',abbrEn:'M'},
  L:{fr:'Grand',en:'Large',abbrFr:'G',abbrEn:'L'},
  XL:{fr:'Très grand',en:'Extra Large',abbrFr:'TG',abbrEn:'XL'}
};
const FIXED_ONE_SIZE={
  'chapeau-dame-m-l-coyote':true
};
const ORDER_FALLBACK={
  label_fr:'Sur commande',
  label_en:'Made to order',
  delay_fr:'Environ 1 semaine de fabrication, puis le délai de livraison. En période de Noël, l’attente peut aller jusqu’à 3 semaines avant la livraison.',
  delay_en:'About 1 week to make, then shipping time. Around Christmas, the wait can be up to 3 weeks before delivery.'
};
let orderCopy=Object.assign({},ORDER_FALLBACK);
function letterScale(cfg,id){
  if(id&&FIXED_ONE_SIZE[id])return false;
  return !!(cfg&&cfg.sizes&&cfg.sizes.length&&cfg.sizes.every(sz=>LETTERS.includes(String(sz.code||'').toUpperCase())));
}
function buttonLabel(sz){
  const row=LETTER_LABELS[String(sz&&sz.code||'').toUpperCase()];
  if(row)return en()?row.abbrEn:row.abbrFr;
  return sizeName(sz);
}
function letterRows(cfg){
  const by={};
  (cfg.sizes||[]).forEach(sz=>{by[String(sz.code||'').toUpperCase()]=sz});
  return LETTERS.map(code=>{
    const sz=by[code]||null;
    const q=!sz||sz.qty_on_hand==null?null:Math.floor(Number(sz.qty_on_hand));
    return {code,sz,q,inStock:!!(sz&&q!=null&&q>0),soldOut:!!(sz&&q!=null&&q<=0)};
  });
}
function orderHref(productId,code){
  return 'creations-personnalisees.html?modele='+encodeURIComponent(productId)+'&taille='+encodeURIComponent(code)+'#mesure';
}
function chaleurHref(productId){
  return 'creations-personnalisees.html?modele='+encodeURIComponent(productId)+'&chaleur=1#mesure';
}
function paintOrderLink(a){
  const name=a.querySelector('.size-choice-name');
  const abbr=name?(en()?(name.dataset.en||''):(name.dataset.fr||'')):'';
  const full=name?(en()?(name.dataset.fullEn||abbr):(name.dataset.fullFr||abbr)):abbr;
  if(name)name.textContent=abbr;
  const caption=a.querySelector('.size-order-caption');
  if(caption)caption.textContent=en()?(a.dataset.labelEn||''):(a.dataset.labelFr||'');
  const label=(en()?(a.dataset.labelEn||''):(a.dataset.labelFr||''))+(full?', '+full:'')+'. '+(en()?(a.dataset.delayEn||''):(a.dataset.delayFr||''));
  a.setAttribute('aria-label',label);
  a.title=label;
}
function applyOrderCopy(){
  document.querySelectorAll('.size-order-note').forEach(el=>{
    el.dataset.fr=orderCopy.delay_fr;
    el.dataset.en=orderCopy.delay_en;
    el.textContent=en()?orderCopy.delay_en:orderCopy.delay_fr;
  });
  document.querySelectorAll('.size-choice-order').forEach(a=>{
    a.dataset.labelFr=orderCopy.label_fr;
    a.dataset.labelEn=orderCopy.label_en;
    a.dataset.delayFr=orderCopy.delay_fr;
    a.dataset.delayEn=orderCopy.delay_en;
    paintOrderLink(a);
  });
}
let simState={checked:false,ok:false,local:false,products:{}};
function localShopHost(){
  const h=location.hostname;
  return h==='localhost'||h==='127.0.0.1'||/^192\.168\.\d+\.\d+$/.test(h)||/^10\.\d+\.\d+\.\d+$/.test(h);
}
function unverifiedPhrase(){
  return en()?'Availability not verified':'Disponibilité non vérifiée';
}
function simRow(id,code){
  const product=simState.products&&simState.products[id];
  if(!product||!Array.isArray(product.sizes))return null;
  if(code)return product.sizes.find(s=>s.code===code)||null;
  return product.sizes.length===1?product.sizes[0]:null;
}
function publishSim(){
  window.BOREALES_SIM={
    local:!!simState.local,
    ok:!!simState.ok,
    checked:!!simState.checked,
    qty(id,size){
      const row=simRow(id,size);
      if(!row||row.qty_available==null)return null;
      return Math.floor(Number(row.qty_available));
    }
  };
  window.dispatchEvent(new Event('boreales-sim-ready'));
}
async function loadSim(){
  simState={checked:true,ok:false,local:localShopHost(),products:{}};
  if(!simState.local){publishSim();return;}
  try{
    const res=await fetch('http://127.0.0.1:8792/api/sim/availability',{cache:'no-store'});
    if(!res.ok)throw new Error('sim');
    const data=await res.json();
    if(!data||data.durable!==false||data.writes_real_inventory!==false||!data.products)throw new Error('sim');
    simState={checked:true,ok:true,local:true,products:data.products};
  }catch(e){
    simState={checked:true,ok:false,local:true,products:{}};
  }
  publishSim();
}
function effectiveQty(id,code,fileQty){
  const file=fileQty==null||fileQty===''?null:Math.floor(Number(fileQty));
  if(!localShopHost())return {state:'file',qty:Number.isFinite(file)?file:null};
  if(!simState.ok)return {state:'unverified',qty:null};
  const row=simRow(id,code);
  if(!row)return {state:'unverified',qty:null};
  if(row.qty_available==null)return {state:'order',qty:null};
  return {state:'live',qty:Math.floor(Number(row.qty_available))};
}
function stockText(q){
  const api=sizesApi();
  if(api&&api.stockPhrase)return api.stockPhrase(q);
  if(q==null)return '';
  if(q<=0)return en()?'Sold out':'Épuisé';
  if(en())return q===1?'1 in stock':(q+' in stock');
  return q===1?'1 en stock':(q+' en stock');
}
function stockPhraseLang(q,lang){
  const api=sizesApi();
  if(api&&api.stockPhrase)return api.stockPhrase(q,lang);
  const useEn=String(lang||'').toLowerCase().startsWith('en');
  if(q==null)return '';
  if(q<=0)return useEn?'Sold out':'Épuisé';
  if(useEn)return q===1?'1 in stock':(q+' in stock');
  return q===1?'1 en stock':(q+' en stock');
}
function availabilityCopy(cfg,id){
  const sizes=cfg&&cfg.sizes||[];
  const order={fr:orderCopy.label_fr,en:orderCopy.label_en,kind:'order'};
  const bySize={fr:'Stock selon la taille',en:'Stock varies by size',kind:'multi'};
  const unverified={fr:'Disponibilité non vérifiée',en:'Availability not verified',kind:'unverified'};
  if(localShopHost()&&!simState.ok)return unverified;
  const qOf=(sz)=>{
    const live=effectiveQty(id,sz&&sz.code,sz&&sz.qty_on_hand);
    return live.state==='live'?live.qty:null;
  };
  if(letterScale(cfg,id)||sizes.length>1){
    return sizes.some(sz=>qOf(sz)!=null)?bySize:order;
  }
  const only=sizes[0];
  if(!only)return order;
  const q=qOf(only);
  if(q==null)return order;
  return {fr:stockPhraseLang(q,'fr'),en:stockPhraseLang(q,'en'),kind:q<=0?'sold':'qty',qty:q};
}
function placeStock(cfg,id,btn){
  const info=btn.parentElement;
  let el=info.querySelector(':scope > .stock-availability');
  const copy=availabilityCopy(cfg,id);
  if(!el){
    el=document.createElement('p');
    el.className='stock-availability';
    info.insertBefore(el,btn);
  }
  el.dataset.fr=copy.fr;
  el.dataset.en=copy.en;
  el.textContent=en()?copy.en:copy.fr;
  el.classList.toggle('is-sold',copy.kind==='sold');
  el.classList.toggle('is-unverified',copy.kind==='unverified');
}
const ORDER_QTY_MAX=20;
function moneyCad(n){
  return (Math.round(Number(n)*100)/100).toFixed(2).replace('.',',')+' $';
}
function attachQtyPicker(parent,card,cfg,btn){
  if(parent.querySelector('.qty-picker'))return;
  const box=document.createElement('div');
  box.className='qty-picker';
  const ctrl=document.createElement('div');
  ctrl.className='qty-picker-ctrl';
  ctrl.setAttribute('role','group');
  const minus=document.createElement('button');
  minus.type='button';
  minus.className='qty-picker-btn';
  minus.textContent='−';
  const val=document.createElement('span');
  val.className='qty-picker-val';
  val.textContent='1';
  const plus=document.createElement('button');
  plus.type='button';
  plus.className='qty-picker-btn';
  plus.textContent='+';
  ctrl.appendChild(minus);
  ctrl.appendChild(val);
  ctrl.appendChild(plus);
  const sub=document.createElement('p');
  sub.className='qty-subtotal';
  const subLab=document.createElement('span');
  subLab.dataset.fr='Sous-total';
  subLab.dataset.en='Subtotal';
  subLab.textContent=en()?'Subtotal':'Sous-total';
  const subVal=document.createElement('span');
  subVal.className='qty-subtotal-val';
  sub.appendChild(subLab);
  sub.appendChild(document.createTextNode(' '));
  sub.appendChild(subVal);
  box.appendChild(ctrl);
  box.appendChild(sub);
  parent.appendChild(box);
  card._qty=1;
  function cartUsed(id,size){
    try{
      const cart=JSON.parse(localStorage.getItem('boreales-cart')||'[]');
      if(!Array.isArray(cart))return 0;
      return cart.reduce((sum,x)=>{
        if(!x||x.custom||x.id!==id)return sum;
        if(size&&x.size!==size)return sum;
        return sum+(Math.floor(Number(x.qty))||0);
      },0);
    }catch(e){return 0}
  }
  function limits(){
    const id=card.dataset.productId||btn.dataset.id;
    const multi=(cfg.selector&&cfg.sizes&&cfg.sizes.length>1)||letterScale(cfg,id);
    let sizeCode=null;
    let stockMax=null;
    let order=false;
    const fileRow=()=>multi?(cfg.sizes||[]).find(s=>s.code===sizeCode):(cfg.sizes&&cfg.sizes[0]);
    if(multi){
      sizeCode=selectedSize(card);
      if(!sizeCode)return {max:null,known:false,order:false};
    }else{
      const only=cfg.sizes&&cfg.sizes[0];
      sizeCode=only&&only.code;
    }
    const sz=fileRow();
    const live=effectiveQty(id,sizeCode,sz&&sz.qty_on_hand);
    if(live.state==='unverified')return {max:null,known:false,order:false,unverified:true};
    if(live.state==='order'||live.qty==null){stockMax=ORDER_QTY_MAX;order=true;}
    else stockMax=Math.max(0,live.qty);
    const room=Math.max(0,stockMax-cartUsed(id,sizeCode));
    return {max:room,known:true,order};
  }
  function sync(){
    const lim=limits();
    let q=Math.max(1,Math.floor(Number(card._qty)||1));
    if(lim.known&&lim.max>=1&&q>lim.max)q=lim.max;
    card._qty=q;
    val.textContent=String(q);
    minus.disabled=q<=1;
    plus.disabled=!lim.known||lim.max==null||q>=lim.max;
    const unit=Number(btn.dataset.price||0);
    subVal.textContent=moneyCad(unit*q);
    const qLab=en()?'Quantity':'Quantité';
    ctrl.setAttribute('aria-label',qLab);
    minus.setAttribute('aria-label',en()?'Decrease quantity':'Diminuer la quantité');
    plus.setAttribute('aria-label',en()?'Increase quantity':'Augmenter la quantité');
    plus.title=lim.known&&lim.max!=null&&q>=lim.max?(lim.order?(en()?'Maximum for a made-to-order item':'Maximum pour un article sur commande'):(en()?'Available stock reached':'Stock disponible atteint')):'';
  }
  card._syncQty=sync;
  minus.addEventListener('click',(ev)=>{ev.preventDefault();ev.stopPropagation();card._qty=Math.max(1,(card._qty||1)-1);sync();});
  plus.addEventListener('click',(ev)=>{
    ev.preventDefault();ev.stopPropagation();
    const lim=limits();
    if(!lim.known||lim.max==null||(card._qty||1)>=lim.max)return;
    card._qty=(card._qty||1)+1;
    sync();
  });
  sync();
}
function sizeName(sz){
  const api=sizesApi();
  if(api&&api.displayLabel)return api.displayLabel(sz.code,sz);
  return en()?(sz.label_en||sz.code):(sz.label_fr||sz.code);
}
function selectedSize(card){
  const picked=card.querySelector('.size-choice.is-selected:not([disabled])');
  return picked?picked.dataset.size:null;
}
function refreshAddBtn(card,cfg,btn,hint){
  if(!((cfg.selector&&cfg.sizes&&cfg.sizes.length>1)||letterScale(cfg,card&&card.dataset.productId))){
    const only=cfg.sizes&&cfg.sizes[0];
    const q=only&&only.qty_on_hand!=null?Math.floor(Number(only.qty_on_hand)):null;
    if(q!=null&&q<=0){
      btn.disabled=true;btn.classList.add('is-sold-out');
      const t=stockText(0);btn.textContent=t;btn.dataset.fr='Épuisé';btn.dataset.en='Sold out';
    }else{
      btn.disabled=false;btn.classList.remove('is-sold-out');
      btn.textContent=en()?btn.dataset.en:btn.dataset.fr;
    }
    return;
  }
  const code=selectedSize(card);
  if(hint){hint.hidden=true;hint.textContent='';}
  if(!code){
    btn.disabled=false;btn.classList.remove('is-sold-out');btn.classList.add('is-await-size');
    btn.textContent=en()?btn.dataset.en:btn.dataset.fr;
    return;
  }
  btn.classList.remove('is-await-size');
  const sz=cfg.sizes.find(x=>x.code===code);
  const q=sz&&sz.qty_on_hand!=null?Math.floor(Number(sz.qty_on_hand)):null;
  if(q!=null&&q<=0){
    btn.disabled=true;btn.classList.add('is-sold-out');
    btn.textContent=stockText(0);
    if(hint){hint.hidden=false;hint.textContent=stockText(0);}
    return;
  }
  btn.disabled=false;btn.classList.remove('is-sold-out');
  btn.textContent=en()?btn.dataset.en:btn.dataset.fr;
}
function buildChoice(sz,cfg,card,btn,hint){
  const q=sz.qty_on_hand==null?null:Math.floor(Number(sz.qty_on_hand));
  const sold=q!=null&&q<=0;
  const b=document.createElement('button');
  b.type='button';
  b.className='size-choice'+(sold?' is-sold-out':'');
  b.dataset.size=sz.code;
  if(sold)b.disabled=true;
  const name=document.createElement('span');
  name.className='size-choice-name';
  name.textContent=buttonLabel(sz);
  const stock=document.createElement('span');
  stock.className='size-choice-stock'+(sold?' is-sold':'');
  stock.textContent=stockText(q);
  b.appendChild(name);b.appendChild(stock);
  b.setAttribute('aria-label',sizeName(sz)+(stock.textContent?' , '+stock.textContent:''));
  b.title=sizeName(sz);
  if(!sold){
    b.addEventListener('click',(ev)=>{
      ev.stopPropagation();
      card.querySelectorAll('.size-choice').forEach(x=>x.classList.remove('is-selected'));
      b.classList.add('is-selected');
      refreshAddBtn(card,cfg,btn,hint);
      if(typeof card._syncQty==='function')card._syncQty();
    });
  }
  return b;
}
function buildOrderLink(code,productId){
  const labels=LETTER_LABELS[code]||{fr:code,en:code,abbrFr:code,abbrEn:code};
  const a=document.createElement('a');
  a.className='size-choice size-choice-order';
  a.href=orderHref(productId,code);
  a.dataset.size=code;
  a.dataset.labelFr=orderCopy.label_fr;
  a.dataset.labelEn=orderCopy.label_en;
  a.dataset.delayFr=orderCopy.delay_fr;
  a.dataset.delayEn=orderCopy.delay_en;
  const name=document.createElement('span');
  name.className='size-choice-name';
  name.dataset.fr=labels.abbrFr;
  name.dataset.en=labels.abbrEn;
  name.dataset.fullFr=labels.fr;
  name.dataset.fullEn=labels.en;
  name.textContent=en()?labels.abbrEn:labels.abbrFr;
  const line=document.createElement('span');
  line.className='size-order-line';
  const mark=document.createElement('img');
  mark.className='size-order-icon';
  mark.src=iconSrc('machine-coudre.png');
  mark.alt='';
  mark.width=26;
  mark.height=26;
  mark.setAttribute('aria-hidden','true');
  const caption=document.createElement('span');
  caption.className='size-order-caption';
  caption.textContent=en()?orderCopy.label_en:orderCopy.label_fr;
  line.appendChild(mark);
  line.appendChild(caption);
  a.appendChild(name);
  a.appendChild(line);
  paintOrderLink(a);
  a.addEventListener('click',ev=>ev.stopPropagation());
  return a;
}
function bindSizeReveal(card,wrap){
  const line=wrap.querySelector('.size-line');
  function fit(){
    if(!line||line.clientWidth<20)return;
    line.classList.remove('is-stacked');
    if(line.scrollWidth>line.clientWidth+1)line.classList.add('is-stacked');
  }
  function setOpen(open){
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(open){
      document.querySelectorAll('.shop-product.is-size-open').forEach(other=>{
        if(other!==card&&typeof other._setSizeOpen==='function') other._setSizeOpen(false);
      });
      card.classList.add('is-size-open');
      card.classList.remove('is-size-closing');
      card.setAttribute('aria-expanded','true');
      wrap.inert=false;
      wrap.setAttribute('aria-hidden','false');
      requestAnimationFrame(fit);
      return;
    }
    card.classList.remove('is-size-open');
    card.setAttribute('aria-expanded','false');
    wrap.setAttribute('aria-hidden','true');
    if(reduce){
      wrap.inert=true;
      card.classList.remove('is-size-closing');
      return;
    }
    card.classList.add('is-size-closing');
    let settled=false;
    const done=(ev)=>{
      if(settled)return;
      if(ev&&ev.target!==wrap)return;
      if(ev&&ev.propertyName!=='opacity')return;
      settled=true;
      wrap.removeEventListener('transitionend',done);
      if(card.classList.contains('is-size-open'))return;
      card.classList.remove('is-size-closing');
      wrap.inert=true;
    };
    wrap.addEventListener('transitionend',done);
    setTimeout(done,card.classList.contains('has-zipper')?280:1400);
  }
  card.classList.add('has-size-choice');
  card._setSizeOpen=setOpen;
  card.setAttribute('aria-expanded','false');
  if(!card.hasAttribute('tabindex'))card.tabIndex=0;
  wrap.inert=true;
  card.addEventListener('click',(ev)=>{
    if(ev.target.closest('.size-reveal, .demo-add, a, button, input, select, textarea, label'))return;
    setOpen(!card.classList.contains('is-size-open'));
  });
  card.addEventListener('keydown',(ev)=>{
    if(ev.key!=='Enter'&&ev.key!==' ')return;
    if(ev.target!==card)return;
    ev.preventDefault();
    setOpen(!card.classList.contains('is-size-open'));
  });
  if(typeof ResizeObserver!=='undefined'){
    const ro=new ResizeObserver(()=>fit());
    ro.observe(card);
  }
  fit();
}
const ZIPPER_MITTENS={
  'mitaines-8-10-vison-fermeture-eclair':true,
  'mitaines-bebe-sans-pouces-vison-fermeture-eclair':true,
  'mitaines-bebe-sans-pouces-8-24-mois-castor':true,
  'mitaines-bebe-sans-pouces-8-24-mois-vison':true,
  'mitaines-enfant-10-12-mouton-rase':true,
  'mitaines-enfant-2-4-ans-castor-fermeture-eclair':true,
  'mitaines-enfant-4-6-vison-fermeture-eclair':true,
  'mitaines-enfant-6-8-vison-fermeture-eclair':true,
  'mitaines-enfant-8-10-chat-sauvage':true,
  'mitaines-fille-8-10-renard':true
};
function attachZipper(card){
  const id=card.dataset.productId;
  if(!ZIPPER_MITTENS[id]||card.dataset.zipperReady)return;
  const desc=card.querySelector('.shop-product-desc');
  if(!desc)return;
  card.dataset.zipperReady='1';
  if(desc.dataset.fr){
    desc.dataset.fullFr=desc.dataset.fr;
    desc.dataset.fr=withoutZipperWords(desc.dataset.fr);
  }
  if(desc.dataset.en){
    desc.dataset.fullEn=desc.dataset.en;
    desc.dataset.en=withoutZipperWords(desc.dataset.en);
  }
  desc.textContent=en()?desc.dataset.en:desc.dataset.fr;
}
function zipperDetail(){
  const row=document.createElement('p');
  row.className='zipper-detail';
  const img=document.createElement('img');
  img.className='zipper-mark';
  img.src=iconSrc('fermeture-eclair-28.png');
  img.alt='';
  img.width=28;
  img.height=28;
  img.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.dataset.fr="Fermeture éclair pour faciliter l'enfilage";
  label.dataset.en='Zipper for easier dressing';
  label.textContent=en()?label.dataset.en:label.dataset.fr;
  row.appendChild(img);
  row.appendChild(label);
  return row;
}
function injectSelectors(doc){
  if(!doc||!doc.products)return;
  document.querySelectorAll('.shop-product').forEach(card=>{
    attachZipper(card);
    const btn=card.querySelector('.demo-add');
    const id=card.dataset.productId||(btn&&btn.dataset.id);
    if(!id||!btn)return;
    const cfg=doc.products[id];
    if(!cfg)return;
    const info=card.querySelector('.shop-product-info')||btn.parentElement;
    if(info.querySelector('.size-select-wrap')||info.querySelector('.size-stock-wrap'))return;

    const category=card.dataset.category||cfg.category||'';
    function attachSizeGuideBtn(parent,sizes){
      if(!category||!window.BOREALES_SIZE_GUIDE)return;
      if(parent.querySelector('.size-guide-btn'))return;
      const info=document.createElement('button');
      info.type='button';
      info.className='size-guide-btn';
      info.setAttribute('aria-haspopup','dialog');
      info.dataset.fr='Guide des grandeurs';
      info.dataset.en='Size guide';
      info.setAttribute('aria-label',en()?'Size guide':'Guide des grandeurs');
      info.title=en()?'Size guide':'Guide des grandeurs';
      // Un seul cercle (SVG) — pas de bordure bouton + ⓘ
      info.innerHTML='<svg class="size-guide-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle class="size-guide-ring" cx="10" cy="10" r="7.6" fill="none" stroke="#C23020" stroke-width="1.7"/><circle class="size-guide-idot" cx="10" cy="6.05" r="1.15" fill="#C23020" stroke="none"/><rect class="size-guide-istem" x="9.05" y="8.15" width="1.9" height="5.85" rx="0.95" fill="#C23020" stroke="none"/></svg>';
      info.addEventListener('pointerup',()=>{
        // évite le rectangle :focus après un clic souris / doigt
        if(info.matches(':focus-visible'))return;
        info.blur();
      });
      info.addEventListener('click',(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        const g=window.BOREALES_SIZE_GUIDE;
        if(!g||!g.open)return;
        const dlg=document.getElementById('size-guide-dialog');
        if(dlg){dlg.dataset.category=category;dlg._sizes=sizes||cfg.sizes||[];}
        g.open({category,sizes:sizes||cfg.sizes||[]});
        if(!info.matches(':focus-visible'))info.blur();
      });
      parent.appendChild(info);
    }
    function chaleurAllowed(target){
      const cat=(target&&target.dataset.category)||category||'';
      if(cat!=='mitaines'&&cat!=='pantoufles')return false;
      const aud=target&&target.dataset.audience||'';
      return aud==='femmes'||aud==='hommes';
    }
    function attachChaleur(parent){
      if(!chaleurAllowed(card))return;
      if(parent.querySelector('.chaleur-plus'))return;
      const a=document.createElement('a');
      a.className='chaleur-plus';
      a.href=chaleurHref(id);
      const img=document.createElement('img');
      img.className='chaleur-flame';
      img.src='assets/icones/flamme-chaleur.png';
      img.alt='';
      img.width=16;
      img.height=22;
      const label=document.createElement('span');
      label.className='chaleur-plus-label';
      label.dataset.fr='Chaleur +';
      label.dataset.en='Warmth +';
      label.textContent=en()?'Warmth +':'Chaleur +';
      a.setAttribute('aria-label',en()?'Extra warmth, made to measure':'Chaleur +, commande sur mesure');
      a.appendChild(img);
      a.appendChild(label);
      a.addEventListener('click',(ev)=>ev.stopPropagation());
      parent.appendChild(a);
    }
    function sizeLabelEl(){
      const title=document.createElement('p');
      title.className='size-select-label';
      title.dataset.fr='Taille';title.dataset.en='Size';
      title.textContent=en()?'Size':'Taille';
      return title;
    }
    const letter=letterScale(cfg,id);
    placeStock(cfg,id,btn);
    if((cfg.selector&&cfg.sizes&&cfg.sizes.length>1)||letter){
      const wrap=document.createElement('div');
      wrap.className='size-select-wrap size-reveal';
      wrap.dataset.productId=id;
      wrap.setAttribute('aria-hidden','true');
      const inner=document.createElement('div');
      inner.className='size-reveal-inner';
      const line=document.createElement('div');
      line.className='size-line';
      line.appendChild(sizeLabelEl());
      const list=document.createElement('div');
      list.className='size-choice-list';
      list.setAttribute('role','group');
      list.setAttribute('aria-label',en()?'Size':'Taille');
      const hint=document.createElement('p');
      hint.className='size-select-hint';
      hint.hidden=true;
      if(letter){
        letterRows(cfg).forEach(row=>{
          if(row.sz)list.appendChild(buildChoice(row.sz,cfg,card,btn,hint));
          else list.appendChild(buildOrderLink(row.code,id));
        });
      }else{
        cfg.sizes.forEach(sz=>list.appendChild(buildChoice(sz,cfg,card,btn,hint)));
      }
      line.appendChild(list);
      attachSizeGuideBtn(line,cfg.sizes);
      attachChaleur(line);
      inner.appendChild(line);
      if(letter&&letterRows(cfg).some(row=>!row.sz)){
        const note=document.createElement('p');
        note.className='size-order-note';
        note.dataset.fr=orderCopy.delay_fr;
        note.dataset.en=orderCopy.delay_en;
        note.textContent=en()?orderCopy.delay_en:orderCopy.delay_fr;
        inner.appendChild(note);
      }
      inner.appendChild(hint);
      if(ZIPPER_MITTENS[id]){
        inner.insertBefore(zipperDetail(),inner.firstChild);
        card.classList.add('has-zipper');
      }
      wrap.appendChild(inner);
      attachQtyPicker(inner,card,cfg,btn);
      btn.parentElement.insertBefore(wrap,btn);
      bindSizeReveal(card,wrap);
      refreshAddBtn(card,cfg,btn,hint);
    }else{
      const only=cfg.sizes&&cfg.sizes[0];
      const q=only&&only.qty_on_hand!=null?Math.floor(Number(only.qty_on_hand)):null;
      const openDetails=category==='mitaines'||category==='pantoufles';
      const wrap=document.createElement('div');
      wrap.className='size-stock-wrap'+(openDetails?' size-reveal':'');
      if(openDetails) wrap.setAttribute('aria-hidden','true');
      const head=document.createElement('div');
      head.className='size-select-head';
      head.appendChild(sizeLabelEl());
      attachSizeGuideBtn(head,cfg.sizes||[]);
      if(chaleurAllowed(card)) attachChaleur(head);
      const bucket=openDetails?document.createElement('div'):wrap;
      if(openDetails) bucket.className='size-reveal-inner';
      bucket.appendChild(head);
      if(only&&only.code==='unique'&&only.label_fr&&/universelle|universal/i.test(String(only.label_fr)+String(only.label_en||''))){
        const tip=document.createElement('p');
        tip.className='size-unique-note';
        tip.dataset.fr=only.label_fr;tip.dataset.en=only.label_en||only.label_fr;
        tip.textContent=en()?(only.label_en||only.label_fr):only.label_fr;
        bucket.appendChild(tip);
      }else if(only&&only.code&&only.code!=='unique'){
        const tip=document.createElement('p');
        tip.className='size-unique-note size-format-name';
        const api=sizesApi();
        const labFr=api&&api.displayLabel?api.displayLabel(only.code,only,'fr'):(only.label_fr||only.code);
        const labEn=api&&api.displayLabel?api.displayLabel(only.code,only,'en'):(only.label_en||only.code);
        const letterRow=LETTER_LABELS[String(only.code||'').toUpperCase()];
        tip.dataset.fr=letterRow?letterRow.abbrFr:labFr;
        tip.dataset.en=letterRow?letterRow.abbrEn:labEn;
        tip.dataset.fullFr=labFr;tip.dataset.fullEn=labEn;
        tip.textContent=en()?tip.dataset.en:tip.dataset.fr;
        tip.title=en()?labEn:labFr;
        bucket.appendChild(tip);
      }
      const stock=document.createElement('p');
      stock.className='size-choice-stock size-stock-solo'+(q!=null&&q<=0?' is-sold':'');
      stock.dataset.qty=q==null?'':String(q);
      stock.textContent=q==null?'':stockText(q);
      bucket.appendChild(stock);
      if(ZIPPER_MITTENS[id]){
        bucket.insertBefore(zipperDetail(),bucket.firstChild);
        card.classList.add('has-zipper');
      }
      if(openDetails) wrap.appendChild(bucket);
      attachQtyPicker(openDetails?bucket:wrap,card,cfg,btn);
      btn.parentElement.insertBefore(wrap,btn);
      if(openDetails) bindSizeReveal(card,wrap);
      refreshAddBtn(card,cfg,btn,null);
    }
  });

  window.addEventListener('boreales-lang-changed',()=>{
    const api=sizesApi();
    document.querySelectorAll('.size-select-label').forEach(el=>{
      el.textContent=en()?(el.dataset.en||'Size'):(el.dataset.fr||'Taille');
    });
    document.querySelectorAll('.chaleur-plus').forEach(el=>{
      el.setAttribute('aria-label',en()?'Extra warmth, made to measure':'Chaleur +, commande sur mesure');
    });
    document.querySelectorAll('.size-guide-btn').forEach(el=>{
      const lab=en()?(el.dataset.en||'Size guide'):(el.dataset.fr||'Guide des grandeurs');
      el.setAttribute('aria-label',lab);
      el.title=lab;
    });
    document.querySelectorAll('.size-unique-note').forEach(el=>{
      if(el.dataset.fr&&el.dataset.en)el.textContent=en()?el.dataset.en:el.dataset.fr;
      if(el.dataset.fullFr)el.title=en()?(el.dataset.fullEn||el.dataset.fullFr):el.dataset.fullFr;
    });
    document.querySelectorAll('.size-choice-order').forEach(paintOrderLink);
    document.querySelectorAll('.size-order-note').forEach(el=>{
      if(el.dataset.fr&&el.dataset.en)el.textContent=en()?el.dataset.en:el.dataset.fr;
    });
    document.querySelectorAll('.size-choice:not(.size-choice-order)').forEach(b=>{
      const card=b.closest('.shop-product');
      const id=card&&(card.dataset.productId||(card.querySelector('.demo-add')||{}).dataset.id);
      const cfg=api&&api.entry&&id?api.entry(id):null;
      const sz=cfg&&cfg.sizes?cfg.sizes.find(x=>x.code===b.dataset.size):null;
      if(!sz)return;
      const name=b.querySelector('.size-choice-name');
      const stock=b.querySelector('.size-choice-stock');
      if(name)name.textContent=buttonLabel(sz);
      if(name)b.title=sizeName(sz);
      if(name)b.setAttribute('aria-label',sizeName(sz)+(stock&&stock.textContent?' , '+stock.textContent:''));
      if(stock){
        const live=effectiveQty(id,sz.code,sz.qty_on_hand);
        stock.textContent=live.state==='unverified'?unverifiedPhrase():(live.qty==null?'':stockText(live.qty));
      }
    });
    document.querySelectorAll('.size-stock-solo').forEach(el=>{
      const card=el.closest('.shop-product');
      const id=card&&(card.dataset.productId||(card.querySelector('.demo-add')||{}).dataset.id);
      const cfg=api&&api.entry&&id?api.entry(id):null;
      const only=cfg&&cfg.sizes&&cfg.sizes[0];
      const live=id?effectiveQty(id,only&&only.code,el.dataset.qty):{state:'file',qty:null};
      if(live.state==='unverified'){el.textContent=unverifiedPhrase();return}
      const q=live.qty;
      if(q==null||!Number.isFinite(q))return;
      el.textContent=stockText(q);
    });
    document.querySelectorAll('.shop-product').forEach(card=>{
      if(typeof card._syncQty==='function')card._syncQty();
    });
    document.querySelectorAll('.demo-add.is-sold-out').forEach(b=>{
      b.textContent=stockText(0);
    });
  });
}
function cartLineKey(x){
  const api=sizesApi();
  if(api&&api.lineKey)return api.lineKey(x);
  return x.custom?String(x.id):(x.size?x.id+'|'+x.size:String(x.id));
}
document.querySelectorAll('.demo-add').forEach(b=>b.addEventListener('click',()=>{
  const id=b.dataset.id,price=Number(b.dataset.price||0),card=b.closest('.shop-product'),h3=card&&card.querySelector('h3'),name_fr=(h3&&h3.dataset.fr)||b.dataset.name||(card&&card.dataset.name)||'Article',name_en=(h3&&h3.dataset.en)||name_fr,name=en()?name_en:name_fr;
  if(!id||!price){alert(en()?'Preview only: purchases are not enabled yet.':'Aperçu seulement : les achats ne sont pas encore activés.');return}
  const api=sizesApi();
  const cfg=api&&api.entry?api.entry(id):null;
  let size=null,size_label_fr=null,size_label_en=null;
  if((cfg&&cfg.selector&&cfg.sizes&&cfg.sizes.length>1)||letterScale(cfg,id)){
    const code=selectedSize(card);
    if(!code){if(card&&typeof card._setSizeOpen==='function')card._setSizeOpen(true);return}
    const sz=cfg.sizes.find(s=>s.code===code);
    if(!sz)return;
    const live=effectiveQty(id,code,sz.qty_on_hand);
    if(live.state==='unverified'){alert(unverifiedPhrase());return}
    if(live.qty!=null&&live.qty<=0){alert(stockText(0));return}
    size=code;
    const L=api&&api.labelsForCart?api.labelsForCart(code,sz):{fr:sz.label_fr||code,en:sz.label_en||code};
    size_label_fr=L.fr;size_label_en=L.en;
  }else if(cfg&&cfg.sizes&&cfg.sizes[0]){
    const sz=cfg.sizes[0];
    const live=effectiveQty(id,sz.code,sz.qty_on_hand);
    if(live.state==='unverified'){alert(unverifiedPhrase());return}
    if(live.qty!=null&&live.qty<=0){alert(stockText(0));return}
    size=sz.code;
    const L=api&&api.labelsForCart?api.labelsForCart(sz.code,sz):{fr:sz.label_fr||sz.code,en:sz.label_en||sz.code};
    size_label_fr=L.fr;size_label_en=L.en;
  }
  const key='boreales-cart';
  let cart=[];try{cart=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){cart=[]}
  if(!Array.isArray(cart))cart=[];
  const addQty=Math.max(1,Math.floor(Number(card&&card._qty)||1));
  const liveCap=size?effectiveQty(id,size,cfg&&cfg.sizes&&(cfg.sizes.find(s=>s.code===size)||{}).qty_on_hand):null;
  let cap=null;
  if(size){
    if(!liveCap||liveCap.state==='order'||liveCap.qty==null)cap=ORDER_QTY_MAX;
    else cap=liveCap.qty;
  }
  const draft={id,name,name_fr,name_en,price,price_cad_cents:Math.round(Number(price)*100),product_number:b.dataset.productNumber?Number(b.dataset.productNumber):null,qty:addQty,size,size_label_fr,size_label_en};
  const lk=cartLineKey(draft);
  const found=cart.find(x=>!x.custom&&cartLineKey(x)===lk);
  const already=found?Math.floor(Number(found.qty)||0):0;
  if(cap!=null&&already+addQty>cap){
    const left=Math.max(0,cap-already);
    alert(en()?(left?('Only '+left+' more for this size.'):('Only '+cap+' left for this size.')):(left?('Il ne reste que '+left+' de plus pour cette taille.'):('Il ne reste que '+cap+' pour cette taille.')));
    return;
  }
  if(found)found.qty=already+addQty;
  else cart.push(draft);
  localStorage.setItem(key,JSON.stringify(cart));
  if(card){card._qty=1;if(typeof card._syncQty==='function')card._syncQty();}
  const n=cart.reduce((sum,x)=>sum+(Number(x.qty)||0),0);
  window.dispatchEvent(new Event('boreales-cart-updated'));
  b.textContent=en()?`Added (${n})`:`Ajouté (${n})`;
  setTimeout(()=>{b.textContent=en()?b.dataset.en:b.dataset.fr},1200);
}));
fetch('catalog/sur-mesure-config.json').then(r=>r.ok?r.json():null).then(doc=>{
  const d=doc&&doc.made_to_order;
  if(!d||!d.delay_fr||!d.delay_en)return;
  orderCopy={
    label_fr:d.label_fr||orderCopy.label_fr,
    label_en:d.label_en||orderCopy.label_en,
    delay_fr:d.delay_fr,
    delay_en:d.delay_en
  };
  applyOrderCopy();
}).catch(()=>{});
function syncChaleur(){
  document.querySelectorAll('.shop-product').forEach(card=>{
    const cat=card.dataset.category||'';
    const aud=card.dataset.audience||'';
    const ok=(cat==='mitaines'||cat==='pantoufles')&&(aud==='femmes'||aud==='hommes');
    const btn=card.querySelector('.chaleur-plus');
    if(!ok){if(btn)btn.remove();return;}
    if(btn)return;
    const parent=card.querySelector('.size-line')||card.querySelector('.size-select-head');
    if(!parent)return;
    const a=document.createElement('a');
    a.className='chaleur-plus';
    a.href='creations-personnalisees.html?modele='+encodeURIComponent(card.dataset.productId||'')+'&chaleur=1#mesure';
    const img=document.createElement('img');
    img.className='chaleur-flame';
    img.src='assets/icones/flamme-chaleur.png';
    img.alt='';
    img.width=16;
    img.height=22;
    const label=document.createElement('span');
    label.className='chaleur-plus-label';
    label.dataset.fr='Chaleur +';
    label.dataset.en='Warmth +';
    label.textContent=en()?'Warmth +':'Chaleur +';
    a.setAttribute('aria-label',en()?'Extra warmth, made to measure':'Chaleur +, commande sur mesure');
    a.appendChild(img);
    a.appendChild(label);
    a.addEventListener('click',(ev)=>ev.stopPropagation());
    parent.appendChild(a);
  });
}
window.addEventListener('boreales-audience-ready',syncChaleur);
function repaintAvailability(doc){
  if(!doc||!doc.products)return;
  document.querySelectorAll('.shop-product').forEach(card=>{
    const btn=card.querySelector('.demo-add');
    const id=card.dataset.productId||(btn&&btn.dataset.id);
    const cfg=id&&doc.products[id];
    if(!cfg||!btn)return;
    placeStock(cfg,id,btn);
    card.querySelectorAll('.size-choice:not(.size-choice-order)').forEach(b=>{
      const sz=(cfg.sizes||[]).find(x=>x.code===b.dataset.size);
      const stock=b.querySelector('.size-choice-stock');
      if(!sz||!stock)return;
      const live=effectiveQty(id,sz.code,sz.qty_on_hand);
      const q=live.state==='live'||live.state==='file'?live.qty:null;
      stock.textContent=live.state==='unverified'?unverifiedPhrase():(q==null?'':stockText(q));
      stock.classList.toggle('is-sold',q!=null&&q<=0);
      b.classList.toggle('is-sold-out',q!=null&&q<=0);
      b.disabled=q!=null&&q<=0;
      b.setAttribute('aria-label',sizeName(sz)+(stock.textContent?' , '+stock.textContent:''));
    });
    card.querySelectorAll('.size-stock-solo').forEach(el=>{
      const only=cfg.sizes&&cfg.sizes[0];
      const live=effectiveQty(id,only&&only.code,only&&only.qty_on_hand);
      const q=live.state==='live'||live.state==='file'?live.qty:null;
      el.dataset.qty=q==null?'':String(q);
      el.textContent=live.state==='unverified'?unverifiedPhrase():(q==null?'':stockText(q));
      el.classList.toggle('is-sold',q!=null&&q<=0);
    });
    const hint=card.querySelector('.size-select-hint');
    refreshAddBtn(card,cfg,btn,hint);
  });
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)return;
  const api=sizesApi();
  if(!api||!api.refresh)return;
  api.refresh().then(doc=>loadSim().then(()=>repaintAvailability(doc))).catch(()=>{});
});
const boot=()=>{const api=sizesApi();if(!api||!api.load)return;api.load().then(doc=>loadSim().then(()=>{injectSelectors(doc);syncChaleur();}))};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})()})();
/* Bouton retour en haut : visible après défilement */
(()=>{const b=document.createElement('button');b.type='button';b.className='back-to-top';b.textContent='↑';b.setAttribute('aria-label','Retour en haut');b.title='Retour en haut';document.body.appendChild(b);const refresh=()=>{b.classList.toggle('visible',window.scrollY>240)};window.addEventListener('scroll',refresh,{passive:true});refresh();b.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));})();

/* Flèches latérales discrètes : navigation entre quatre pages */
(()=>{const pages=['index.html','boutique.html','creations-personnalisees.html','creations.html','lucie.html','contact.html'];const names=['Accueil','Boutique','Créations personnalisées','Nos créations','À propos de Lucie','Contact'];const current=location.pathname.split('/').pop()||'index.html';const i=pages.indexOf(current);if(i<0)return;const bar=document.createElement('nav');bar.className='mobile-page-arrows';bar.setAttribute('aria-label','Navigation entre les pages');function link(n,dir,disabled){const a=document.createElement(disabled?'span':'a');a.className=(dir==='prev'?'arrow-prev':'arrow-next')+(disabled?' is-disabled':'');if(!disabled){a.href=pages[n];a.title=names[n];a.setAttribute('aria-label',(dir==='prev'?'Page précédente : ':'Page suivante : ')+names[n])}else{a.setAttribute('aria-hidden','true')}a.innerHTML='<svg viewBox="0 0 20 32" fill="none" aria-hidden="true"><path d="'+(dir==='prev'?'M15 4 L5 16 L15 28':'M5 4 L15 16 L5 28')+'" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';return a}if(i>0)bar.appendChild(link(i-1,'prev',false));if(i<pages.length-1)bar.appendChild(link(i+1,'next',false));if(bar.childElementCount)document.body.appendChild(bar)})();

/* Badge panier (à côté du lien Panier dans le menu) */
(()=>{const KEY='boreales-cart';function readCart(){try{const c=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(c)?c:[]}catch(e){return[]}}function cartQty(){return readCart().reduce((s,x)=>s+(Number(x.qty)||0),0)}function refreshCartCount(opts){const el=document.getElementById('cart-count');if(!el)return;const prev=Number(el.dataset.count||0);const n=cartQty();el.textContent=String(n);el.dataset.count=String(n);el.classList.toggle('is-empty',n<=0);el.classList.toggle('has-items',n>0);const link=el.closest('.cart-link');if(link)link.setAttribute('aria-label',(document.documentElement.lang.startsWith('en')?'Cart':'Panier')+(n?` (${n})`:''));if(opts&&opts.bounce&&n>0&&n!==prev){el.classList.remove('bounce');void el.offsetWidth;el.classList.add('bounce')}}window.refreshCartCount=refreshCartCount;window.borealesCartKey=KEY;refreshCartCount();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCartCount()});window.addEventListener('storage',e=>{if(e.key===KEY)refreshCartCount()});window.addEventListener('boreales-cart-updated',()=>refreshCartCount({bounce:true}))})();
