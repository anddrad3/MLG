const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {reserve}=require('../server/budget.cjs');
test('public AI quota survives reloads, enforces daily/monthly caps and fails closed on corruption',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mlg-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const env={AI_USAGE_FILE:path.join(dir,'usage.json'),AI_DAILY_REQUEST_LIMIT:1,AI_MONTHLY_REQUEST_LIMIT:2};
 reserve(env,new Date('2026-11-15T12:00:00Z'));assert.throws(()=>reserve(env,new Date('2026-11-15T13:00:00Z')),e=>e.status===429);
 reserve(env,new Date('2026-11-16T12:00:00Z'));assert.throws(()=>reserve(env,new Date('2026-11-17T12:00:00Z')),e=>e.status===429);
 assert.equal(reserve(env,new Date('2026-12-01T12:00:00Z')).monthCount,1);
 fs.writeFileSync(env.AI_USAGE_FILE,'broken');assert.throws(()=>reserve(env),e=>e.status===503);assert.equal(fs.existsSync(env.AI_USAGE_FILE+'.lock'),false);
});
