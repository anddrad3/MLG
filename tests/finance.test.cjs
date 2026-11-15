const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const domain=require('../assets/js/domain.js');
const XLSX=require('../assets/vendor/xlsx.full.min.js');
async function app(t,state){
  const html=fs.readFileSync('financeiro/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:'http://localhost/financeiro/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.MLGVault=require('../assets/js/vault.js');w.MLGDomain=domain;w.XLSX=XLSX;w.MLGAccount={ready:Promise.resolve(),unlock:async()=>true,renderBadge:()=>{}};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.localStorage.setItem('financialControlState',JSON.stringify(state || {currentDate:new Date(2026,10,1).getTime(),financialData:{}}));
  await new Promise(resolve=>w.document.readyState==='loading'?w.document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
  await new Promise(resolve=>setImmediate(resolve));
  const ready=new Promise(resolve=>w.addEventListener('mlg-finance-ready',resolve,{once:true}));
  w.eval(fs.readFileSync('assets/js/finance.js','utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await ready;
  const $=id=>w.document.getElementById(id);
  return {w,$,state:()=>JSON.parse(w.localStorage.getItem('financialControlState')),click:id=>$(id).click()};
}
const command=(type,amount)=>({type,name:type==='entradas'?'Receita teste':'Conta teste',amount,date:'2026-11-05',installments:1,amountMode:'total'});
test('redesign preserves ten aligned header controls, nested calendars and a live twelve-month overview',async t=>{
 const a=await app(t);a.w.MLGFinance.addCommand(command('entradas',100));a.w.MLGFinance.addCommand(command('despesas',25));
 a.w.eval(fs.readFileSync('assets/js/workspace.js','utf8'));a.w.eval(fs.readFileSync('assets/js/finance-design.js','utf8'));
 assert.equal(a.w.document.querySelector('.mlg-header-navigation').children.length,5);assert.equal(a.w.document.querySelector('.mlg-header-tools').children.length,5);
 assert.equal(a.$('search-button').hidden,true);assert.equal(a.$('mlg-profile').closest('header'),null);assert.equal(a.$('calendar-grid-modal').parentElement.id,'date-picker-modal');
 a.w.document.querySelector('[data-view=year]').click();assert.equal(a.w.document.querySelectorAll('.mlg-month-mini').length,12);assert.match(a.w.document.querySelector('.mlg-annual-table').textContent,/100,00/);
 a.w.MLGFinance.addCommand(command('despesas',5));assert.equal(a.w.MLGFinance.getYear(2026)[10].metrics.despesas,30);
 a.w.MLGFinance.addNote('Nota do chat');assert.match(a.$('geral-anotacao').value,/Nota do chat/);
});
test('chat uses local search and notes without model calls and rejects non-image attachments',async t=>{
 const a=await app(t);let requests=0;a.w.fetch=async()=>{requests++;throw Error('Unexpected network');};a.w.MLGVoice={attach:()=>({isActive:()=>false})};
 a.w.eval(fs.readFileSync('assets/js/assistant.js','utf8'));const input=a.w.document.querySelector('#mlg-ai textarea'),form=a.w.document.querySelector('#mlg-ai form');
 input.value='buscar internet';form.dispatchEvent(new a.w.Event('submit',{cancelable:true}));assert.equal(a.$('global-search-input').value,'internet');assert.equal(a.$('search-modal').classList.contains('hidden'),false);
 input.value='anote: conferir pagamento';form.dispatchEvent(new a.w.Event('submit',{cancelable:true}));a.w.document.querySelector('[data-confirm]').click();assert.match(a.$('geral-anotacao').value,/conferir pagamento/);assert.equal(requests,0);
 await a.$('mlg-ai').ondrop({preventDefault(){},dataTransfer:{files:[new a.w.File(['pdf'],'fake.pdf',{type:'application/pdf'})]}});assert.match(a.w.document.querySelector('#mlg-ai [role=status]').textContent,/Só aceito imagens/);assert.equal(requests,0);
});
test('image attached to an AI command survives serialization and undo removes the complete operation',async t=>{
 const a=await app(t),photo='data:image/jpeg;base64,/9j/VEVTVA==';a.w.MLGFinance.addCommand({...command('despesas',50),installments:2},photo);
 assert.equal(a.state().financialData['2026-10'].despesas[0].foto,photo);assert.equal(a.state().financialData['2026-11'].despesas[0].foto,photo);
 a.w.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));assert.equal(a.state().financialData['2026-10']?.despesas?.length||0,0);
});
test('notes save on input and survive a fresh application instance',async t=>{
  const a=await app(t);a.$('geral-anotacao').value='Salvar sem clicar';a.$('geral-anotacao').dispatchEvent(new a.w.Event('input'));
  const b=await app(t,a.state());assert.equal(b.$('geral-anotacao').value,'Salvar sem clicar');
});
test('cancel leftover distribution restores checkbox and does not fabricate income',async t=>{
  const a=await app(t);a.w.MLGFinance.addCommand(command('entradas',1000));a.w.MLGFinance.addCommand(command('despesas',100));
  a.w.document.querySelector('.item-checkbox').click();assert.equal(a.$('sobras-modal').classList.contains('hidden'),false);
  a.click('sobras-cancelar-btn');const month=a.state().financialData['2026-10'];
  assert.equal(month.despesas[0].pago,false);assert.equal(a.w.document.querySelector('.item-checkbox').checked,false);assert.equal(month.entradas.length,1);
});
test('sandbox edits never write the real cache and ending restores data',async t=>{
  const a=await app(t);a.w.MLGFinance.addCommand(command('entradas',1000));const before=a.w.localStorage.getItem('financialControlState');
  a.click('simulation-mode-toggle-btn');a.w.MLGFinance.addCommand(command('despesas',555));
  assert.equal(a.w.localStorage.getItem('financialControlState'),before);
  assert.match(a.$('despesas-list-container').textContent,/Conta teste/);
  a.click('simulation-end-btn');assert.equal(a.state().financialData['2026-10'].despesas.length,0);
});
test('Ctrl+Z reverses all installments as one operation',async t=>{
  const a=await app(t);a.w.MLGFinance.addCommand({...command('despesas',100),installments:3});
  a.w.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
  const count=Object.values(a.state().financialData).reduce((n,m)=>n+m.despesas.length,0);assert.equal(count,0);
});
test('calculator uses the non-blurring modal class',async t=>{
  const a=await app(t);a.click('calculator-button');assert.equal(a.w.document.body.classList.contains('calculator-only'),true);
  a.click('close-calculator-button');assert.equal(a.w.document.body.classList.contains('calculator-only'),false);
});
async function importRows(a,rows,notes){
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'MLG Lancamentos');
  if(notes)XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(notes),'MLG Anotacoes');
  return importWorkbook(a,workbook);
}
async function importWorkbook(a,workbook){
  const bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
  Object.defineProperty(a.$('import-spreadsheet-input'),'files',{configurable:true,value:[{name:'fixture.xlsx',arrayBuffer:async()=>bytes}]});
  a.$('import-spreadsheet-input').dispatchEvent(new a.w.Event('change'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(a.$('import-confirm-btn').disabled,false);
  a.click('import-confirm-btn');
}
test('real XLSX round trip preserves statuses, installments and all notes, skips blanks and duplicates',async t=>{
  const a=await app(t);
  const rows=[['ID','Tipo','Descrição','Valor','Data','Mês','Ano','Status','Parcela','Parcelas'],
    ['1','entradas','Salário',1000,'2026-11-01',11,2026,'Pago','',''],
    ['2','despesas','Em espera',20,'',11,2026,'','',''],
    ['3','despesas','Teste',30,'',11,2026,'Simulação','',''],
    ['4','despesas','Internet',40,'',11,2026,'Não pago',2,10],
    ['5','despesas','Energia',50,'',11,2026,'Pago','',''],
    ['6','despesas','Futuro',60,'',11,2026,'Ainda não','',''],
    ['','','','','',11,2026,'On hold','','']];
  const notes=[['Mes','Tipo','Texto'],['2026-10','geral','Nota geral'],['2026-10','entradas','Nota receita'],['2026-10','despesas','Nota despesa']];
  await importRows(a,rows,notes);await importRows(a,rows,notes);
  let month=a.state().financialData['2026-10'];
  assert.equal(month.entradas.length,1);assert.equal(month.despesas.length,4);assert.equal(month.simulationTemplates.length,1);
  assert.deepEqual(month.despesas.map(i=>i.paymentState),['on_hold','pending','paid','scheduled']);
  assert.equal(month.despesas[1].occurrenceTotal,10);assert.equal(month.geralAnotacao,'Nota geral');
  const b=await app(t);await importRows(b,a.w.MLGFinance.exportRows(),a.w.MLGFinance.exportNotes());
  const restored=b.state().financialData['2026-10'];
  assert.equal(restored.despesas.length,4);assert.equal(restored.entradas.length,1);assert.equal(restored.simulationTemplates.length,1);
  assert.equal(restored.entradasAnotacao,'Nota receita');assert.equal(restored.despesasAnotacao,'Nota despesa');
  assert.equal(b.w.MLGFinance.exportRows().length,7,'in-memory rows after import');
  b.click('simulation-mode-toggle-btn');assert.match(b.$('despesas-list-container').textContent,/Teste/, `date=${b.$('date-display').textContent} rows=${JSON.stringify(b.w.MLGFinance.exportRows())} toast=${b.$('sr-announcer').textContent}`);
  b.click('simulation-end-btn');assert.equal(b.state().financialData['2026-10'].despesas.length,4);
});
test('reimport updates description, amount and payment instead of adding duplicates',async t=>{
 const a=await app(t),rows=[['ID','Tipo','Descrição','Valor','Mês','Ano','Status'],['ref-1','despesas','Conta',20,11,2026,'Não pago']];
 await importRows(a,rows);rows[1][2]='Conta corrigida';rows[1][3]=35;rows[1][6]='Pago';await importRows(a,rows);
 const items=a.state().financialData['2026-10'].despesas;assert.equal(items.length,1);assert.equal(items[0].nome,'Conta corrigida');assert.equal(items[0].valor,35);assert.equal(items[0].pago,true);
});
test('Andrade visible edits override hidden metadata and preserve dates and installments',async t=>{
 const a=await app(t);a.w.MLGFinance.addCommand({...command('despesas',100),installments:3});
 const exporter=require('../assets/js/andrade-export.js'),ExcelJS=require('../assets/vendor/exceljs.min.js');
 const wb=exporter.build(ExcelJS,{years:[2026,2027],getMonth:k=>a.state().financialData[k],portableRows:JSON.parse(JSON.stringify(a.w.MLGFinance.exportRows())),portableNotes:JSON.parse(JSON.stringify(a.w.MLGFinance.exportNotes()))});
 wb.getWorksheet('PLANILHA DE CONTAS 2026').getCell('R53').value='Conta corrigida';wb.getWorksheet('PLANILHA DE CONTAS 2026').getCell('S53').value=44;wb.getWorksheet('PLANILHA DE CONTAS 2026').getCell('T53').value='PAGO';
 const imported=XLSX.read(await wb.xlsx.writeBuffer());await importWorkbook(a,imported);
 const items=a.state().financialData['2026-10'].despesas;assert.equal(items.length,1,JSON.stringify(items));assert.equal(items[0].nome,'Conta corrigida');assert.equal(items[0].valor,44);assert.equal(items[0].pago,true);assert.equal(items[0].data,'2026-11-05');assert.equal(items[0].occurrenceTotal,3);
});
test('calculator keyboard and paid sorting work without paginated lists',async t=>{
 const a=await app(t);a.click('calculator-button');
 for(const key of ['1','2','+','3','Enter'])a.w.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 assert.match(a.$('calculator-window').textContent,/15/);a.click('close-calculator-button');
 a.w.MLGFinance.addCommand(command('despesas',50));const card=a.w.document.querySelector('.item-entry-card');card.click();assert.equal(card.classList.contains('is-selected'),true);
 card.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));assert.equal(a.$('delete-item-modal').classList.contains('hidden'),false);a.click('delete-item-confirm-btn');assert.equal(a.state().financialData['2026-10'].despesas.length,0);
});
test('private reference imports exact counts without totals, placeholders or repeated rows',{skip:!process.env.MLG_REFERENCE_WORKBOOK},async t=>{
 const a=await app(t),workbook=XLSX.read(fs.readFileSync(process.env.MLG_REFERENCE_WORKBOOK));
 await importWorkbook(a,workbook);await importWorkbook(a,workbook);
 const months=Object.values(a.state().financialData);assert.equal(months.reduce((n,m)=>n+m.entradas.length,0),271);assert.equal(months.reduce((n,m)=>n+m.despesas.length,0),1460);assert.equal(a.w.MLGFinance.exportNotes().length-1,37);
});
test('currency input retains Brazilian cents across repeated blur',async t=>{
  const a=await app(t),field=a.$('sobras-cofre-input');field.value='1.234,56';
  field.dispatchEvent(new a.w.Event('blur'));assert.equal(field.value,'1234,56');
  field.dispatchEvent(new a.w.Event('blur'));assert.equal(field.value,'1234,56');
});
test('deposit, withdrawal and undo conserve money without synthetic income',async t=>{
  const a=await app(t);a.w.MLGFinance.addCommand(command('entradas',1000));
  a.click('open-caixinha-editor-btn');a.$('caixinha-nome-input').value='Reserva';a.click('caixinha-editor-salvar-btn');
  a.w.document.querySelector('[data-action=deposit]').click();
  const form=a.w.document.querySelector('dialog form');form.elements.amount.value='200,50';
  form.dispatchEvent(new a.w.Event('submit',{cancelable:true}));
  assert.equal(a.state().caixinhas[0].valor,200.5);assert.equal(a.state().financialData['2026-10'].entradas.length,1);
  a.w.document.querySelector('[data-action=withdraw]').click();a.$('retirar-valor-input').value='50,25';a.click('retirar-confirmar-btn');
  assert.equal(a.state().caixinhas[0].valor,150.25);assert.equal(a.state().financialData['2026-10'].entradas.length,1);
  a.click('undo-action-button');assert.equal(a.state().caixinhas[0].valor,200.5);
});
test('clear all requires exact confirmation, preserves profile and cannot restore old data on reload or undo',async t=>{
 const a=await app(t);a.w.localStorage.setItem('mlg.account.v1','{"name":"Preservado"}');a.w.localStorage.setItem('mlg.notes.v1','Nota da página inicial');
 a.w.MLGFinance.addCommand({...command('despesas',60),installments:3});a.$('geral-anotacao').value='Nota financeira';a.$('geral-anotacao').dispatchEvent(new a.w.Event('input'));
 a.click('clear-financial-data-btn');let dialog=a.$('mlg-clear-finance-dialog');assert.equal(dialog.querySelector('[type=submit]').disabled,true);dialog.querySelector('[data-cancel]').click();assert.equal(a.state().financialData['2026-10'].despesas.length,1);
 a.click('clear-financial-data-btn');dialog=a.$('mlg-clear-finance-dialog');const form=dialog.querySelector('form');form.elements.confirmation.value='APAGAR FINANCEIRO';form.elements.confirmation.dispatchEvent(new a.w.Event('input'));form.dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 a.w.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
 assert.equal(Object.values(a.state().financialData).reduce((n,m)=>n+m.despesas.length+m.entradas.length,0),0);assert.equal(a.state().caixinhas.length,0);assert.equal(a.state().recurringSeries.length,0);assert.equal(a.state().trash.length,0);assert.equal(a.w.localStorage.getItem('mlg.account.v1'),'{"name":"Preservado"}');assert.equal(a.w.localStorage.getItem('mlg.notes.v1'),'Nota da página inicial');
 const b=await app(t,a.state());assert.equal(b.$('geral-anotacao').value,'');assert.equal(b.w.MLGFinance.exportRows().length,1);
});
test('workspace keeps one notes editor and calculator keyboard does not consume typing in notes',async t=>{
 const a=await app(t);a.w.eval(fs.readFileSync('assets/js/workspace.js','utf8'));
 assert.equal(a.w.document.querySelectorAll('#geral-anotacao').length,1);assert.equal(a.$('calculator-window').parentElement.id,'mlg-work-calculator');assert.equal(a.w.document.body.classList.contains('modal-open'),false);
 const note=a.$('geral-anotacao');note.value='Planejamento';note.dispatchEvent(new a.w.Event('input'));note.focus();const key=new a.w.KeyboardEvent('keydown',{key:'9',bubbles:true,cancelable:true});note.dispatchEvent(key);assert.equal(key.defaultPrevented,false);
 const number=a.$('calculator-window').querySelector('[data-key="2"]');number.focus();for(const key of ['2','+','3','Enter'])number.dispatchEvent(new a.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));assert.equal(a.$('calculator-display').textContent,'5');
 a.w.document.querySelector('[data-view="overview"]').click();assert.equal(a.$('calculator-window').parentElement,a.w.document.body);assert.equal(a.state().financialData['2026-10'].geralAnotacao,'Planejamento');assert.equal(a.w.document.querySelectorAll('#calculator-window').length,1);
});

