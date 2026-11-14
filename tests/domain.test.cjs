const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../assets/js/domain.js');
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
test('informal AI commands use the open month and normalize income/expense synonyms',()=>{
 const base={amount:50,name:'Mercado',installments:1,amountMode:'total',date:'2020-01-01'};
 for(const text of ['gastei 50 no mercado','saída de 50','paguei 50 a mais no mercado']){
  const command=domain.resolveAICommand({...base,type:''},'2026-11-01',text);assert.equal(command.type,'despesas');assert.equal(command.date,'2026-11-01');
 }
 for(const text of ['entrou 50','recebi 50','ganhei 50 a mais','50 a mais']){
  const command=domain.resolveAICommand({...base,type:'',name:''},'2026-11-01',text);assert.equal(command.type,'entradas');assert.equal(command.name,'Entrada extra');assert.equal(command.date,'2026-11-01');
 }
 assert.equal(domain.resolveAICommand({...base,type:'saida',date:'2026-12-10'},'2026-11-01','gastei 50 em dezembro dia 10').date,'2026-12-10');
 assert.throws(()=>domain.resolveAICommand({...base,type:'gasto',amount:0},'2026-11-01','gastei no mercado'),/valor/);
});
