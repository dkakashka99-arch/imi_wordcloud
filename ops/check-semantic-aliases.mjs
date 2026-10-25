import { GigaClient, aiConfig, transport, AiError } from '/app/src/lib/ai/client.ts';
import { prompt, responseSchema, validateResult } from '/app/src/lib/ai/validation.ts';
const words=['зарплата','высокая зп','команда','командная работа'];
const snapshot={revision:0,totalWords:4,omitted:0,groups:[{group:1,label:'synthetic'}],words:words.map(text=>({text,count:1,groups:[{group:1,count:1}]}))};
try {
  const client=new GigaClient(aiConfig(),async(...args)=>{
    const r=await transport(...args);
    if(args[0].endsWith('chat/completions')){
      const choice=r.body?.choices?.[0],text=choice?.message?.content||'';
      let parsed;try{parsed=JSON.parse(text)}catch{}
      console.log(JSON.stringify({syntheticOnly:true,finish:choice?.finish_reason,model:r.body?.model,usage:r.body?.usage,outputChars:text.length,trailingWhitespace:text.length-text.trimEnd().length,validJson:!!parsed,suggestions:parsed?.suggestions?.length}));
    }
    return r;
  }),model=await client.model();
  const response=await client.generate(model,prompt('aliases'),{words:snapshot.words},responseSchema('aliases',words));
  const result=validateResult('aliases',response.result,snapshot);
  const salary=result.suggestions.find(x=>x.source.includes('зарплата')&&x.source.includes('высокая зп'));
  const separate=result.suggestions.every(x=>!(x.source.includes('зарплата')&&x.source.includes('команда')));
  console.log(JSON.stringify({syntheticOnly:true,tlsVerified:true,model,salaryAbbreviationGrouped:!!salary,unrelatedMeaningSeparated:separate,usage:response.usage}));
  if(!salary||!separate)process.exitCode=1;
} catch(e) {
  console.log(JSON.stringify({status:'FAIL',code:e instanceof AiError?e.code:'unavailable',detail:e instanceof AiError?e.detail:undefined}));
  process.exitCode=1;
}
