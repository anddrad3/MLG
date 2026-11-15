'use strict';
const fs=require('node:fs'),path=require('node:path');
// Reserve before contacting Gemini. Counts survive restarts; failures count too.
function reserve(env,now=new Date()){
 const file=env.AI_USAGE_FILE||path.join(__dirname,'../data/ai-usage.json');
 const day=now.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),month=day.slice(0,7);
 const monthly=Math.min(200,Math.max(1,Number(env.AI_MONTHLY_REQUEST_LIMIT)||200));
 const daily=Math.min(30,Math.max(1,Number(env.AI_DAILY_REQUEST_LIMIT)||30));
 fs.mkdirSync(path.dirname(file),{recursive:true});
 let lock;
 try{
  lock=fs.openSync(file+'.lock','wx');
  let usage={month,monthCount:0,day,dayCount:0};
  if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.month===month)usage.monthCount=Number(old.monthCount)||0;if(old.day===day)usage.dayCount=Number(old.dayCount)||0;}
  if(usage.monthCount>=monthly||usage.dayCount>=daily)throw Object.assign(Error('A cota de segurança da IA foi atingida. Você ainda pode pesquisar e usar todas as opções manuais.'),{status:429});
  usage.monthCount++;usage.dayCount++;
  fs.writeFileSync(file+'.tmp',JSON.stringify(usage),{mode:0o600});fs.renameSync(file+'.tmp',file);
  return usage;
 }catch(error){if(error.status)throw error;throw Object.assign(Error('A IA está temporariamente indisponível para proteger sua cota. Tente mais tarde.'),{status:503});}
 finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(file+'.lock');}}
}
module.exports={reserve};
