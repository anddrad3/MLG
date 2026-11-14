/* Monthly investment ledger. A month's closing balance carries forward. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MLGVault=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const order=key=>{const [y,m]=String(key).split('-').map(Number);return y*12+m;};
  const round=n=>Math.round((Number(n)||0)*100)/100;
  function balance(box,key){if(order(key)<order(box.openingMonth))return 0;return round((box.openingValue||0)+Object.entries(box.movements||{}).reduce((sum,[month,value])=>sum+(order(month)<=order(key)?Number(value)||0:0),0));}
  function available(box,key){const later=Object.keys(box.movements||{}).filter(k=>order(k)>order(key));return Math.max(0,Math.min(balance(box,key),...later.map(k=>balance(box,k))));}
  function hydrate(entry,currentMonth){
    const box={...entry,openingMonth:entry.openingMonth||currentMonth(),openingValue:Number.isFinite(entry.openingValue)?entry.openingValue:round(entry.valor),movements:{...(entry.movements||{})}};
    Object.defineProperty(box,'valor',{enumerable:true,configurable:true,get(){return balance(box,currentMonth());},set(value){const key=currentMonth();if(order(key)<order(box.openingMonth))box.openingMonth=key;box.movements[key]=round((box.movements[key]||0)+round(value)-balance(box,key));}});
    return box;
  }
  const active=(box,key)=>order(key)>=order(box.openingMonth)&&(!box.deletedFromMonth||order(key)<order(box.deletedFromMonth));
  return {order,round,balance,available,hydrate,active};
});
