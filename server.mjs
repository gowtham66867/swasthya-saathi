import {applyReviewRules} from './review-tools.js';
import {VERSION} from './agent.js';
import {runExtraction} from './harness.mjs';
const languages=new Set(['hi-IN','ta-IN','te-IN','kn-IN','ml-IN','mr-IN','bn-IN','gu-IN','pa-IN','od-IN','en-IN']);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleApi(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/status'&&request.method==='GET')return json({ready:Boolean(env.SARVAM_API_KEY && env.LIVE_ACCESS_TOKEN?.length>=32),provider:'Sarvam',mode:'synthetic-demo',version:VERSION});
 if(!['/api/transcribe','/api/translate','/api/speak','/api/extract'].includes(path))return json({error:'Not found'},404);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('X-Patient-Consent')!=='yes')return json({error:'Same-origin request and patient consent are required.'},403);
 if(!env.SARVAM_API_KEY)return json({error:'Set SARVAM_API_KEY in the server environment to enable live Sarvam.'},503);
 if(!env.LIVE_ACCESS_TOKEN || env.LIVE_ACCESS_TOKEN.length<32 || request.headers.get('Authorization')!=='Bearer '+env.LIVE_ACCESS_TOKEN)return json({error:'Live processing requires the server-configured access token.'},401);
 if(Number(request.headers.get('content-length'))>5*1024*1024)return json({error:'Recording too large. Use a recording shorter than 25 seconds.'},413);
 try{
  // Bound even chunked requests before parsing or forwarding patient content.
  const reader=request.body?.getReader();if(!reader)return json({error:'Request body required.'},400);
  let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>5*1024*1024){await reader.cancel();return json({error:'Request too large.'},413);}chunks.push(value);}
  const body=await new Blob(chunks).arrayBuffer();
  const parsed=new Request(request.url,{method:'POST',headers:request.headers,body});
  if(path==='/api/extract'){
   const data=await parsed.json();if(!['translation_confirmed','clarifying'].includes(data.stage)||data.translationConfirmed!==true)return json({error:'Confirm translation before extraction or clarification.'},409);
   if(data.original!==undefined&&(typeof data.original!=='string'||data.original.length>2000))return json({error:'Invalid original text.'},400);
   const output=await runExtraction({english:data.text,clarifications:data.clarifications||''},{key:env.SARVAM_API_KEY,model:env.SARVAM_TEXT_MODEL||'sarvam-105b',signal:request.signal});return json({...output,...applyReviewRules(output.result,{original:data.original||'',english:data.text,clarifications:data.clarifications||''})});
  }
  let endpoint,payload,headers={'api-subscription-key':env.SARVAM_API_KEY};
  if(path==='/api/transcribe'){
   const data=await parsed.formData();const file=data.get('file');const language=data.get('language');
   if(!['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg'].includes(file?.type?.split(';')[0])||!languages.has(language)||!file||typeof file==='string'||file.size===0)return json({error:'A recording and supported language are required.'},400);
   payload=new FormData();payload.append('file',file,file.name);payload.append('language_code',language);payload.append('model','saaras:v3');payload.append('mode','transcribe');endpoint='speech-to-text';
  }else{
   const data=await parsed.json();if(typeof data.text!=='string'||!data.text.trim()||data.text.length>2000||!languages.has(data.language))return json({error:'Provide 1–2000 characters and a supported language.'},400);
   if(path==='/api/translate'&&data.language==='en-IN')return json({translated_text:data.text});
   headers['Content-Type']='application/json';
   if(path==='/api/translate'){if(data.direction!==undefined&&!['forward','back'].includes(data.direction))return json({error:'Invalid translation direction.'},400);endpoint='translate';payload=JSON.stringify({input:data.text,source_language_code:data.direction==='back'?'en-IN':data.language,target_language_code:data.direction==='back'?data.language:'en-IN',model:'sarvam-translate:v1'});}
   else{endpoint='text-to-speech';payload=JSON.stringify({text:data.text,language_code:data.language,model:'bulbul:v3',speaker:'shubh',output_audio_codec:'wav'});}
  }
  const response=await fetch('https://api.sarvam.ai/'+endpoint,{method:'POST',headers,body:payload,signal:AbortSignal.timeout(45000)});
  if(!response.ok)return json({error:response.status===401||response.status===403?'Sarvam rejected the server API key. Check its validity.':response.status===429?'Sarvam rate limit reached. Try again shortly.':'Sarvam could not process this request. Check your input and try again.'},502);
  const result=await response.json();
  if(endpoint==='speech-to-text')return typeof result.transcript==='string'?json({transcript:result.transcript,language_code:result.language_code}):json({error:'Sarvam returned no transcript.'},502);
  if(endpoint==='translate')return typeof result.translated_text==='string'?json({translated_text:result.translated_text}):json({error:'Sarvam returned no translation.'},502);
  return Array.isArray(result.audios)&&typeof result.audios[0]==='string'?json({audios:result.audios}):json({error:'Sarvam returned no audio.'},502);
 }catch(error){return json({error:error.code==='validation'?error.message:'Unable to process request. Review input or retry explicitly.',category:error.code||'provider'},502);}
}
