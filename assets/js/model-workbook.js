/* A deterministic, fully fictional Andrade workbook. Never reads browser storage. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./andrade-export.js'),require('./domain.js'));
  else root.MLGModelWorkbook=factory(root.MLGAndradeExport,root.MLGDomain);
})(typeof globalThis!=='undefined'?globalThis:this,(exporter,domain)=>{
  const expenses=[
    ['Aluguel',1450],['Condomínio',280],['Energia elétrica',164.8],['Água',76.4],
    ['Internet',109.9],['Telefone',49.9],['Supermercado',620],['Feira',135],
    ['Transporte público',190],['Combustível',220],['Farmácia',63.5],['Plano de saúde',280],
    ['Curso de idiomas',120],['Material de estudo',42],['Academia',79.9],['Lazer',95],
    ['Restaurante',110],['Vestuário',70],['Cuidados pessoais',45],['Ração do pet',89.9],
    ['Consulta veterinária',55],['Manutenção da casa',85],['Assinatura de música',21.9],
    ['Livros',48],['Presentes',60],['Notebook — parcela',140],['Passeio planejado',75],
    ['Curso de fotografia',85],['Jardinagem',35],['Cinema',42],['Reparo da bicicleta',65],
    ['Férias planejadas',160],['Utensílios domésticos',57.5]
  ];
  const states=['paid','pending','scheduled','on_hold','paid','pending','simulation'];
  const money=n=>Math.round(n*100)/100;
  function fixture(firstYear=2026){
    if(!Number.isInteger(firstYear)||firstYear<2000||firstYear>2098)throw new Error('Escolha um ano entre 2000 e 2098.');
    const years=[firstYear,firstYear+1],data={};
    const portableRows=[['ID','Tipo','Descrição','Valor','Data','Mês','Ano','Status','Parcela','Parcelas']];
    const portableNotes=[['Mes','Tipo','Texto']];
    years.forEach((year,yearIndex)=>{
      for(let m=0;m<12;m++){
        const monthKey=year+'-'+m,date=day=>`${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const month={entradas:[],despesas:[],simulationTemplates:[]};data[monthKey]=month;
        const income=[['Salário Pessoa A',3900+yearIndex*180],['Salário Pessoa B',2850+yearIndex*150],['Trabalho extra',240+(m%4)*35],['Venda de artesanato',120+(m%3)*20]];
        income.forEach(([name,value],i)=>month.entradas.push({id:`modelo-${year}-${m}-e-${i}`,nome:name,valor:value,data:date(5+i*5),paymentState:'paid'}));
        expenses.slice(0,m<6?27:33).forEach(([name,value],i)=>{
          const paymentState=states[(i+m)%states.length];
          const item={id:`modelo-${year}-${m}-d-${i}`,nome:name,valor:money(value*(1+yearIndex*.04)+(i%4===0?(m%3)*2.5:0)),data:date(1+i%28),paymentState,pago:paymentState==='paid'};
          if(i===25){item.occurrenceIndex=m+1;item.occurrenceTotal=12;}
          if(paymentState==='simulation')month.simulationTemplates.push({...item,type:'despesas'});
          else month.despesas.push(item);
        });
        month.geralAnotacao=`EXEMPLO FICTÍCIO — ${String(m+1).padStart(2,'0')}/${year}\nReceitas, contas e pessoas são inventadas. Confira os valores, experimente os status e depois exporte novamente. Os itens SIMULAÇÃO aparecem ao ativar a simulação.`;
        month.entradasAnotacao='Receitas fictícias de duas pessoas, um trabalho extra e vendas de artesanato.';
        month.despesasAnotacao='Contas fictícias. PAGO já foi quitado; NÃO PAGO está pendente; AINDA NÃO fica para depois; ON HOLD está em espera. O notebook exemplifica 12 parcelas.';
        ['entradas','despesas'].forEach(type=>{
          [...month[type],...month.simulationTemplates.filter(item=>item.type===type)].forEach(item=>portableRows.push([String(item.id),type,item.nome,item.valor,item.data,m+1,year,domain.exportStatus(item),item.occurrenceIndex||'',item.occurrenceTotal||'']));
        });
        ['geral','entradas','despesas'].forEach(type=>portableNotes.push([monthKey,type,month[type+'Anotacao']]));
      }
    });
    return {years,data,portableRows,portableNotes};
  }
  function build(ExcelJS,firstYear=2026){
    const model=fixture(firstYear),workbook=exporter.build(ExcelJS,{years:model.years,getMonth:key=>model.data[key],portableRows:model.portableRows,portableNotes:model.portableNotes});
    workbook.title='MLG — Modelo Andrade com dados fictícios';
    workbook.subject='Dois anos de exemplos inteiramente fictícios para testar importação e exportação.';
    return workbook;
  }
  return {fixture,build,filename:(year=2026)=>`MLG_Modelo_Andrade_Ficticio_${year}_${year+1}.xlsx`};
});
