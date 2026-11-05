(()=>{'use strict';const buttons=document.querySelectorAll('[data-set-lang]');const saved=localStorage.getItem('boreales-lang');function setLang(lang){if(!['fr','en'].includes(lang))lang='fr';document.documentElement.lang=lang==='fr'?'fr-CA':'en-CA';document.querySelectorAll('[data-fr][data-en]').forEach(el=>{el.textContent=el.dataset[lang]});buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.setLang===lang)));localStorage.setItem('boreales-lang',lang);window.dispatchEvent(new CustomEvent('boreales-lang-changed',{detail:{lang}}))}buttons.forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.setLang)));const browserLang=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'fr']).find(l=>/^fr(?:-|$)|^en(?:-|$)/i.test(l));setLang(saved||(/^en(?:-|$)/i.test(browserLang||'')?'en':'fr'));const y=document.getElementById('year');if(y)y.textContent=new Date().getFullYear();const menu=document.querySelector('.menu-toggle'),nav=document.getElementById('main-menu');if(menu&&nav)menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});document.querySelectorAll('#main-menu a').forEach(a=>{if(a.getAttribute('href')===location.pathname.split('/').pop()||(!location.pathname.split('/').pop()&&a.getAttribute('href')==='index.html'))a.setAttribute('aria-current','page')});})();
;(()=>{const filters=document.querySelectorAll('.shop-filter'),cards=[...document.querySelectorAll('.shop-product')],title=document.getElementById('shop-title'),sort=document.getElementById('shop-sort'),grid=document.querySelector('.shop-products');if(!grid)return;filters.forEach(b=>b.addEventListener('click',()=>{filters.forEach(x=>x.classList.toggle('active',x===b));const filter=b.dataset.filter;cards.forEach(c=>c.hidden=filter!=='all'&&c.dataset.category!==filter);if(title){title.dataset.fr=b.querySelector('[data-fr]').dataset.fr;title.dataset.en=b.querySelector('[data-en]').dataset.en;title.textContent=document.documentElement.lang.startsWith('en')?title.dataset.en:title.dataset.fr}}));if(sort)sort.addEventListener('change',()=>{const ordered=[...cards].sort((a,b)=>sort.value==='name'?a.dataset.name.localeCompare(b.dataset.name,'fr'):cards.indexOf(a)-cards.indexOf(b));ordered.forEach(c=>grid.appendChild(c))});(function setupSizesAndCart(){
const en=()=>document.documentElement.lang.startsWith('en');
const sizesApi=()=>window.BOREALES_PRODUCT_SIZES;
function stockText(q){
  const api=sizesApi();
  if(api&&api.stockPhrase)return api.stockPhrase(q);
  if(q==null)return '';
  if(q<=0)return en()?'Sold out':'Épuisé';
  if(en())return q===1?'1 in stock':(q+' in stock');
  return q===1?'1 en stock':(q+' en stock');
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
  if(!cfg.selector||!cfg.sizes||cfg.sizes.length<2){
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
    btn.disabled=false;btn.classList.remove('is-sold-out');
    btn.textContent=en()?btn.dataset.en:btn.dataset.fr;
    return;
  }
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
  name.textContent=sizeName(sz);
  const stock=document.createElement('span');
  stock.className='size-choice-stock'+(sold?' is-sold':'');
  stock.textContent=stockText(q);
  b.appendChild(name);b.appendChild(stock);
  if(!sold){
    b.addEventListener('click',()=>{
      card.querySelectorAll('.size-choice').forEach(x=>x.classList.remove('is-selected'));
      b.classList.add('is-selected');
      refreshAddBtn(card,cfg,btn,hint);
    });
  }
  return b;
}
function injectSelectors(doc){
  if(!doc||!doc.products)return;
  document.querySelectorAll('.shop-product').forEach(card=>{
    const btn=card.querySelector('.demo-add');
    const id=card.dataset.productId||(btn&&btn.dataset.id);
    if(!id||!btn)return;
    const cfg=doc.products[id];
    if(!cfg)return;
    const info=card.querySelector('.shop-product-info')||btn.parentElement;
    if(info.querySelector('.size-select-wrap')||info.querySelector('.size-stock-wrap'))return;

    if(cfg.selector&&cfg.sizes&&cfg.sizes.length>1){
      const wrap=document.createElement('div');
      wrap.className='size-select-wrap';
      wrap.dataset.productId=id;
      const title=document.createElement('p');
      title.className='size-select-label';
      title.dataset.fr='Taille';title.dataset.en='Size';
      title.textContent=en()?'Size':'Taille';
      wrap.appendChild(title);
      const list=document.createElement('div');
      list.className='size-choice-list';
      list.setAttribute('role','group');
      list.setAttribute('aria-label',en()?'Size':'Taille');
      const hint=document.createElement('p');
      hint.className='size-select-hint';
      hint.hidden=true;
      cfg.sizes.forEach(sz=>list.appendChild(buildChoice(sz,cfg,card,btn,hint)));
      wrap.appendChild(list);
      wrap.appendChild(hint);
      btn.parentElement.insertBefore(wrap,btn);
      refreshAddBtn(card,cfg,btn,hint);
    }else{
      const only=cfg.sizes&&cfg.sizes[0];
      const q=only&&only.qty_on_hand!=null?Math.floor(Number(only.qty_on_hand)):null;
      const wrap=document.createElement('div');
      wrap.className='size-stock-wrap';
      if(only&&only.code==='unique'&&only.label_fr&&/universelle|universal/i.test(String(only.label_fr)+String(only.label_en||''))){
        const tip=document.createElement('p');
        tip.className='size-unique-note';
        tip.dataset.fr=only.label_fr;tip.dataset.en=only.label_en||only.label_fr;
        tip.textContent=en()?(only.label_en||only.label_fr):only.label_fr;
        wrap.appendChild(tip);
      }else if(only&&only.code&&only.code!=='unique'){
        const tip=document.createElement('p');
        tip.className='size-unique-note size-format-name';
        const api=sizesApi();
        const labFr=api&&api.displayLabel?api.displayLabel(only.code,only,'fr'):(only.label_fr||only.code);
        const labEn=api&&api.displayLabel?api.displayLabel(only.code,only,'en'):(only.label_en||only.code);
        tip.dataset.fr=labFr;tip.dataset.en=labEn;
        tip.textContent=en()?labEn:labFr;
        wrap.appendChild(tip);
      }
      const stock=document.createElement('p');
      stock.className='size-choice-stock size-stock-solo'+(q!=null&&q<=0?' is-sold':'');
      stock.dataset.qty=q==null?'':String(q);
      stock.textContent=q==null?'':stockText(q);
      wrap.appendChild(stock);
      btn.parentElement.insertBefore(wrap,btn);
      refreshAddBtn(card,cfg,btn,null);
    }
  });

  window.addEventListener('boreales-lang-changed',()=>{
    const api=sizesApi();
    document.querySelectorAll('.size-select-label').forEach(el=>{
      el.textContent=en()?(el.dataset.en||'Size'):(el.dataset.fr||'Taille');
    });
    document.querySelectorAll('.size-unique-note').forEach(el=>{
      if(el.dataset.fr&&el.dataset.en)el.textContent=en()?el.dataset.en:el.dataset.fr;
    });
    document.querySelectorAll('.size-choice').forEach(b=>{
      const card=b.closest('.shop-product');
      const id=card&&(card.dataset.productId||(card.querySelector('.demo-add')||{}).dataset.id);
      const cfg=api&&api.entry&&id?api.entry(id):null;
      const sz=cfg&&cfg.sizes?cfg.sizes.find(x=>x.code===b.dataset.size):null;
      if(!sz)return;
      const name=b.querySelector('.size-choice-name');
      const stock=b.querySelector('.size-choice-stock');
      if(name)name.textContent=sizeName(sz);
      const q=sz.qty_on_hand==null?null:Math.floor(Number(sz.qty_on_hand));
      if(stock)stock.textContent=stockText(q);
    });
    document.querySelectorAll('.size-stock-solo').forEach(el=>{
      const q=el.dataset.qty===''?null:Math.floor(Number(el.dataset.qty));
      if(q==null||!Number.isFinite(q))return;
      el.textContent=stockText(q);
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
  if(cfg&&cfg.selector&&cfg.sizes&&cfg.sizes.length>1){
    const code=selectedSize(card);
    if(!code){alert(en()?'Please choose a size.':'Veuillez choisir une taille.');return}
    const sz=cfg.sizes.find(s=>s.code===code);
    const q=sz&&sz.qty_on_hand!=null?Math.floor(Number(sz.qty_on_hand)):null;
    if(q!=null&&q<=0){alert(stockText(0));return}
    size=code;
    const L=api&&api.labelsForCart?api.labelsForCart(code,sz):{fr:sz.label_fr||code,en:sz.label_en||code};
    size_label_fr=L.fr;size_label_en=L.en;
  }else if(cfg&&cfg.sizes&&cfg.sizes[0]){
    const sz=cfg.sizes[0];
    const q=sz.qty_on_hand!=null?Math.floor(Number(sz.qty_on_hand)):null;
    if(q!=null&&q<=0){alert(stockText(0));return}
    size=sz.code;
    const L=api&&api.labelsForCart?api.labelsForCart(sz.code,sz):{fr:sz.label_fr||sz.code,en:sz.label_en||sz.code};
    size_label_fr=L.fr;size_label_en=L.en;
  }
  const key='boreales-cart';
  let cart=[];try{cart=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){cart=[]}
  if(!Array.isArray(cart))cart=[];
  const draft={id,name,name_fr,name_en,price,price_cad_cents:Math.round(Number(price)*100),product_number:b.dataset.productNumber?Number(b.dataset.productNumber):null,qty:1,size,size_label_fr,size_label_en};
  const lk=cartLineKey(draft);
  const found=cart.find(x=>!x.custom&&cartLineKey(x)===lk);
  if(found){
    const max=api&&api.availableQty?api.availableQty(id,size):null;
    if(max!=null&&found.qty+1>max){alert(en()?('Only '+max+' left for this size.'):('Il ne reste que '+max+' pour cette taille.'));return}
    found.qty+=1;
  }else cart.push(draft);
  localStorage.setItem(key,JSON.stringify(cart));
  const n=cart.reduce((sum,x)=>sum+(Number(x.qty)||0),0);
  window.dispatchEvent(new Event('boreales-cart-updated'));
  b.textContent=en()?`Added (${n})`:`Ajouté (${n})`;
  setTimeout(()=>{b.textContent=en()?b.dataset.en:b.dataset.fr},1200);
}));
const boot=()=>{const api=sizesApi();if(!api||!api.load)return;api.load().then(doc=>injectSelectors(doc))};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})()})();
/* Bouton retour en haut : visible après défilement */
(()=>{const b=document.createElement('button');b.type='button';b.className='back-to-top';b.textContent='↑';b.setAttribute('aria-label','Retour en haut');b.title='Retour en haut';document.body.appendChild(b);const refresh=()=>{b.classList.toggle('visible',window.scrollY>240)};window.addEventListener('scroll',refresh,{passive:true});refresh();b.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));})();

