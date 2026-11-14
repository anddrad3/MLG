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
