const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const ExcelJS=require('../assets/vendor/exceljs.min.js');
const XLSX=require('../assets/vendor/xlsx.full.min.js');
const model=require('../assets/js/model-workbook.js');
const exporter=require('../assets/js/andrade-export.js');
const layout=require('../assets/js/andrade-layout.js');

test('fictional Andrade model fills all template slots for two years without reading user state',async()=>{
  const fixture=model.fixture(2026),book=model.build(ExcelJS,2026);
  assert.deepEqual(fixture.years,[2026,2027]);assert.equal(Object.keys(fixture.data).length,24);
  assert.equal(fixture.portableRows.length,817);assert.equal(fixture.portableNotes.length,73);
  assert.equal(new Set(fixture.portableRows.slice(1).map(row=>row[0])).size,816);
  const binary=await book.xlsx.writeBuffer(),reloaded=new ExcelJS.Workbook();await reloaded.xlsx.load(binary);
  for(const year of fixture.years){
    const sheet=reloaded.getWorksheet('PLANILHA DE CONTAS '+year),notes=reloaded.getWorksheet('PLANILHA DE RESUMOS '+year);
    assert.equal(sheet.getColumn(2).width,layout.contas.columns[1].width);
    assert.equal(sheet.getRow(23).height,layout.contas.rowHeights[23]);
    for(let month=0;month<12;month++){
      const data=fixture.data[year+'-'+month],column=2+month%6*4,incomeStart=month<6?4:46,expenseStart=month<6?11:53,expenseEnd=month<6?37:85;
      for(let row=incomeStart;row<incomeStart+4;row++){assert.equal(typeof sheet.getCell(row,column).value,'string');assert.ok(sheet.getCell(row,column+1).value>0);}
      for(let row=expenseStart;row<=expenseEnd;row++){assert.equal(typeof sheet.getCell(row,column).value,'string');assert.ok(sheet.getCell(row,column+1).value>0);assert.match(sheet.getCell(row,column+2).value,/^(PAGO|NÃO PAGO|AINDA NÃO|ON HOLD|SIMULAÇÃO!!!!!)$/);}
      const total=[...data.despesas,...data.simulationTemplates].reduce((sum,item)=>sum+item.valor,0);
      assert.ok(Math.abs(sheet.getCell(expenseEnd+1,column+1).value.result-total)<.001);
      assert.match(notes.getCell(month<6?4:33,2+month%6*3).value,/EXEMPLO FICTÍCIO/);
    }
  }
  assert.equal(reloaded.getWorksheet('MLG Lancamentos').state,'hidden');
  assert.equal(reloaded.getWorksheet('MLG Referencias').rowCount,817);
  assert.throws(()=>model.fixture(2026.5),/ano/);
});

async function finance(t){
  const html=fs.readFileSync('financeiro/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:'http://localhost/financeiro/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());
  w.MLGVault=require('../assets/js/vault.js');w.MLGDomain=require('../assets/js/domain.js');w.XLSX=XLSX;
  w.MLGAccount={ready:Promise.resolve(),unlock:async()=>true,renderBadge:()=>{}};
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.localStorage.setItem('financialControlState',JSON.stringify({currentDate:new Date(2026,0,1).getTime(),financialData:{}}));
  await new Promise(resolve=>w.document.readyState==='loading'?w.document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
  await new Promise(resolve=>setImmediate(resolve));
  const ready=new Promise(resolve=>w.addEventListener('mlg-finance-ready',resolve,{once:true}));
  w.eval(fs.readFileSync('assets/js/finance.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await ready;
  const $=id=>w.document.getElementById(id);
  return {w,$,state:()=>JSON.parse(w.localStorage.getItem('financialControlState')),async import(bytes){
    Object.defineProperty($('import-spreadsheet-input'),'files',{configurable:true,value:[{name:'MLG_Modelo_Andrade_Ficticio_2026_2027.xlsx',arrayBuffer:async()=>bytes}]});
    $('import-spreadsheet-input').dispatchEvent(new w.Event('change'));await new Promise(resolve=>setImmediate(resolve));
    assert.equal($('import-confirm-btn').disabled,false);$('import-confirm-btn').click();
  }};
}
test('model imports 24 complete months, retains status/notes/installments, and exports without duplicates',async t=>{
  const source=model.fixture(2026),bytes=await model.build(ExcelJS,2026).xlsx.writeBuffer(),a=await finance(t);
  await a.import(bytes);await a.import(bytes);
  const state=a.state();assert.equal(Object.keys(state.financialData).length,24);
  for(const [key,expected] of Object.entries(source.data)){
    const actual=state.financialData[key];
    assert.equal(actual.entradas.length,4,key);assert.equal(actual.despesas.length,expected.despesas.length,key);assert.equal(actual.simulationTemplates.length,expected.simulationTemplates.length,key);
    assert.equal(actual.geralAnotacao,expected.geralAnotacao,key);assert.equal(actual.entradasAnotacao,expected.entradasAnotacao,key);assert.equal(actual.despesasAnotacao,expected.despesasAnotacao,key);
    const expectedItems=[...expected.despesas,...expected.simulationTemplates],items=[...actual.despesas,...actual.simulationTemplates];
    for(const item of expectedItems){const found=items.find(row=>row.nome===item.nome);assert.equal(found.valor,item.valor);assert.equal(found.paymentState,item.paymentState);assert.equal(found.data,item.data);if(item.occurrenceTotal){assert.equal(found.occurrenceTotal,12);assert.equal(found.occurrenceIndex,item.occurrenceIndex);}}
  }
  assert.equal(a.w.MLGFinance.exportRows().length,817);assert.equal(a.w.MLGFinance.exportNotes().length,73);
  const exported=exporter.build(ExcelJS,{years:source.years,getMonth:key=>state.financialData[key],portableRows:JSON.parse(JSON.stringify(a.w.MLGFinance.exportRows())),portableNotes:JSON.parse(JSON.stringify(a.w.MLGFinance.exportNotes()))});
  const b=await finance(t);await b.import(await exported.xlsx.writeBuffer());
  const normalize=rows=>JSON.parse(JSON.stringify(rows)).slice(1).map(row=>row.slice(1)).sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
  assert.deepEqual(normalize(b.w.MLGFinance.exportRows()),normalize(a.w.MLGFinance.exportRows()));
  assert.deepEqual(normalize(b.w.MLGFinance.exportNotes()),normalize(a.w.MLGFinance.exportNotes()));
});
