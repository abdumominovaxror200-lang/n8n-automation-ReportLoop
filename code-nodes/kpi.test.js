'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildKpiReport}=require('./kpi.js');
const dir=path.join(__dirname,'..','fixtures');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
function input(){return {period:{current:{start:'2026-08-01',end:'2026-08-31'},previous:{start:'2026-07-01',end:'2026-07-31'}},ga4:read('sample_ga4.json'),meta:read('sample_meta.json'),gads:read('sample_gads.json'),extra:null,kpis:['sessions','users','new_users','conversions','spend','impressions','clicks','ctr','cpc','leads','cpl','purchases','revenue','roas']};}
test('60-90 day fixtures produce hand-checked KPI values and deltas',()=>{
  const data=input(); assert.equal(data.ga4.rows.length,62); assert.equal(data.meta.rows.length,62); assert.equal(data.gads.rows.length,62);
  const actual=buildKpiReport(data),expected=read('expected_kpi.json');
  assert.equal(actual.period_label,'August 2026 vs July 2026');
  for(const metric of actual.metrics){const want=expected.metrics[metric.key];for(const field of ['current','previous','delta_abs','delta_pct']) assert.ok(Math.abs(metric[field]-want[field])<1e-10,`${metric.key}.${field}`);assert.equal(metric.direction,want.direction);}
});
test('zero divisors yield null plus a quality notice',()=>{const data=input();data.meta={rows:[]};data.gads={rows:[]};data.kpis=['ctr','cpc','cpl','roas'];const out=buildKpiReport(data);assert.ok(out.metrics.every(m=>m.current===null&&m.previous===null));assert.equal(out.data_quality.filter(x=>x.code==='zero_divisor').length,8);});
test('missing sources do not crash and affected metrics are identified',()=>{const data=input();data.ga4=null;data.meta=null;data.gads=null;data.kpis=['sessions','spend','roas'];const out=buildKpiReport(data);assert.ok(out.metrics.every(m=>m.current===null&&m.previous===null));const notices=out.data_quality.filter(x=>x.code==='missing_source');assert.deepEqual(notices.map(x=>x.source).sort(),['ga4','gads','meta']);assert.deepEqual(notices.find(x=>x.source==='ga4').affected_kpis,['sessions']);assert.deepEqual(notices.find(x=>x.source==='meta').affected_kpis,['spend','roas']);});
