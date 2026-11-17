export const VERSION='intake-v1';
export const FIELDS=['concern','symptoms','duration','severity','medicines','allergies','history','questions'];
export const LABELS={concern:'Main concern',symptoms:'Reported symptoms',duration:'Onset / duration',severity:'Severity in patient’s words',medicines:'Current medicines',allergies:'Allergies',history:'Reported history',questions:'Patient questions'};
export const FACT_SCHEMA={type:'object',additionalProperties:false,required:['facts','ambiguities'],properties:{facts:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['field','quote','sourceId'],properties:{field:{type:'string',enum:FIELDS},quote:{type:'string',minLength:1,maxLength:500},sourceId:{type:'string',enum:['english','clarifications']}}}},ambiguities:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['quote','sourceId'],properties:{quote:{type:'string',minLength:1,maxLength:500},sourceId:{type:'string',enum:['english','clarifications']}}}}}};
export function validateExtraction(result,sources){
 const errors=[];
 if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).some(k=>!['facts','ambiguities'].includes(k))||!Array.isArray(result.facts)||!Array.isArray(result.ambiguities))return ['Invalid extraction schema'];
 if(result.facts.length>24||result.ambiguities.length>6)errors.push('Too many results');
 for(const fact of [...result.facts,...result.ambiguities]){
  const keys=result.facts.includes(fact)?['field','quote','sourceId']:['quote','sourceId'];
  if(!fact||typeof fact!=='object'||Object.keys(fact).some(k=>!keys.includes(k))||keys.some(k=>typeof fact[k]!=='string')){errors.push('Invalid fact schema');continue;}
  if(keys.includes('field')&&!FIELDS.includes(fact.field))errors.push('Field not allowed');
  if(!['english','clarifications'].includes(fact.sourceId)||!fact.quote.trim()||fact.quote.length>500||!sources[fact.sourceId]?.includes(fact.quote))errors.push('Evidence does not match source');
  if(typeof fact.quote==='string'&&typeof sources[fact.sourceId]==='string'){
   const text=sources[fact.sourceId];let start=text.indexOf(fact.quote),whole=false;
   while(start>=0){const before=text.slice(0,start).trimEnd(),after=text.slice(start+fact.quote.length).trimStart();if((!before||/[.!?。।:\n]$/.test(text.slice(0,start).trimEnd())||text[start-1]==='\n')&&(!after||/[.!?。।]$/.test(fact.quote)||/^[.!?。।\n]/.test(after)||text[start+fact.quote.length]==='\n'))whole=true;start=text.indexOf(fact.quote,start+1);}
   if(!whole)errors.push('Quote must preserve the full sentence or clarification answer');
  }
  // Evidence is displayed verbatim: the model cannot introduce a separate unsupported value.
 }
 const unique=new Set(result.facts.map(f=>JSON.stringify(f)));if(unique.size!==result.facts.length)errors.push('Duplicate fact');
 return errors;
}
export function clarify(result){
 const missing=FIELDS.filter(field=>!result.facts.some(f=>f.field===field));
 const questions=[];
 if(result.ambiguities.length)questions.push({field:'ambiguities',text:'Please clarify the statements marked as ambiguous below. If unsure, leave them unresolved.'});
 for(const [field,text] of [['duration','When did this concern start?'],['medicines','What medicines are you currently taking, if any?'],['allergies','Do you have any known allergies?']])if(missing.includes(field))questions.push({field,text});
 return {missing,questions:questions.slice(0,3)};
}
const transitions={created:['consented','cancelled'],consented:['transcribed','cancelled','failed'],transcribed:['translated','cancelled','failed'],translated:['extracted','cancelled','failed'],extracted:['clarifying','awaiting_review','failed','cancelled'],clarifying:['awaiting_review','failed','cancelled'],awaiting_review:['approved','failed','cancelled'],approved:['exported','cancelled'],exported:['cancelled'],failed:['created'],cancelled:['created']};
export class Workflow{
 constructor(){this.state='created';this.revision=0;this.history=['created'];}
 move(next){if(!transitions[this.state]?.includes(next))throw Error(`Invalid transition: ${this.state} → ${next}`);this.state=next;this.history.push(next);}
 reset(){this.state='created';this.revision++;this.history=['created'];}
 accept(revision){return revision===this.revision&&this.state!=='cancelled';}
}
export function handoff({reference,language,original,english,clarifications='',result,corrections={},reviewed,state,mode}){
 if(!reviewed||!['approved','exported'].includes(state))throw Error('Patient review is required before export.');
 if(validateExtraction(result,{english,clarifications}).length)throw Error('Invalid evidence. Extract again before export.');
 const rows=FIELDS.map(field=>{const facts=result.facts.filter(f=>f.field===field);const correction=corrections[field]?.trim();return `${LABELS[field]}: ${correction?correction+' [operator correction — confirm with patient]':facts.length?facts.map(f=>f.quote).join(' | '):'Unknown — not reported'}\n${facts.map(f=>`  Evidence (${f.sourceId}): “${f.quote}”`).join('\n')}`;});
 return ['SWASTHYA SAATHI · PATIENT-REPORTED HANDOFF','For clinician review · no diagnosis or urgency assessment',`Reference: ${reference||'Not provided'}`,`Language: ${language}`,`Mode: ${mode}`,`Prompt/schema: ${VERSION}`,`Created: ${new Date().toISOString()}`,'','ORIGINAL PATIENT WORDS',original,'','ENGLISH VERSION — operator reviewed',english,'','CLARIFICATIONS — operator recorded',clarifications||'Not provided','',...rows,'','UNRESOLVED / AMBIGUOUS',...result.ambiguities.map(a=>`“${a.quote}” (${a.sourceId})`),'','Missing fields may remain unknown. Confirm details directly with the patient. Translation and classification can contain errors.'].join('\n');
}
