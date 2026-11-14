/* Reference presentation only; all exported contents come from the user's local data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./andrade-layout.js'),require('./domain.js'));else root.MLGAndradeExport=factory(root.MLGAndradeLayout,root.MLGDomain);})(typeof globalThis!=='undefined'?globalThis:this,(layout,domain)=>{
  const months=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const clone=o=>JSON.parse(JSON.stringify(o)),letter=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
  function applyLayout(sheet,template,mapRow=r=>r){
    sheet.properties.defaultRowHeight=template.defaultRowHeight||15;
    template.columns.forEach((column,i)=>{sheet.getColumn(i+1).width=column.width;sheet.getColumn(i+1).hidden=!!column.hidden;});
    Object.entries(template.rowHeights).forEach(([r,h])=>sheet.getRow(mapRow(Number(r))).height=h);
    Object.entries(template.cellStyles).forEach(([address,id])=>{const [,col,row]=address.match(/^([A-Z]+)(\d+)$/);sheet.getCell(col+mapRow(Number(row))).style=clone(layout.styles[id]);});
    template.merges.forEach(range=>sheet.mergeCells(range.replace(/\d+/g,r=>mapRow(Number(r)))));
    sheet.views=[{showGridLines:false,zoomScale:65}];sheet.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0};
  }
  function build(ExcelJS,{years,getMonth,portableRows,portableNotes}){
    const workbook=new ExcelJS.Workbook();workbook.creator='MLG';workbook.created=new Date();workbook.calcProperties.fullCalcOnLoad=true;
    const references=[['Aba','Linha','Mes','Tipo','ID']];
    years.forEach(year=>{
      const data=months.map((_,m)=>getMonth(year+'-'+m)||{}),items=(m,type)=>[...(data[m][type]||[]),...(data[m].simulationTemplates||[]).filter(i=>i.type===type)];
      const extraIn=Math.max(0,...data.map((_,m)=>items(m,'entradas').length-4)),extraFirst=Math.max(0,...data.slice(0,6).map((_,m)=>items(m,'despesas').length-27)),extraSecond=Math.max(0,...data.slice(6).map((_,m)=>items(m+6,'despesas').length-33));
      const map=r=>r+(r>=8?extraIn:0)+(r>=38?extraFirst:0)+(r>=50?extraIn:0)+(r>=86?extraSecond:0);
      const sheet=workbook.addWorksheet('PLANILHA DE CONTAS '+year);applyLayout(sheet,layout.contas,map);
      function copyExtra(start,count,source){for(let r=start;r<start+count;r++){sheet.getRow(r).height=sheet.getRow(source).height||45;for(let c=1;c<=25;c++)sheet.getCell(r,c).style=clone(sheet.getCell(source,c).style);}}
      copyExtra(map(8)-extraIn,extraIn,map(7));copyExtra(map(38)-extraFirst,extraFirst,map(37));copyExtra(map(50)-extraIn,extraIn,map(49));copyExtra(map(86)-extraSecond,extraSecond,map(85));
      data.forEach((month,m)=>{
        const c=2+(m%6)*4,start=m<6?2:44,total=m<6?8:50,expense=m<6?11:53,end=m<6?37:85,summary=end+1;
        const cell=(r,col=c)=>sheet.getCell(map(r),col),valueCol=letter(c+1),statusCol=letter(c+2);
        cell(start).value=months[m];cell(start+1).value='ENTRADAS';cell(total).value='TOTAL';cell(total+1).value='DÍVIDAS';['DESCRIÇÃO','VALOR','STATUS'].forEach((v,i)=>cell(total+2,c+i).value=v);
        items(m,'entradas').forEach((item,i)=>{const r=map(start+2)+i;references.push([sheet.name,r,year+'-'+m,'entradas',String(item.id)]);sheet.getCell(r,c).value=item.nome;sheet.getCell(r,c+1).value=item.valor;sheet.getCell(r,c+1).numFmt='"R$" #,##0.00';});
        const formula=(r,f,result)=>{cell(r,c+1).value={formula:f,result};cell(r,c+1).numFmt='"R$" #,##0.00';};
        const income=items(m,'entradas').reduce((s,i)=>s+i.valor,0),expenses=items(m,'despesas'),sum=expenses.reduce((s,i)=>s+i.valor,0),paid=expenses.filter(i=>i.pago||i.paymentState==='simulation').reduce((s,i)=>s+i.valor,0);
        formula(total,'SUM('+valueCol+(map(start+2))+':'+valueCol+(map(total)-1)+')',income);
        const expenseEnd=map(summary)-1;
        sheet.addConditionalFormatting({ref:statusCol+map(expense)+':'+statusCol+expenseEnd,rules:Object.entries({paid:'PAGO',pending:'NÃO PAGO',scheduled:'AINDA NÃO',simulation:'SIMULAÇÃO!!!!!',on_hold:'ON HOLD'}).map(([state,text],index)=>({type:'expression',priority:index+1,formulae:[statusCol+map(expense)+'="'+text+'"'],style:clone(layout.statusStyles[state])}))});
        for(let r=map(expense);r<=expenseEnd;r++){const status=sheet.getCell(r,c+2);status.value='ON HOLD';Object.assign(status.style,clone(layout.statusStyles.on_hold));status.dataValidation={type:'list',allowBlank:true,formulae:['"ON HOLD,SIMULAÇÃO!!!!!,NÃO PAGO,PAGO,AINDA NÃO"']};}
        expenses.forEach((item,i)=>{const r=map(expense)+i,state=item.pago?'paid':item.paymentState||'on_hold';references.push([sheet.name,r,year+'-'+m,'despesas',String(item.id)]);sheet.getCell(r,c).value=item.nome;sheet.getCell(r,c+1).value=item.valor;sheet.getCell(r,c+1).numFmt='"R$" #,##0.00';sheet.getCell(r,c+2).value={paid:'PAGO',pending:'NÃO PAGO',scheduled:'AINDA NÃO',simulation:'SIMULAÇÃO!!!!!',on_hold:'ON HOLD'}[state]||'ON HOLD';Object.assign(sheet.getCell(r,c+2).style,clone(layout.statusStyles[state]||layout.statusStyles.on_hold));});
        ['TOTAL DE DÍVIDAS','QUANTO FALTA DE ENTRADA?','QUANTO SOBRA DE ENTRADA?','QUANTO JÁ FOI PAGO NESSE MÊS?','QUANTO FALTA PAGAR NESSE MÊS?'].forEach((v,i)=>cell(summary+i).value=v);
        const range=valueCol+map(expense)+':'+valueCol+expenseEnd,statusRange=statusCol+map(expense)+':'+statusCol+expenseEnd;
        formula(summary,'SUM('+range+')',sum);formula(summary+1,'MAX(0,'+valueCol+map(summary)+'-'+valueCol+map(total)+')',Math.max(0,sum-income));formula(summary+2,'MAX(0,'+valueCol+map(total)+'-'+valueCol+map(summary)+')',Math.max(0,income-sum));formula(summary+3,'SUMIF('+statusRange+',"PAGO",'+range+')+SUMIF('+statusRange+',"SIMULAÇÃO!!!!!",'+range+')',paid);formula(summary+4,valueCol+map(summary)+'-'+valueCol+map(summary+3),sum-paid);
      });
      sheet.pageSetup.printArea='A1:Y'+map(91);
      const notes=workbook.addWorksheet('PLANILHA DE RESUMOS '+year);applyLayout(notes,layout.resumos);
      data.forEach((month,m)=>{const row=m<6?2:31,col=2+(m%6)*3;notes.getCell(row,col).value=months[m];notes.getCell(row+1,col).value='RESUMO';notes.getCell(row+2,col).value=month.geralAnotacao||'';});notes.pageSetup.printArea='A1:S59';
    });
    const canonical=workbook.addWorksheet('MLG Lancamentos');canonical.addRows(portableRows||[]);canonical.state='hidden';const notes=workbook.addWorksheet('MLG Anotacoes');notes.addRows(portableNotes||[]);notes.state='hidden';const refs=workbook.addWorksheet('MLG Referencias');refs.addRows(references);refs.state='hidden';return workbook;
  }
  return {build};
});
