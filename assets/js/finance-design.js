/* Layout and annual overview share the existing finance state and controls. */
(() => {
 function init(){
  const $=id=>document.getElementById(id),header=document.querySelector('.mlg-finance-header');
  document.body.classList.add('mlg-finance');
  const top=document.createElement('div');top.className='mlg-topline';
  top.innerHTML='<a href="/" class="mlg-home-link">MLG <span>/ seu financeiro</span></a>';
  top.append($('mlg-profile'));header.before(top);
  const search=$('search-button');search.hidden=true;search.setAttribute('aria-hidden','true');search.tabIndex=-1;document.body.append(search);
  document.querySelector('.mlg-header-navigation').append($('timeline-button'));
  const logo=document.querySelector('.mlg-finance-logo'),home=document.createElement('a');home.href='/';home.className='mlg-finance-symbol';home.setAttribute('aria-label','Voltar à página inicial do MLG');home.innerHTML='<i class="fa-solid fa-calculator" aria-hidden="true"></i>';logo.replaceWith(home);
  const tools=document.createElement('div');tools.className='mlg-money-tools';tools.innerHTML='<span><i class="fa-solid fa-seedling" aria-hidden="true"></i> Seus investimentos</span>';tools.append($('mlg-box-menu'));document.querySelector('.mlg-work-toolbar').after(tools);
  const picker=$('date-picker-modal'),pickerTitle=picker.querySelector('h2');pickerTitle.append($('open-calendar-grid-btn'));picker.append($('calendar-grid-modal'));
  document.querySelectorAll('[id$="-modal"].fixed').forEach(modal=>{
    modal.classList.add('mlg-overlay');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const heading=modal.querySelector('h2,h3');if(heading){if(!heading.id)heading.id=modal.id+'-heading';modal.setAttribute('aria-labelledby',heading.id);}
  });
  // The chat stays outside scroll containers so it does not disappear on scroll.
  document.body.append($('mlg-ai'));
  const annual=document.createElement('section');annual.id='mlg-annual';annual.setAttribute('aria-label','Visão resumida dos doze meses');
  annual.innerHTML='<div class="mlg-annual-heading"><div><small>UMA VISÃO DO TODO</small><h2>Seu ano, mês a mês</h2></div><div><button type="button" data-prev aria-label="Ano anterior">‹</button><strong data-year></strong><button type="button" data-next aria-label="Próximo ano">›</button></div><label><input type="checkbox" data-detail> Mostrar lançamentos</label></div><div class="mlg-annual-table"></div><div class="mlg-annual-grid"></div>';
  $('mlg-workspace').after(annual);
  let year=Number(MLGFinance.getDate().slice(0,4));
  const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),monthName=m=>new Date(year,m,1).toLocaleDateString('pt-BR',{month:'long'});
  function render(){
    annual.querySelector('[data-year]').textContent=year;
    const table=annual.querySelector('.mlg-annual-table'),grid=annual.querySelector('.mlg-annual-grid');table.replaceChildren();grid.replaceChildren();
    if(MLGFinance.isPrivate()){table.textContent='Revele os dados pelo ícone de privacidade para visualizar seu ano.';return;}
    const months=MLGFinance.getYear(year),t=document.createElement('table'),thead=t.createTHead(),hr=thead.insertRow();hr.insertCell().textContent='Resumo';
    months.forEach(m=>{const th=document.createElement('th');th.scope='col';th.textContent=monthName(m.month).slice(0,3);hr.append(th);});
    const tbody=t.createTBody();
    [['Entradas','entradas'],['Saídas','despesas'],['Pago','pago'],['Pendente','pendente'],['Saldo previsto','saldo']].forEach(([label,key])=>{const row=tbody.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=label;row.append(th);months.forEach(m=>{const c=row.insertCell();c.textContent=money(m.metrics[key]);c.className=key==='entradas'?'income':key==='despesas'?'expense':'';});});table.append(t);
    months.forEach(m=>{
      const card=document.createElement('article');card.className='mlg-month-mini';
      const go=document.createElement('button');go.type='button';go.className='mlg-month-open';go.textContent=monthName(m.month)+' ↗';go.onclick=()=>{MLGFinance.goTo(`${year}-${String(m.month+1).padStart(2,'0')}-01`);document.querySelector('[data-view=desk]').click();};card.append(go);
      const totals=document.createElement('div');totals.className='mlg-month-totals';
      [['Entradas',m.metrics.entradas,'income'],['Saídas',m.metrics.despesas,'expense']].forEach(([label,value,cls])=>{const el=document.createElement('p');el.textContent=label;const strong=document.createElement('strong');strong.className=cls;strong.textContent=money(value);el.append(strong);totals.append(el);});card.append(totals);
      const paid=document.createElement('p');paid.className='mlg-mini-paid';paid.textContent=`Pago ${money(m.metrics.pago)} · Pendente ${money(m.metrics.pendente)}`;card.append(paid);
      const list=document.createElement('div');list.className='mlg-mini-items';list.hidden=!annual.querySelector('[data-detail]').checked;
      ['entradas','despesas'].forEach(type=>{m.data[type].forEach(item=>{const row=document.createElement('div');row.className=item.pago?'is-paid':'';const name=document.createElement('span'),amount=document.createElement('b');name.textContent=(type==='entradas'?'+ ':'− ')+item.nome;amount.textContent=money(item.valor)+(type==='despesas'?(item.pago?' ✓':' · pendente'):'');row.append(name,amount);list.append(row);});});if(!list.childElementCount)list.textContent='Nenhum lançamento.';card.append(list);grid.append(card);
    });
  }
  annual.querySelector('[data-prev]').onclick=()=>{year=Math.max(1900,year-1);render();};annual.querySelector('[data-next]').onclick=()=>{year=Math.min(2200,year+1);render();};annual.querySelector('[data-detail]').onchange=render;
  window.addEventListener('mlg-finance-change',()=>{if(document.body.classList.contains('mlg-year'))render();});window.addEventListener('mlg-view-change',()=>{if(document.body.classList.contains('mlg-year')){year=Number(MLGFinance.getDate().slice(0,4));render();}});render();
 }
 if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
