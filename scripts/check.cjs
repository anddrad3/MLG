const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
for(const folder of ['assets/js','server','tests','scripts'])for(const name of fs.readdirSync(folder))if(/\.(js|cjs)$/.test(name))execFileSync(process.execPath,['--check',path.join(folder,name)],{stdio:'inherit'});
for(const file of ['index.html','financeiro/index.html']){
 const html=fs.readFileSync(file,'utf8');
 for(const [,relative] of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png))"/g)){
  if(relative.startsWith('http'))continue;
  if(!fs.existsSync(path.resolve(path.dirname(file),relative)))throw Error(`Missing: ${relative}`);
 }
}
console.log('JavaScript syntax and local assets OK.');
