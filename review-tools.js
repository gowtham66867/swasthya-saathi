import {segmentSentences} from './sentence.js';
import {FIELDS,clarify} from './agent.js';
export const REVIEW_RULES_VERSION='review-rules-v2';
export {instructionLike} from './rule-patterns.js';
import {instructionLike,matchesRule,excludeInstruction,reportedAdvice,PATTERN_REVIEW_STATUS} from './rule-patterns.js';
export function reviewSignals(sources,result){
 const signals=[];
 for(const [sourceId,text] of Object.entries(sources)){
  if(!text)continue;const sentences=segmentSentences(text);
  sentences.forEach((quote,i)=>{
   if(instructionLike(quote)||reportedAdvice(quote))signals.push({kind:'instruction',quote,sourceId,excluded:excludeInstruction(quote),patternReview:PATTERN_REVIEW_STATUS,text:excludeInstruction(quote)?'Instruction-like text excluded from clinical fact cards.':'Reported advice retained: review in context.'});
   if(matchesRule('correction',quote)){if(i)signals.push({kind:'correction',quote:sentences[i-1],sourceId,text:'Earlier statement: compare with the explicit correction.'});signals.push({kind:'correction',quote,sourceId,text:'Explicit correction: reviewer must reconcile these statements.'});}
   if(matchesRule('uncertainty',quote))signals.push({kind:'uncertainty',quote,sourceId,text:'Patient uncertainty: keep the wording and ask directly if needed.'});
   if(matchesRule('family',quote))signals.push({kind:'family',quote,sourceId,text:'Family context: do not assign this history to the patient.'});
  });
 }
 for(const a of result.ambiguities)signals.push({kind:'model-ambiguity',...a,text:'Model flagged this statement as ambiguous.'});
 return signals.filter((s,i,all)=>i===all.findIndex(x=>x.kind===s.kind&&x.quote===s.quote&&x.sourceId===s.sourceId));
}
export function applyReviewRules(result,sources){
 const filtered={...result,facts:result.facts.filter(f=>!excludeInstruction(f.quote))};
 const signals=reviewSignals(sources,result);return {result:filtered,signals,...clarify(filtered,sources),rulesVersion:REVIEW_RULES_VERSION};
}
export function reviewOverview(result,corrections={}){return {known:FIELDS.filter(f=>result.facts.some(x=>x.field===f)||corrections[f]?.trim()),unknown:FIELDS.filter(f=>!result.facts.some(x=>x.field===f)&&!corrections[f]?.trim()),corrections:Object.values(corrections).filter(x=>x?.trim()).length};}
export function timingObservation({manualMs=null,assistedMs=null,manualCaseId=null,caseId,corrections=0}){const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;const comparable=manualCaseId===caseId&&valid(manualMs)&&valid(assistedMs);return {kind:'operator self-timed synthetic observation - not a study',caseId,manualCaseId,manualMs:valid(manualMs)?manualMs:null,assistedMs:valid(assistedMs)?assistedMs:null,corrections,comparable,savedMs:comparable?manualMs-assistedMs:null,clinicianValidated:false};}
export const canApprove=({state,reviewer,critical})=>state==='awaiting_review'&&typeof reviewer==='string'&&reviewer.trim().length>0&&critical===true;
