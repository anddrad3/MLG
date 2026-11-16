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
  annual.innerHTML='<div class="mlg-annual-heading"><h2>Seu ano, mês a mês</h2><div class="mlg-annual-year"><button type="button" data-prev aria-label="Ano anterior">‹</button><strong data-year></strong><button type="button" data-next aria-label="Próximo ano">›</button></div><label class="mlg-annual-metric"><span>Visualizar</span><select data-metric aria-label="Indicador dos doze meses"><option value="saldo">Saldo previsto</option><option value="entradas">Entradas</option><option value="despesas">Saídas</option><option value="pago">Pago</option><option value="pendente">Pendente</option></select></label></div><p class="mlg-annual-private" data-private hidden>Revele os dados pelo ícone de privacidade para visualizar seu ano.</p><div class="mlg-annual-table"></div><div class="mlg-annual-grid"></div><p class="mlg-annual-caption">Valores em reais · Selecione um mês para ver os lançamentos.</p>';
  $('mlg-workspace').after(annual);
  let year=Number(MLGFinance.getDate().slice(0,4));
  const metrics=[['Entradas','entradas'],['Saídas','despesas'],['Pago','pago'],['Pendente','pendente'],['Saldo previsto','saldo']];
  const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),monthName=m=>new Date(year,m,1).toLocaleDateString('pt-BR',{month:'long'});
  // Currency is stated once in the caption. Very large amounts retain their full
  // value in the accessible label/title while using a readable compact display.
  const number=n=>Math.abs(Number(n))<1000000?Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):Number(n).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1});
  function openMonth(month){MLGFinance.goTo(`${year}-${String(month+1).padStart(2,'0')}-01`);document.querySelector('[data-view=desk]').click();}
  function render(){
    annual.querySelector('[data-year]').textContent=year;
    const table=annual.querySelector('.mlg-annual-table'),grid=annual.querySelector('.mlg-annual-grid'),privateMessage=annual.querySelector('[data-private]'),isPrivate=MLGFinance.isPrivate();table.replaceChildren();grid.replaceChildren();
    table.hidden=isPrivate;grid.hidden=isPrivate;privateMessage.hidden=!isPrivate;annual.querySelector('[data-metric]').disabled=isPrivate;
    if(isPrivate)return;
    const selectedMetric=annual.querySelector('[data-metric]').value,selectedLabel=metrics.find(([,key])=>key===selectedMetric)[0],months=MLGFinance.getYear(year),t=document.createElement('table'),thead=t.createTHead(),hr=thead.insertRow(),corner=document.createElement('th');corner.scope='col';corner.textContent='Resumo';hr.append(corner);
    const currentDate=MLGFinance.getDate().split('-').map(Number);
    months.forEach(m=>{const th=document.createElement('th');th.scope='col';const go=document.createElement('button');go.type='button';go.textContent=monthName(m.month).slice(0,3);go.setAttribute('aria-label','Ver lançamentos de '+monthName(m.month)+' de '+year);go.onclick=()=>openMonth(m.month);th.append(go);if(currentDate[0]===year&&currentDate[1]===m.month+1)th.className='is-current';hr.append(th);});
    const tbody=t.createTBody();
    metrics.forEach(([label,key])=>{const row=tbody.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=label;row.append(th);months.forEach(m=>{const c=row.insertCell(),full=money(m.metrics[key]);c.textContent=number(m.metrics[key]);c.title=full;c.setAttribute('aria-label',`${label}, ${monthName(m.month)}: ${full}`);c.className=key==='entradas'?'income':key==='despesas'?'expense':key==='saldo'?'balance':'';});});table.append(t);
    months.forEach(m=>{
      const card=document.createElement('article');card.className='mlg-month-mini';if(currentDate[0]===year&&currentDate[1]===m.month+1)card.classList.add('is-current');
      const go=document.createElement('button');go.type='button';go.className='mlg-month-open';go.setAttribute('aria-label',`${monthName(m.month)} de ${year}, ${selectedLabel}: ${money(m.metrics[selectedMetric])}. Ver lançamentos.`);go.title=money(m.metrics[selectedMetric]);go.onclick=()=>openMonth(m.month);
      const title=document.createElement('span');title.className='mlg-month-name';title.textContent=monthName(m.month);const value=document.createElement('strong');value.className='mlg-month-value '+(selectedMetric==='entradas'?'income':selectedMetric==='despesas'?'expense':'');value.textContent=number(m.metrics[selectedMetric]);go.append(title,value);card.append(go);grid.append(card);
    });
  }
  annual.querySelector('[data-prev]').onclick=()=>{year=Math.max(1900,year-1);render();};annual.querySelector('[data-next]').onclick=()=>{year=Math.min(2200,year+1);render();};annual.querySelector('[data-metric]').onchange=render;
  window.addEventListener('mlg-finance-change',()=>{if(document.body.classList.contains('mlg-year'))render();});window.addEventListener('mlg-view-change',()=>{if(document.body.classList.contains('mlg-year')){year=Number(MLGFinance.getDate().slice(0,4));render();}});render();
 }
 if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
