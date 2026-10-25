import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const base='https://imi-cloudpoll.ru',slug='rehearsal-25-oct';
const db=new Pool({connectionString:process.env.DATABASE_URL,max:1});
let cookie;
const call=(path,method='GET',body)=>fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:base,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
try{
 const found=await db.query('SELECT id,rehearsal FROM events WHERE slug=$1',[slug]);
 if(found.rowCount){assert.equal(found.rows[0].rehearsal,true);console.log('Existing rehearsal retained');}
 else{
  const password=(await readFile('/run/organizer-password','utf8')).trim();
  let r=await call('/api/admin/login','POST',{login:'teacher',password});assert.equal(r.status,200);
  cookie=r.headers.get('set-cookie').split(';')[0];
  r=await call('/api/admin/events','POST',{title:'Проверка вопросов и облака слов',slug});assert.equal(r.status,201);const {id}=await r.json();
  await db.query('UPDATE events SET rehearsal=true WHERE id=$1',[id]);
  const e=await(await call('/api/admin/events/'+id)).json();
  r=await call('/api/admin/events/'+id+'/commands','POST',{action:'addQuestion',title:'Какое слово вы хотите увидеть в облаке?',audienceIds:e.audiences.map(a=>a.id),maxAnswers:10,maxLength:60});assert.equal(r.status,200);
  const q=(await(await call('/api/admin/events/'+id)).json()).questions[0];
  r=await call('/api/admin/events/'+id+'/commands','POST',{action:'activate',questionId:q.id});assert.equal(r.status,200);
  console.log('REHEARSAL_CREATED_THROUGH_ORGANIZER_API_AND_OPENED');
 }
 const state=await(await call('/api/public/events/'+slug+'/all')).json();assert.equal(state.question.status,'open');
 console.log('PARTICIPANT='+base+'/e/'+slug+'/all');console.log('SCREEN='+base+'/e/'+slug+'/screen');
}finally{if(cookie)await call('/api/admin/logout','POST',{});await db.end();}
