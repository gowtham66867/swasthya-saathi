import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateExtraction,VERSION} from '../agent.js';
import {runExtraction} from '../harness.mjs';
import {applyReviewRules} from '../review-tools.js';
import {translationSignals} from '../translation-checks.js';
const bytes=await readFile(new URL('./cases.v3.json',import.meta.url));
const freeze=JSON.parse(await readFile(new URL('./cases.v3.freeze.json',import.meta.url)));
if(createHash('sha256').update(bytes).digest('hex')!==freeze.sha256)throw Error('Frozen v3 holdout changed. Create a new version.');
const live=process.argv.includes('--live');
if(live&&(process.env.EVAL_LIVE!=='yes'||!process.env.SARVAM_API_KEY))throw Error('Paid live run requires approval, EVAL_LIVE=yes and a key.');
const destination=new URL('./results/text-v3.json',import.meta.url);
if(live){try{await readFile(destination);throw Error('Holdout already run; preserve it and use a separately labelled regression dataset.');}catch(e){if(e.code!=='ENOENT')throw e;}}
const runs=[];const key=f=>JSON.stringify([f.field,f.quote,f.sourceId]);
for(const c of JSON.parse(bytes)){
 const sources={original:c.original,english:c.english,clarifications:''};
 let output,error;
 try{output=live?await runExtraction(sources,{key:process.env.SARVAM_API_KEY}):{result:c.expected};}catch(e){error=e.code||'provider';}
 const raw=output?.result||{facts:[],ambiguities:[]};const reviewed=applyReviewRules(raw,sources);
 const expected=new Set(c.expected.facts.map(key)),actual=new Set(reviewed.result.facts.map(key));
 const valueTargets=c.expected.facts.filter(f=>f.value);
 runs.push({id:c.id,error,valid:!!output&&!validateExtraction(raw,sources).length,tp:[...actual].filter(x=>expected.has(x)).length,fp:[...actual].filter(x=>!expected.has(x)).length,fn:[...expected].filter(x=>!actual.has(x)).length,valueTargets:valueTargets.length,valueExact:valueTargets.filter(f=>JSON.stringify(f.value)===JSON.stringify(raw.facts.find(x=>key(x)===key(f))?.value)).length,expectedSignalKinds:c.expectedSignalKinds,signals:reviewed.signals,translationFlags:translationSignals(c.original,c.english),result:live?raw:undefined,meta:output?.meta});
 if(live)await writeFile(destination,JSON.stringify({status:'running',version:VERSION,kind:'first frozen v3 run',runs},null,2)+'\n');
}
const report={status:'complete',version:VERSION,kind:live?'First frozen v3 synthetic run':'Offline v3 fixture/validator replay — NOT model accuracy',date:new Date().toISOString(),cases:runs.length,valid:runs.filter(r=>r.valid).length,limitations:['Author labels; not clinically adjudicated.','Native patterns/text await fluent review.','English references are supplied: this text run does not measure translation.','Value exact match is token agreement, not clinical accuracy.'],runs};
if(live)await writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({kind:report.kind,cases:report.cases,valid:report.valid},null,2));
if(report.valid!==report.cases)process.exitCode=1;
