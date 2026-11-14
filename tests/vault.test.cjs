const {test}=require('node:test'),assert=require('node:assert/strict'),vault=require('../assets/js/vault.js');
test('closing balances carry across years and retrospective changes propagate without overwriting later movements',()=>{
 let month='2026-10';let box=vault.hydrate({valor:100},()=>month);box.valor=150;
 month='2026-11';assert.equal(box.valor,150);box.valor+=20;
 month='2027-0';assert.equal(box.valor,170);
 month='2026-10';box.valor+=30;
 month='2027-0';assert.equal(box.valor,200);
 box=vault.hydrate(JSON.parse(JSON.stringify(box)),()=>month);assert.equal(box.valor,200);
 month='2026-9';assert.equal(box.valor,0);assert.equal(vault.active(box,month),false);
});
test('retroactive withdrawal reserves funds already withdrawn in later months',()=>{
 const box={openingMonth:'2026-0',openingValue:100,movements:{'2026-1':-80,'2026-2':50}};
 assert.equal(vault.available(box,'2026-0'),20);
});
