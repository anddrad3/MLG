/* Reuse the existing editors and calculator: one state, no duplicate inputs. */
(() => {
  function init(){
    const calculator=document.getElementById('calculator-window'),entries=document.querySelector('.sheet-panel-entradas'),ledger=entries.parentElement,notes=document.querySelector('.annotation-panel-geral').parentElement;
    const wrapper=document.createElement('section');wrapper.id='mlg-workspace';wrapper.setAttribute('aria-label','Mesa de trabalho financeira');ledger.before(wrapper);wrapper.append(ledger,notes);
    ledger.id='mlg-work-ledger';notes.id='mlg-work-notes';
    const columnNotes=[...ledger.querySelectorAll('.annotation-panel')].map(panel=>{const original=panel.parentElement,details=document.createElement('details'),summary=document.createElement('summary');details.className='mlg-column-notes';summary.textContent=panel.querySelector('label').textContent;original.before(details);details.append(summary,original);return details;});
    const slot=document.createElement('aside');slot.id='mlg-work-calculator';slot.setAttribute('aria-label','Calculadora da mesa');wrapper.append(slot);
    const deskTabs=document.createElement('nav');deskTabs.id='mlg-desk-tabs';deskTabs.setAttribute('aria-label','Painéis da mesa de trabalho');deskTabs.innerHTML='<button type="button" data-desk-panel="ledger" aria-controls="mlg-work-ledger">Contas</button><button type="button" data-desk-panel="notes" aria-controls="mlg-work-notes">Notas</button><button type="button" data-desk-panel="calculator" aria-controls="mlg-work-calculator">Calculadora</button>';wrapper.before(deskTabs);
    function setDeskPanel(panel){wrapper.dataset.panel=panel;deskTabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.deskPanel===panel)));}
    deskTabs.addEventListener('click',e=>{const button=e.target.closest('[data-desk-panel]');if(button)setDeskPanel(button.dataset.deskPanel);});setDeskPanel('ledger');
    document.getElementById('calculator-button').addEventListener('click',()=>setDeskPanel('calculator'));
    const noteHeader=notes.querySelector('.annotation-header'),saveNotes=document.getElementById('salvar-anotacao-geral');
    if(saveNotes)noteHeader.append(saveNotes);
    const toolbar=document.createElement('div');toolbar.className='mlg-work-toolbar';toolbar.innerHTML='<div><strong>Seu mês em foco</strong><small>Contas, notas e cálculos no mesmo lugar.</small></div><div class="mlg-view-switch" role="group" aria-label="Visualização do Financeiro"><button type="button" data-view="overview">Visão geral</button><button type="button" data-view="desk">Mesa de trabalho</button></div>';
    document.getElementById('indicators-grid').before(toolbar);
    const yearButton=document.createElement('button');yearButton.type='button';yearButton.dataset.view='year';yearButton.textContent='Ano completo';toolbar.querySelector('.mlg-view-switch').append(yearButton);
    function setView(mode){if(!['overview','desk','year'].includes(mode))mode='desk';const desk=mode==='desk';document.body.classList.toggle('mlg-desk',desk);document.body.classList.toggle('mlg-year',mode==='year');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));columnNotes.forEach(d=>d.open=false);MLGFinance.dockCalculator(desk,desk?slot:document.body);slot.hidden=!desk;try{localStorage.setItem('mlg.financeView',mode);}catch{};window.dispatchEvent(new Event('mlg-view-change'));}
    toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);});
    setView(localStorage.getItem('mlg.financeView')||'desk');
  }
  if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