/* Flèches latérales discrètes : navigation entre quatre pages */
(()=>{const pages=['index.html','boutique.html','creations-personnalisees.html','creations.html','lucie.html','contact.html'];const names=['Accueil','Boutique','Créations personnalisées','Nos créations','À propos de Lucie','Contact'];const current=location.pathname.split('/').pop()||'index.html';const i=pages.indexOf(current);if(i<0)return;const bar=document.createElement('nav');bar.className='mobile-page-arrows';bar.setAttribute('aria-label','Navigation entre les pages');function link(n,dir,disabled){const a=document.createElement(disabled?'span':'a');a.className=(dir==='prev'?'arrow-prev':'arrow-next')+(disabled?' is-disabled':'');if(!disabled){a.href=pages[n];a.title=names[n];a.setAttribute('aria-label',(dir==='prev'?'Page précédente : ':'Page suivante : ')+names[n])}else{a.setAttribute('aria-hidden','true')}a.innerHTML='<svg viewBox="0 0 20 32" fill="none" aria-hidden="true"><path d="'+(dir==='prev'?'M15 4 L5 16 L15 28':'M5 4 L15 16 L5 28')+'" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';return a}if(i>0)bar.appendChild(link(i-1,'prev',false));if(i<pages.length-1)bar.appendChild(link(i+1,'next',false));if(bar.childElementCount)document.body.appendChild(bar)})();

/* Badge panier (à côté du lien Panier dans le menu) */
(()=>{const KEY='boreales-cart';function readCart(){try{const c=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(c)?c:[]}catch(e){return[]}}function cartQty(){return readCart().reduce((s,x)=>s+(Number(x.qty)||0),0)}function refreshCartCount(opts){const el=document.getElementById('cart-count');if(!el)return;const prev=Number(el.dataset.count||0);const n=cartQty();el.textContent=String(n);el.dataset.count=String(n);el.classList.toggle('is-empty',n<=0);el.classList.toggle('has-items',n>0);const link=el.closest('.cart-link');if(link)link.setAttribute('aria-label',(document.documentElement.lang.startsWith('en')?'Cart':'Panier')+(n?` (${n})`:''));if(opts&&opts.bounce&&n>0&&n!==prev){el.classList.remove('bounce');void el.offsetWidth;el.classList.add('bounce')}}window.refreshCartCount=refreshCartCount;window.borealesCartKey=KEY;refreshCartCount();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCartCount()});window.addEventListener('storage',e=>{if(e.key===KEY)refreshCartCount()});window.addEventListener('boreales-cart-updated',()=>refreshCartCount({bounce:true}))})();
