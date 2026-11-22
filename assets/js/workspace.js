/* Reuse the existing editors and calculator: one state, no duplicate inputs. */
(() => {
  function init(){
    const appStorage=window.MLGStorage||localStorage;
    const calculator=document.getElementById('calculator-window'),entries=document.querySelector('.sheet-panel-entradas'),ledger=entries.parentElement,notes=document.querySelector('.annotation-panel-geral').parentElement;
    const wrapper=document.createElement('section');wrapper.id='mlg-workspace';wrapper.setAttribute('aria-label','Mesa de trabalho financeira');ledger.before(wrapper);wrapper.append(ledger,notes);
    ledger.id='mlg-work-ledger';notes.id='mlg-work-notes';
    const expenses=ledger.querySelector('.sheet-panel-despesas'),ledgerTabs=document.createElement('div');
    entries.id='mlg-ledger-entradas';expenses.id='mlg-ledger-despesas';
    ledgerTabs.className='mlg-ledger-tabs';ledgerTabs.setAttribute('role','tablist');ledgerTabs.setAttribute('aria-label','Lançamentos na mesa');
    ledgerTabs.innerHTML='<button type="button" role="tab" id="mlg-ledger-tab-entradas" data-ledger="entradas" aria-controls="mlg-ledger-entradas">Entradas</button><button type="button" role="tab" id="mlg-ledger-tab-despesas" data-ledger="despesas" aria-controls="mlg-ledger-despesas">Despesas</button>';ledger.prepend(ledgerTabs);
    let ledgerType;try{ledgerType=appStorage.getItem('mlg.ledgerView');}catch{}if(!['entradas','despesas'].includes(ledgerType))ledgerType='despesas';
    function syncLedger(){const desk=document.body.classList.contains('mlg-desk');ledger.dataset.ledgerView=ledgerType;ledgerTabs.hidden=!desk;[entries,expenses].forEach((panel,i)=>{const type=i?'despesas':'entradas',selected=type===ledgerType;panel.hidden=desk&&!selected;if(panel.hidden)panel.querySelectorAll('.item-entry-card.is-selected').forEach(card=>{card.classList.remove('is-selected');card.setAttribute('aria-selected','false');});if(desk){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','mlg-ledger-tab-'+type);}else{panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');}const button=ledgerTabs.querySelector('[data-ledger='+type+']');button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});}
    function setLedger(type){ledgerType=type;syncLedger();try{appStorage.setItem('mlg.ledgerView',type);}catch{}}
    ledgerTabs.addEventListener('click',event=>{const button=event.target.closest('[data-ledger]');if(button)setLedger(button.dataset.ledger);});
    ledgerTabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setLedger(event.key==='Home'?'entradas':event.key==='End'?'despesas':ledgerType==='entradas'?'despesas':'entradas');ledgerTabs.querySelector('[aria-selected=true]').focus();});
    const columnNotes=[...ledger.querySelectorAll('.annotation-panel')].map(panel=>{const original=panel.parentElement,details=document.createElement('details'),summary=document.createElement('summary');details.className='mlg-column-notes';summary.textContent=panel.querySelector('label').textContent;original.before(details);details.append(summary,original);return details;});
    const slot=document.createElement('aside');slot.id='mlg-work-calculator';slot.setAttribute('aria-label','Calculadora da mesa');wrapper.append(slot);
    const deskTabs=document.createElement('nav');deskTabs.id='mlg-desk-tabs';deskTabs.setAttribute('aria-label','Painéis da mesa de trabalho');deskTabs.innerHTML='<button type="button" data-desk-panel="ledger" aria-controls="mlg-work-ledger">Contas</button><button type="button" data-desk-panel="notes" aria-controls="mlg-work-notes">Notas</button><button type="button" data-desk-panel="calculator" aria-controls="mlg-work-calculator">Calculadora</button>';wrapper.before(deskTabs);
    function setDeskPanel(panel){wrapper.dataset.panel=panel;deskTabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.deskPanel===panel)));}
    deskTabs.addEventListener('click',e=>{const button=e.target.closest('[data-desk-panel]');if(button)setDeskPanel(button.dataset.deskPanel);});setDeskPanel('ledger');
    document.getElementById('calculator-button').addEventListener('click',()=>setDeskPanel('calculator'));
    document.getElementById('simulation-mode-toggle-btn').addEventListener('click',()=>{setLedger('despesas');setDeskPanel('ledger');});
    window.addEventListener('mlg-show-transaction',event=>{if(!['entradas','despesas'].includes(event.detail?.type))return;setView('desk');setLedger(event.detail.type);setDeskPanel('ledger');});
    const noteHeader=notes.querySelector('.annotation-header'),saveNotes=document.getElementById('salvar-anotacao-geral');
    if(saveNotes)noteHeader.append(saveNotes);
    const toolbar=document.createElement('div');toolbar.className='mlg-work-toolbar';toolbar.innerHTML='<div><strong>Seu mês em foco</strong><small>Contas, notas e cálculos no mesmo lugar.</small></div><div class="mlg-view-switch" role="group" aria-label="Visualização do Financeiro"><button type="button" data-view="overview">Visão geral</button><button type="button" data-view="desk">Mesa de trabalho</button></div>';
    document.getElementById('indicators-grid').before(toolbar);
    const yearButton=document.createElement('button');yearButton.type='button';yearButton.dataset.view='year';yearButton.textContent='Ano completo';toolbar.querySelector('.mlg-view-switch').append(yearButton);
    function setView(mode){if(!['overview','desk','year'].includes(mode))mode='desk';const desk=mode==='desk';document.body.classList.toggle('mlg-desk',desk);document.body.classList.toggle('mlg-year',mode==='year');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));syncLedger();columnNotes.forEach(d=>d.open=false);MLGFinance.dockCalculator(desk,desk?slot:document.body);slot.hidden=!desk;try{appStorage.setItem('mlg.financeView',mode);}catch{};window.dispatchEvent(new Event('mlg-view-change'));}
    toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);});
    setView('overview');
  }
  if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
