import { gigaClient, AiError } from '/app/src/lib/ai/client.ts';
import { prompt, responseSchema, validateResult } from '/app/src/lib/ai/validation.ts';
const words=['зарплата','высокая зп','команда','командная работа'];
const snapshot={revision:0,totalWords:4,omitted:0,groups:[{group:1,label:'synthetic'}],words:words.map(text=>({text,count:1,groups:[{group:1,count:1}]}))};
try {
  const client=gigaClient(),model=await client.model();
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
