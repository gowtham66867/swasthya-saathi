import {segmentSentences} from './sentence.js';
import {FIELDS,clarify} from './agent.js';
export const REVIEW_RULES_VERSION='review-rules-v1';
export const instructionLike=quote=>/^(ignore (all |the )?(previous|prior)|system instruction\s*:|reveal (the |your )?(prompt|system)|you are (now |an? )|override (the |your ))/i.test(quote.trim());
export function reviewSignals(sources,result){
 const signals=[];
 for(const [sourceId,text] of Object.entries(sources)){
  if(!text)continue;const sentences=segmentSentences(text);
  sentences.forEach((quote,i)=>{
   if(instructionLike(quote))signals.push({kind:'instruction',quote,sourceId,text:'Instruction-like source text excluded from clinical fact cards.'});
   if(/^(actually[, ]|correction\s*:|i meant\b)/i.test(quote)){if(i)signals.push({kind:'correction',quote:sentences[i-1],sourceId,text:'Earlier statement: compare with the explicit correction.'});signals.push({kind:'correction',quote,sourceId,text:'Explicit correction: reviewer must reconcile these statements.'});}
   if(/\b(not sure|do not remember|cannot remember|do not know|don't know)\b/i.test(quote))signals.push({kind:'uncertainty',quote,sourceId,text:'Patient uncertainty: keep the wording and ask directly if needed.'});
   if(/\b(my mother|my father|my sister|my brother)\b/i.test(quote))signals.push({kind:'family',quote,sourceId,text:'Family context: do not assign this history to the patient.'});
  });
 }
 for(const a of result.ambiguities)signals.push({kind:'model-ambiguity',...a,text:'Model flagged this statement as ambiguous.'});
 return signals.filter((s,i,all)=>i===all.findIndex(x=>x.kind===s.kind&&x.quote===s.quote&&x.sourceId===s.sourceId));
}
export function applyReviewRules(result,sources){
 const filtered={...result,facts:result.facts.filter(f=>!instructionLike(f.quote))};
 const signals=reviewSignals(sources,result);return {result:filtered,signals,...clarify(filtered),rulesVersion:REVIEW_RULES_VERSION};
}
export function reviewOverview(result,corrections={}){return {known:FIELDS.filter(f=>result.facts.some(x=>x.field===f)||corrections[f]?.trim()),unknown:FIELDS.filter(f=>!result.facts.some(x=>x.field===f)&&!corrections[f]?.trim()),corrections:Object.values(corrections).filter(x=>x?.trim()).length};}
export function timingObservation({manualMs=null,assistedMs=null,manualCaseId=null,caseId,corrections=0}){const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;const comparable=manualCaseId===caseId&&valid(manualMs)&&valid(assistedMs);return {kind:'operator self-timed synthetic observation - not a study',caseId,manualCaseId,manualMs:valid(manualMs)?manualMs:null,assistedMs:valid(assistedMs)?assistedMs:null,corrections,comparable,savedMs:comparable?manualMs-assistedMs:null,clinicianValidated:false};}
export const canApprove=({state,reviewer,critical})=>state==='awaiting_review'&&typeof reviewer==='string'&&reviewer.trim().length>0&&critical===true;
