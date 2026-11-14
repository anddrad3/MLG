const {test}=require('node:test'),assert=require('node:assert/strict'),ExcelJS=require('../assets/vendor/exceljs.min.js'),exporter=require('../assets/js/andrade-export.js'),layout=require('../assets/js/andrade-layout.js');
const data={'2026-0':{entradas:[{id:1,nome:'Receita exemplo',valor:1000}],despesas:[{id:2,nome:'Conta exemplo',valor:150,paymentState:'paid',pago:true},{id:3,nome:'Teste',valor:20,paymentState:'simulation'}],geralAnotacao:'Nota de exemplo'}};
test('Andrade workbook preserves template dimensions, three columns, notes, formulas and statuses after binary serialization',async()=>{
 const wb=exporter.build(ExcelJS,{years:[2026],getMonth:key=>data[key],portableRows:[['ID']],portableNotes:[['Mes']]});
 const bytes=await wb.xlsx.writeBuffer();const reloaded=new ExcelJS.Workbook();await reloaded.xlsx.load(bytes);const s=reloaded.getWorksheet('PLANILHA DE CONTAS 2026');
 assert.equal(s.getColumn(2).width,layout.contas.columns[1].width);assert.equal(s.getRow(23).height,layout.contas.rowHeights[23]);
 assert.equal(s.getCell('B2').value,'JANEIRO');assert.equal(s.getCell('B44').value,'JULHO');assert.equal(s.getCell('B4').value,'Receita exemplo');assert.equal(s.getCell('D11').value,'PAGO');assert.equal(s.getCell('D12').value,'SIMULAÇÃO!!!!!');assert.equal(s.getCell('E11').value,null);assert.equal(s.getCell('C38').value.result,170);
 assert.equal(reloaded.getWorksheet('PLANILHA DE RESUMOS 2026').getCell('B4').value,'Nota de exemplo');assert.equal(reloaded.getWorksheet('MLG Lancamentos').state,'hidden');
});
test('overflow rows expand the template without losing transactions or overlapping the next semester',()=>{
 const month={entradas:Array.from({length:7},(_,i)=>({id:i,nome:'Entrada '+i,valor:10})),despesas:Array.from({length:40},(_,i)=>({id:100+i,nome:'Despesa '+i,valor:2}))};
 const w=exporter.build(ExcelJS,{years:[2026],getMonth:k=>k==='2026-0'?month:{}}),s=w.getWorksheet('PLANILHA DE CONTAS 2026');
 assert.equal(s.getCell('B10').value,'Entrada 6');assert.equal(s.getCell('B53').value,'Despesa 39');assert.equal(s.getCell('B60').value,'JULHO');
});