test('compact workspace preserves editors and controls while switching panels and views',async t=>{
 const a=await app(t),note=a.$('geral-anotacao'),calculator=a.$('calculator-window'),month=a.$('date-display'),boxes=a.$('mlg-box-menu');
 a.w.eval(fs.readFileSync('assets/js/workspace.js','utf8'));a.w.eval(fs.readFileSync('assets/js/finance-design.js','utf8'));
 const q=selector=>a.w.document.querySelector(selector),workspace=a.$('mlg-workspace');
 assert.equal(q('.mlg-header-center .mlg-view-switch'),q('.mlg-view-switch'));
 assert.equal(q('.mlg-context-row #date-display'),month);assert.equal(q('.mlg-context-row #mlg-box-menu'),boxes);
 note.value='Notas mantidas ao trocar de painel';note.dispatchEvent(new a.w.Event('input'));
 for(const panel of ['notes','calculator','ledger','notes']){
  q(`[data-desk-panel="${panel}"]`).click();assert.equal(workspace.dataset.panel,panel);
  assert.equal(q('#mlg-desk-tabs [aria-pressed="true"]').dataset.deskPanel,panel);
  assert.equal(a.$('geral-anotacao'),note);assert.equal(a.$('calculator-window'),calculator);
 }
 assert.equal(note.value,'Notas mantidas ao trocar de painel');
 a.click('calculator-button');assert.equal(workspace.dataset.panel,'calculator');
 for(const view of ['year','overview','desk']){
  q(`[data-view="${view}"]`).click();assert.equal(q('.mlg-view-switch [aria-pressed="true"]').dataset.view,view);
  assert.equal(a.w.document.body.classList.contains('mlg-desk'),view==='desk');
  assert.equal(a.w.document.body.classList.contains('mlg-year'),view==='year');
 }
 assert.equal(calculator.parentElement.id,'mlg-work-calculator');assert.equal(a.w.document.querySelectorAll('#geral-anotacao').length,1);
 month.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(a.$('date-picker-modal').classList.contains('hidden'),false);
});

