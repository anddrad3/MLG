const test = require('node:test');
const assert = require('node:assert/strict');
const {importStatus,exportStatus,installments,validateCommand} = require('../assets/js/domain.js');
test('five spreadsheet statuses round trip, including blank status',()=>{
  const cases=[['','on_hold','On hold'],['on hold','on_hold','On hold'],['simulação','simulation','Simulação'],['não pago','pending','Não pago'],['pago','paid','Pago'],['ainda não','scheduled','Ainda não']];
  for(const [input,state,label] of cases){assert.equal(importStatus(input),state);assert.equal(exportStatus({paymentState:state}),label);assert.equal(importStatus(label),state);}
});
test('installments retain cents and anchor day across February',()=>{
  const rows=installments({type:'despesas',name:'Compra',amount:100,date:'2027-01-31',installments:3,amountMode:'total'});
  assert.deepEqual(rows.map(r=>r.data),['2027-01-31','2027-02-28','2027-03-31']);
  assert.deepEqual(rows.map(r=>r.valor),[33.34,33.33,33.33]);
});
test('explicit per-installment value is not divided',()=>{
  const rows=installments({type:'entradas',name:'Serviço',amount:100,date:'2026-12-01',installments:2,amountMode:'per_installment'});
  assert.deepEqual(rows.map(r=>r.valor),[100,100]);assert.equal(rows[1].monthKey,'2027-0');
});
test('invalid or incomplete AI proposals never create transactions',()=>{
  const base={type:'despesas',name:'Conta',amount:10,date:'2026-12-01',installments:1,amountMode:'total'};
  for(const delta of [{amount:-1},{amount:NaN},{amount:0},{date:'2026-02-31'},{installments:0},{installments:361},{name:''},{type:'delete'},{amountMode:'guess'}]) assert.throws(()=>validateCommand({...base,...delta}));
});
