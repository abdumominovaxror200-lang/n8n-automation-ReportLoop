'use strict';

/** Pure KPI calculator plus a raw-paste n8n Code-node entrypoint. */
const DEFINITIONS = Object.freeze({
  sessions:['Sessions','count','ga4'], users:['Users','count','ga4'], new_users:['New users','count','ga4'], conversions:['Conversions','count','ga4'],
  spend:['Ad spend','currency','ads'], impressions:['Impressions','count','ads'], clicks:['Clicks','count','ads'], ctr:['Click-through rate','ratio','ads'],
  cpc:['Cost per click','currency','ads'], leads:['Leads','count','ads'], cpl:['Cost per lead','currency','ads'], purchases:['Purchases','count','ads'],
  revenue:['Revenue','currency','ads'], roas:['Return on ad spend','ratio','ads'],
});
const GA4_KEYS=['sessions','users','new_users','conversions'];
const ADS_KEYS=['spend','impressions','clicks','leads','purchases','revenue'];
const empty=(keys,value=0)=>Object.fromEntries(keys.map(k=>[k,value]));
const number=value=>{ const n=Number(value); return value===null||value===''||!Number.isFinite(n)?0:n; };
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function sumRows(rows,keys,period,quality,source){
  const out=empty(keys);
  for(const row of rows){
    if(!validDate(row.date)){ quality.push({code:'invalid_date',source,detail:'A row was skipped because date must be YYYY-MM-DD.'}); continue; }
    if(row.date<period.start||row.date>period.end) continue;
    for(const key of keys) out[key]+=number(row[key]);
  }
  return out;
}
function ratio(n,d,key,period,quality){
  if(d===0){ quality.push({code:'zero_divisor',kpi:key,period,detail:`${key} is null because its denominator is zero.`}); return null; }
  return n/d;
}
function derived(t,period,q){return {...t,ctr:ratio(t.clicks,t.impressions,'ctr',period,q),cpc:ratio(t.spend,t.clicks,'cpc',period,q),cpl:ratio(t.spend,t.leads,'cpl',period,q),roas:ratio(t.revenue,t.spend,'roas',period,q)};}
function monthLabel(iso){const [y,m]=iso.split('-').map(Number);return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));}

function buildKpiReport(input){
  if(!input?.period?.current||!input?.period?.previous) throw new TypeError('period.current and period.previous are required');
  for(const [name,period] of Object.entries(input.period)) if(!validDate(period.start)||!validDate(period.end)||period.start>period.end) throw new RangeError(`period.${name} must contain an ordered YYYY-MM-DD start/end range`);
  const requested=Array.isArray(input.kpis)?input.kpis:[];
  const unknown=requested.filter(k=>!DEFINITIONS[k]);
  if(unknown.length) throw new RangeError(`Unknown KPI(s): ${unknown.join(', ')}`);
  const quality=[];
  const affectedBySource={ga4:requested.filter(k=>DEFINITIONS[k][2]==='ga4'),meta:requested.filter(k=>DEFINITIONS[k][2]==='ads'),gads:requested.filter(k=>DEFINITIONS[k][2]==='ads')};
  for(const source of ['ga4','meta','gads']) if(input[source]==null&&affectedBySource[source].length) quality.push({code:'missing_source',source,affected_kpis:affectedBySource[source],detail:`${source} source was not provided; affected KPIs may be unavailable or partial.`});
  const results={};
  for(const [periodName,period] of Object.entries(input.period)){
    const ga4=input.ga4?sumRows(input.ga4.rows||[],GA4_KEYS,period,quality,'ga4'):empty(GA4_KEYS,null);
    const adsAvailable=input.meta!=null||input.gads!=null;
    if(adsAvailable){
      const meta=input.meta?sumRows(input.meta.rows||[],ADS_KEYS,period,quality,'meta'):empty(ADS_KEYS);
      const gads=input.gads?sumRows(input.gads.rows||[],ADS_KEYS,period,quality,'gads'):empty(ADS_KEYS);
      const combined=Object.fromEntries(ADS_KEYS.map(k=>[k,meta[k]+gads[k]]));
      results[periodName]={...ga4,...derived(combined,periodName,quality)};
    } else results[periodName]={...ga4,...empty([...ADS_KEYS,'ctr','cpc','cpl','roas'],null)};
  }
  const metrics=requested.map(key=>{
    const current=results.current[key],previous=results.previous[key];
    const delta=current==null||previous==null?null:current-previous;
    const pct=delta==null||previous===0?null:delta/Math.abs(previous);
    if(delta!=null&&previous===0) quality.push({code:'zero_previous',kpi:key,detail:`${key} percentage change is null because the previous value is zero.`});
    return {key,label:DEFINITIONS[key][0],unit:DEFINITIONS[key][1],current,previous,delta_abs:delta,delta_pct:pct,direction:delta==null||Math.abs(delta)<1e-12?'flat':delta>0?'up':'down'};
  });
  return {metrics,totals:{current:results.current,previous:results.previous},data_quality:quality,period_label:`${monthLabel(input.period.current.start)} vs ${monthLabel(input.period.previous.start)}`};
}
if(typeof module!=='undefined'&&module.exports) module.exports={buildKpiReport,KPI_DEFINITIONS:DEFINITIONS};
if(typeof $input!=='undefined'){
  const merged=$input.first().json;
  const input=merged.period?merged:{...$('Client Input').first().json,ga4:$('TODO: connect GA4').first().json,meta:$('TODO: connect Meta').first().json,gads:$('TODO: connect Google Ads').first().json,extra:$('TODO: connect Extra Source').first().json};
  input.kpis=Array.isArray(input.kpis)?input.kpis:String(input.kpis||'').split(',').map(k=>k.trim()).filter(Boolean);
  if(!input.period){
    const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:input.timezone||'UTC',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(({type,value})=>[type,value]));
    const year=Number(dateParts.year),month=Number(dateParts.month),iso=date=>date.toISOString().slice(0,10);
    input.period={current:{start:iso(new Date(Date.UTC(year,month-2,1))),end:iso(new Date(Date.UTC(year,month-1,0)))},previous:{start:iso(new Date(Date.UTC(year,month-3,1))),end:iso(new Date(Date.UTC(year,month-2,0)))}};
  }
  return [{json:buildKpiReport(input)}];
}
