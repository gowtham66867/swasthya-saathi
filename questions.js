import {wholeEvidence} from './sentence.js';
import {instructionLike} from './rule-patterns.js';
export const QUESTION_FIELDS=['concern','symptoms','duration','severity','medicines','allergies','history','questions'];
export const QUESTION_SCHEMA={type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['field','quote','sourceId','text'],properties:{field:{type:'string',enum:QUESTION_FIELDS},quote:{type:'string',minLength:1,maxLength:500},sourceId:{type:'string',enum:['english','clarifications']},text:{type:'string',minLength:1,maxLength:240}}}};
export function questionIssues(question,sources={}){
 if(!question||typeof question!=='object'||Array.isArray(question)||Object.keys(question).some(k=>!['field','quote','sourceId','text'].includes(k)))return ['Invalid question schema'];
 if(!QUESTION_FIELDS.includes(question.field)||!['english','clarifications'].includes(question.sourceId))return ['Invalid question target/source'];
 if(typeof question.quote!=='string'||question.quote.length>500||!wholeEvidence(question.quote,sources[question.sourceId],question.sourceId))return ['Question evidence invalid'];
 const text=question.text;
 if(typeof text!=='string'||!text.trim()||text.length>240)return ['Question length invalid'];
 if(instructionLike(text)||/diagnos|prescrib|treat|urgenc|urgent|emergency|ambulance|immediat|recommend|opioid|antibiotic|\b(?:should|must)\b|\btake\b.{0,25}\b(?:mg|dose|tablet)\b/i.test(text))return ['Question safety wording rejected'];
 if(!/^(?:what|when|which|how|can you|could you|do you|does|are you|have you|is there|please (?:describe|clarify|tell))\b/i.test(text.trim()))return ['Question must ask for patient-reported information'];
 return [];
}
export function sanitizeQuestions(result,sources){
 const questions=result?.questions;
 if(questions===undefined)return {result,flags:[]}; // Historical fixtures.
 const invalid=!Array.isArray(questions)||questions.length>3||questions.some(q=>questionIssues(q,sources).length);
 if(!invalid)return {result,flags:[]};
 return {result:{...result,questions:[]},flags:[{kind:'question-fallback',text:'Model questions rejected; fixed clarification templates used.'}]};
}
export function proposedQuestions(result,sources){
 return Array.isArray(result.questions)&&result.questions.length<=3&&result.questions.length>0&&result.questions.every(q=>!questionIssues(q,sources).length)?result.questions.map(q=>({...q,proposed:true})):[];
}
