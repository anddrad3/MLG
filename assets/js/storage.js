/* Per-profile browser storage, with a zero-copy adapter for the original profile. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.MLGStorage=factory(root.localStorage);})(typeof window!=='undefined'?window:globalThis,function(raw){
 const keysAllowed=new Set(['financialControlState','profilePicData','userBio','theme','homeApps','trashApps','mlg.notes.v1','mlg.financeView','mlg.ledgerView']);
 let active='',legacy='';
 const prefix=id=>'mlg.user.'+id+'.';
 function path(key,id=active){if(!id)throw Error('Entre em um perfil antes de acessar seus dados.');if(!keysAllowed.has(key))throw Error('Chave de armazenamento desconhecida.');return id===legacy?key:prefix(id)+key;}
 function check(){const registry=JSON.parse(raw.getItem('mlg.accounts.v2')||'null');if(registry&&!registry.profiles.some(p=>p.id===active))throw Error('Este perfil foi removido. Reabra o MLG.');}
 return {bind(id,legacyOwner=''){active=id;legacy=legacyOwner||'';},get activeId(){return active;},getItem(key){return raw.getItem(path(key));},setItem(key,value){check();raw.setItem(path(key),String(value));},removeItem(key){check();raw.removeItem(path(key));},keys(id=active){return [...keysAllowed].filter(k=>raw.getItem(path(k,id))!==null);},snapshot(id=active){return Object.fromEntries(this.keys(id).map(k=>[k,raw.getItem(path(k,id))]));},removeProfileData(id){this.keys(id).forEach(k=>raw.removeItem(path(k,id)));},hasLegacyData(){return [...keysAllowed].some(k=>raw.getItem(k)!==null);},ownsEvent(key){return active&&[...keysAllowed].some(k=>path(k)===key);}};
});
