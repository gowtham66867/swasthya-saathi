import {FACT_SCHEMA,VERSION,validateExtraction,clarify} from './agent.js';
import {PROMPT} from './prompts/intake-v1.mjs';
export class AgentError extends Error{constructor(code,message){super(message);this.code=code;}}
export async function runExtraction(sources,{key,model='sarvam-105b',signal,fetcher=fetch}={}){
 if(!['sarvam-105b','sarvam-105b-conversations'].includes(model))throw new AgentError('configuration','Unsupported extraction model.');
 if(typeof sources.english!=='string'||!sources.english.trim()||sources.english.length>2000||typeof sources.clarifications!=='string'||sources.clarifications.length>2000)throw new AgentError('input','Provide English text and at most 2000 characters of clarification.');
 const started=Date.now();let calls=0;let repair=false;let usage={input:0,output:0};let issue='';
 // A fixed application-owned plan. No tool call returned by the model is executed.
 while(calls<3){
  calls++;
  const response=await fetcher('https://api.sarvam.ai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','api-subscription-key':key},body:JSON.stringify({model,messages:[{role:'system',content:PROMPT+'\nReturn an object with exactly two keys: facts (array of {field,quote,sourceId}) and ambiguities (array of {quote,sourceId}). Do not echo the source object. Example for English text I have a cough.: {"facts":[{"field":"concern","quote":"I have a cough.","sourceId":"english"},{"field":"symptoms","quote":"I have a cough.","sourceId":"english"}],"ambiguities":[]}.\nSchema: '+JSON.stringify(FACT_SCHEMA)+(issue?'\nPrior result failed validation. Return a corrected extraction from the same sources.':'')},{role:'user',content:JSON.stringify(sources)}],max_tokens:2200,reasoning_effort:'low',temperature:0,response_format:{type:'json_schema',json_schema:{name:'patient_intake_v1',strict:true,schema:FACT_SCHEMA}}}),signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(25000)])});
  if(!response.ok){if([429,502,503,504].includes(response.status)&&calls===1){await new Promise((resolve,reject)=>{const t=setTimeout(resolve,300);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new AgentError('cancelled','Request cancelled.'));},{once:true});});continue;}throw new AgentError('provider','Sarvam extraction unavailable. Check access, credits, or retry later.');}
  const body=await response.json();usage.input+=Number(body.usage?.prompt_tokens)||0;usage.output+=Number(body.usage?.completion_tokens)||0;
  let result;try{result=JSON.parse(body.choices?.[0]?.message?.content);}catch{result=null;}
  const errors=validateExtraction(result,sources);
  if(!errors.length)return {result,...clarify(result),meta:{version:VERSION,mode:'live Sarvam',model,calls,repair,latencyMs:Date.now()-started,usage}};
  if(repair)throw new AgentError('validation','Extraction failed evidence validation. Review the text and try again.');
  repair=true;issue=errors.join(', ');
 }
 throw new AgentError('budget','Agent call limit reached. Review and retry explicitly.');
}