test('floating chat opens results and keeps unconfirmed changes visible without losing its composer',async t=>{
 const a=await app(t);let requests=0;a.w.fetch=async()=>{requests++;throw Error('Unexpected network');};a.w.MLGVoice={attach:()=>({isActive:()=>false})};
 a.w.eval(fs.readFileSync('assets/js/assistant.js','utf8'));
 const q=selector=>a.$('mlg-ai').querySelector(selector),response=q('.mlg-chat-response'),toggle=q('[data-chat-toggle]'),composer=q('form'),input=q('textarea');
 assert.equal(response.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(composer.hidden,false);
 toggle.click();assert.equal(response.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
 q('[data-chat-close]').click();assert.equal(response.hidden,true);assert.equal(composer.hidden,false);
 input.value='anote: revisar parcelas';composer.dispatchEvent(new a.w.Event('submit',{cancelable:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(response.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(q('.mlg-ai-review').hidden,false);
 q('[data-chat-close]').click();assert.equal(response.hidden,false);assert.equal(q('.mlg-ai-review').hidden,false);assert.equal(a.$('geral-anotacao').value,'');
 q('[data-confirm]').click();await new Promise(resolve=>setImmediate(resolve));assert.match(a.$('geral-anotacao').value,/revisar parcelas/);
 q('[data-chat-close]').click();assert.equal(response.hidden,true);assert.equal(q('form'),composer);assert.equal(composer.hidden,false);
 input.value='anote: não salvar';composer.dispatchEvent(new a.w.Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
 q('[data-cancel]').click();await new Promise(resolve=>setImmediate(resolve));q('[data-chat-close]').click();
 assert.equal(response.hidden,true);assert.doesNotMatch(a.$('geral-anotacao').value,/não salvar/);assert.equal(requests,0);
});
