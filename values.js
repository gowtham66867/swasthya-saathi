// Proposed values are extractive hints; the source quotation remains authoritative.
export const VALUE_FIELDS = {
 medicines:['name','dose','unit','frequency','negated'],
 duration:['amount','unit','onset','negated'],
 severity:['rating','scale','negated'],
 allergies:['substance','type','negated'],
 concern:['negated'],symptoms:['negated'],history:['negated'],questions:[],
};
export const VALUE_SCHEMA = {type:'object',additionalProperties:false,properties:Object.fromEntries([...new Set(Object.values(VALUE_FIELDS).flat())].map(key=>[key,key==='negated'?{type:'boolean'}:{type:'string',minLength:1,maxLength:120}]))};
export const factKey = fact => JSON.stringify([fact.field,fact.sourceId,fact.quote]);
export const explicitNegation = quote => /\b(?:no\b|never\b|without\b|denies\b|(?:do not|don't|does not|doesn't) (?:have|take|use|know of)|not (?:taking|allergic|on|using))\b/i.test(quote);
function verbatimToken(value,quote){
 if(typeof value!=='string'||!value.trim()||value.length>120)return false;
 const numbers=value.match(/\d+(?:\.\d+)?/g)||[];
 const sourceNumbers=quote.match(/\d+(?:\.\d+)?/g)||[];
 if(numbers.some(number=>!sourceNumbers.includes(number)))return false;
 // Exact spelling/case, bounded at Unicode letters/numbers; no unit conversion.
 let start=quote.indexOf(value);
 while(start>=0){const before=quote.slice(0,start).at(-1)||'',after=quote.slice(start+value.length)[0]||'';
  if(!/[\p{L}\p{M}\p{N}]/u.test(before)&&!/[\p{L}\p{M}\p{N}]/u.test(after))return true;
  start=quote.indexOf(value,start+1);
 }
 return false;
}
export function valueIssues(fact){
 if(fact.value===undefined)return [];
 const value=fact.value;
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length)return ['Invalid value object'];
 const issues=[];
 for(const [key,token] of Object.entries(value)){
  if(!VALUE_FIELDS[fact.field]?.includes(key))issues.push('Value key not allowed for field: '+key);
  else if(key==='negated'){
   if(typeof token!=='boolean'||token!==explicitNegation(fact.quote||''))issues.push('Negation is not supported by explicit quote wording');
  }else if(!verbatimToken(token,fact.quote||''))issues.push('Value token is not verbatim: '+key);
 }
 return issues;
}
export function sanitizeValues(result){
 const flags=[];
 if(!Array.isArray(result?.facts))return {result,flags};
 const facts=result.facts.map(fact=>{
  const issues=valueIssues(fact);
  if(!issues.length)return fact;
  const {value,...kept}=fact;
  flags.push({kind:'unsupported-value',sourceId:fact.sourceId,quote:fact.quote,text:'Proposed value removed: '+issues.join('; ')});
  return kept;
 });
 return {result:{...result,facts},flags};
}
