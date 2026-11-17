import {readFile,writeFile} from 'node:fs/promises';
import {loadAudioManifest} from './audio-loader.mjs';
import {characterError} from './metrics.mjs';
import {runExtraction} from '../harness.mjs';
const manifest=process.argv[process.argv.indexOf('--manifest')+1];
if(!process.argv.includes('--manifest')||!manifest)throw Error('Provide --manifest PATH.');
const rows=await loadAudioManifest(manifest);
if(!process.argv.includes('--live')){console.log(JSON.stringify({validatedFiles:rows.length,totalBytes:rows.reduce((n,r)=>n+r.bytes,0),paidRequests:0}));}else{
 if(process.env.EVAL_LIVE!=='yes'||!process.env.SARVAM_API_KEY)throw Error('Paid opt-in and key required after approval.');
 async function provider(endpoint,body){const form=body instanceof FormData;const r=await fetch('https://api.sarvam.ai/'+endpoint,{method:'POST',headers:{'api-subscription-key':process.env.SARVAM_API_KEY,...(form?{}:{'Content-Type':'application/json'})},body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Provider '+r.status);return r.json();}
 const results=[];
 for(const row of rows){try{
  const form=new FormData();form.append('file',new Blob([await readFile(row.audioPath)],{type:row.mime}),row.file);form.append('language_code',row.language);form.append('model','saaras:v3');form.append('mode','transcribe');
  const speech=await provider('speech-to-text',form);
  const translated=row.language==='en-IN'?{translated_text:speech.transcript}:await provider('translate',{input:speech.transcript,source_language_code:row.language,target_language_code:'en-IN',model:'sarvam-translate:v1'});
  const extraction=await runExtraction({english:translated.translated_text,clarifications:''},{key:process.env.SARVAM_API_KEY});
  results.push({id:row.id,language:row.language,cer:characterError(row.reference,speech.transcript),completed:true,meta:extraction.meta});
 }catch(e){results.push({id:row.id,completed:false,error:e.code||'provider'});}}
 // No raw audio, transcripts or patient content saved by this runner.
 await writeFile(new URL('./results/human-speech.json',import.meta.url),JSON.stringify({kind:'Consented human-recorded fictional speech; no TTS',results},null,2)+'\n');
 console.log(JSON.stringify({cases:results.length,completed:results.filter(r=>r.completed).length}));
}
