/* Reuse the existing editors and calculator: one state, no duplicate inputs. */
(() => {
  function init(){
    const calculator=document.getElementById('calculator-window'),entries=document.querySelector('.sheet-panel-entradas'),ledger=entries.parentElement,notes=document.querySelector('.annotation-panel-geral').parentElement;
    const wrapper=document.createElement('section');wrapper.id='mlg-workspace';wrapper.setAttribute('aria-label','Mesa de trabalho financeira');ledger.before(wrapper);wrapper.append(ledger,notes);
    ledger.id='mlg-work-ledger';notes.id='mlg-work-notes';
    const columnNotes=[...ledger.querySelectorAll('.annotation-panel')].map(panel=>{const original=panel.parentElement,details=document.createElement('details'),summary=document.createElement('summary');details.className='mlg-column-notes';summary.textContent=panel.querySelector('label').textContent;original.before(details);details.append(summary,original);return details;});
    const slot=document.createElement('aside');slot.id='mlg-work-calculator';slot.setAttribute('aria-label','Calculadora da mesa');wrapper.append(slot);
    const toolbar=document.createElement('div');toolbar.className='mlg-work-toolbar';toolbar.innerHTML='<div><strong>Seu mês em foco</strong><small>Contas, notas e cálculos no mesmo lugar.</small></div><div class="mlg-view-switch" role="group" aria-label="Visualização do Financeiro"><button type="button" data-view="overview">Visão geral</button><button type="button" data-view="desk">Mesa de trabalho</button></div>';
    document.getElementById('indicators-grid').before(toolbar);
    function setView(mode){const desk=mode==='desk';document.body.classList.toggle('mlg-desk',desk);toolbar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));columnNotes.forEach(d=>d.open=!desk);MLGFinance.dockCalculator(desk,desk?slot:document.body);slot.hidden=!desk;try{localStorage.setItem('mlg.financeView',mode);}catch{};}
    toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);});
    setView(localStorage.getItem('mlg.financeView')||'desk');
  }
  if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
