/* Layout and annual overview share the existing finance state and controls. */
(() => {
 function init(){
  const $=id=>document.getElementById(id),header=document.querySelector('.mlg-finance-header');
  document.body.classList.add('mlg-finance');
  const top=document.createElement('div');top.className='mlg-topline';
  top.innerHTML='<div class="mlg-app-identity"></div>';
  top.append($('mlg-profile'));header.before(top);
  const search=$('search-button');search.hidden=true;search.setAttribute('aria-hidden','true');search.tabIndex=-1;document.body.append(search);
  document.querySelector('.mlg-header-navigation').append($('timeline-button'));
  const logo=document.querySelector('.mlg-finance-logo'),home=document.createElement('a');home.href='/';home.className='mlg-finance-symbol';home.setAttribute('aria-label','Voltar à página inicial do MLG');home.innerHTML='<i class="fa-solid fa-calculator" aria-hidden="true"></i>';logo.replaceWith(home);
  const identity=top.querySelector('.mlg-app-identity'),center=document.querySelector('.mlg-header-center'),brand=center.querySelector('.app-brand'),month=$('date-display').parentElement,toolbar=document.querySelector('.mlg-work-toolbar'),views=toolbar.querySelector('.mlg-view-switch');
  identity.append(home,brand);center.append(views);
  const context=document.createElement('div');context.className='mlg-context-row';month.classList.add('mlg-month-navigation');context.append(month);
  const tools=document.createElement('div');tools.className='mlg-money-tools';tools.append($('mlg-box-menu'));context.append(tools);header.after(context);
  // Keep the original switch listener attached while moving its entire container.
  toolbar.replaceChildren(views);center.append(toolbar);
  header.setAttribute('aria-label','Visualização e ferramentas');
  header.querySelectorAll('.header-button').forEach(button=>{if(!button.title)button.title=button.getAttribute('aria-label')||'';});
  const shortLabels={entradas:'Entradas',despesas:'Saídas',pago:'Pago',falta:'Pendente','falta-pagar':'Diferença',sobras:'Sobras',cofre:'Investimentos',alocado:'Alocado'};
  document.querySelectorAll('#indicators-grid [data-indicator]').forEach(button=>{button.parentElement.querySelector('h3').dataset.short=shortLabels[button.dataset.indicator];});
  const date=$('date-display');date.tabIndex=0;date.setAttribute('role','button');date.setAttribute('aria-haspopup','dialog');date.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();date.click();}});
  const picker=$('date-picker-modal'),pickerTitle=picker.querySelector('h2');pickerTitle.append($('open-calendar-grid-btn'));picker.append($('calendar-grid-modal'));
  document.querySelectorAll('[id$="-modal"].fixed').forEach(modal=>{
    modal.classList.add('mlg-overlay');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const heading=modal.querySelector('h2,h3');if(heading){if(!heading.id)heading.id=modal.id+'-heading';modal.setAttribute('aria-labelledby',heading.id);}
  });
  // The chat stays outside scroll containers so it does not disappear on scroll.
  document.body.append($('mlg-ai'));
  const annual=document.createElement('section');annual.id='mlg-annual';annual.setAttribute('aria-label','Visão resumida dos doze meses');
  annual.innerHTML='<div class="mlg-annual-heading"><div><small>UMA VISÃO DO TODO</small><h2>Seu ano, mês a mês</h2></div><div class="mlg-annual-year"><button type="button" data-prev aria-label="Ano anterior">‹</button><strong data-year></strong><button type="button" data-next aria-label="Próximo ano">›</button></div><label><input type="checkbox" data-detail> Mostrar lançamentos</label></div><p class="mlg-annual-private" data-private hidden>Revele os dados pelo ícone de privacidade para visualizar seu ano.</p><div class="mlg-annual-table"></div><div class="mlg-annual-grid"></div>';
  $('mlg-workspace').after(annual);
  let year=Number(MLGFinance.getDate().slice(0,4));
  const pages=new Map(),metrics=[['Entradas','entradas'],['Saídas','despesas'],['Pago','pago'],['Pendente','pendente'],['Saldo previsto','saldo']];
  const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),monthName=m=>new Date(year,m,1).toLocaleDateString('pt-BR',{month:'long'});
  const number=n=>Math.abs(Number(n))<1000000?Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):Number(n).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1});
  function openMonth(month){MLGFinance.goTo(`${year}-${String(month+1).padStart(2,'0')}-01`);document.querySelector('[data-view=desk]').click();}
  function itemList(month){
    const list=document.createElement('div');list.className='mlg-mini-items';list.hidden=!annual.querySelector('[data-detail]').checked;
    const items=['entradas','despesas'].flatMap(type=>(month.data[type]||[]).map(item=>({item,type}))),key=year+'-'+month.month;
    if(!items.length){list.textContent='Nenhum lançamento.';return list;}
    const row=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('b');row.className='mlg-mini-item';row.append(name,amount);list.append(row);
    const pager=document.createElement('nav');pager.className='mlg-mini-pages';pager.setAttribute('aria-label','Lançamentos de '+monthName(month.month));
    const previous=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');
    previous.type=next.type='button';previous.textContent='‹';next.textContent='›';previous.setAttribute('aria-label','Lançamento anterior de '+monthName(month.month));next.setAttribute('aria-label','Próximo lançamento de '+monthName(month.month));count.setAttribute('aria-live','polite');pager.append(previous,count,next);list.append(pager);
    function show(index){const page=Math.max(0,Math.min(items.length-1,index));pages.set(key,page);const {item,type}=items[page],status=type==='despesas'?(item.pago?'Pago':item.status==='ainda_nao'?'Ainda não':'Pendente'):'';name.textContent=(type==='entradas'?'+ ':'− ')+item.nome;amount.textContent=money(item.valor)+(item.pago&&type==='despesas'?' ✓':'');row.classList.toggle('is-paid',!!item.pago&&type==='despesas');row.title=[name.textContent,money(item.valor),status].filter(Boolean).join(' · ');row.setAttribute('aria-label',row.title);count.textContent=(page+1)+' / '+items.length;previous.disabled=page===0;next.disabled=page===items.length-1;}
    previous.onclick=()=>show((pages.get(key)||0)-1);next.onclick=()=>show((pages.get(key)||0)+1);show(pages.get(key)||0);return list;
  }
  function render(){
    annual.querySelector('[data-year]').textContent=year;annual.classList.toggle('has-details',annual.querySelector('[data-detail]').checked);
    const table=annual.querySelector('.mlg-annual-table'),grid=annual.querySelector('.mlg-annual-grid'),privateMessage=annual.querySelector('[data-private]'),isPrivate=MLGFinance.isPrivate();table.replaceChildren();grid.replaceChildren();
    table.hidden=isPrivate;grid.hidden=isPrivate;privateMessage.hidden=!isPrivate;annual.querySelector('[data-detail]').disabled=isPrivate;
    if(isPrivate)return;
    const months=MLGFinance.getYear(year),t=document.createElement('table'),thead=t.createTHead(),hr=thead.insertRow(),corner=document.createElement('th');corner.scope='col';corner.textContent='Resumo (R$)';hr.append(corner);
    const currentDate=MLGFinance.getDate().split('-').map(Number);
    months.forEach(m=>{const th=document.createElement('th');th.scope='col';const go=document.createElement('button');go.type='button';go.textContent=monthName(m.month).slice(0,3);go.setAttribute('aria-label','Ver lançamentos de '+monthName(m.month)+' de '+year);go.onclick=()=>openMonth(m.month);th.append(go);if(currentDate[0]===year&&currentDate[1]===m.month+1)th.className='is-current';hr.append(th);});
    const tbody=t.createTBody();
    metrics.forEach(([label,key])=>{const row=tbody.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=label;row.append(th);months.forEach(m=>{const c=row.insertCell(),full=money(m.metrics[key]);c.textContent=number(m.metrics[key]);c.title=full;c.setAttribute('aria-label',`${label}, ${monthName(m.month)}: ${full}`);c.className=key==='entradas'?'income':key==='despesas'?'expense':key==='saldo'?'balance':'';});});table.append(t);
    months.forEach(m=>{
      const card=document.createElement('article');card.className='mlg-month-mini';if(currentDate[0]===year&&currentDate[1]===m.month+1)card.classList.add('is-current');
      const go=document.createElement('button');go.type='button';go.className='mlg-month-open';go.textContent=monthName(m.month)+' ↗';go.setAttribute('aria-label','Ver lançamentos de '+monthName(m.month)+' de '+year);go.onclick=()=>openMonth(m.month);card.append(go);
      const totals=document.createElement('div');totals.className='mlg-month-totals';
      [['Entradas',m.metrics.entradas,'income'],['Saídas',m.metrics.despesas,'expense']].forEach(([label,value,cls])=>{const el=document.createElement('p');el.textContent=label;const strong=document.createElement('strong');strong.className=cls;strong.textContent=money(value);strong.title=money(value);el.append(strong);totals.append(el);});card.append(totals);
      const paid=document.createElement('p');paid.className='mlg-mini-paid';[['Pago',m.metrics.pago],['Pendente',m.metrics.pendente]].forEach(([label,value])=>{const part=document.createElement('span');part.textContent=label+' '+money(value);part.title=part.textContent;paid.append(part);});card.append(paid);
      card.append(itemList(m));const content=document.createElement('div');content.className='mlg-month-content';content.append(...card.childNodes);card.append(content);grid.append(card);
    });
    requestAnimationFrame(fitCards);
  }
  // Shrink a complete month as a unit only when its content cannot fit the
  // allocated row (for example details on a short phone). Never clip its pager.
  function fitCards(){
    annual.querySelectorAll('.mlg-month-content').forEach(content=>{
      content.style.width='';content.style.height='';content.style.transform='';
      const height=content.clientHeight,width=content.clientWidth;if(!height||!width)return;
      const children=[...content.children].filter(el=>!el.hidden),gap=parseFloat(getComputedStyle(content).rowGap)||0;
      const needed=children.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+Math.max(0,children.length-1)*gap;
      if(needed>height){const scale=height/needed;content.style.width=(width/scale)+'px';content.style.height=(height/scale)+'px';content.style.transform='scale('+scale+')';}
    });
  }
  if(typeof ResizeObserver!=='undefined'){const fitObserver=new ResizeObserver(()=>requestAnimationFrame(fitCards));fitObserver.observe(annual.querySelector('.mlg-annual-grid'));}
  annual.querySelector('[data-prev]').onclick=()=>{year=Math.max(1900,year-1);render();};annual.querySelector('[data-next]').onclick=()=>{year=Math.min(2200,year+1);render();};annual.querySelector('[data-detail]').onchange=render;
  window.addEventListener('mlg-finance-change',()=>{if(document.body.classList.contains('mlg-year'))render();});window.addEventListener('mlg-view-change',()=>{if(document.body.classList.contains('mlg-year')){year=Number(MLGFinance.getDate().slice(0,4));render();}});render();
 }
 if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
