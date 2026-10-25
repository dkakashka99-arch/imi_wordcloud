import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {removeTestEvent} from './scripts/test-cleanup.ts';
const db=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const path='/run/persistence/fixture.json',base='https://imi-cloudpoll.ru';
try {
 if(process.argv[2]==='prepare'){
  const slug='persistence-test-'+randomUUID();
  const id=(await db.query('INSERT INTO events(slug,title,rehearsal) VALUES($1,$2,true) RETURNING id',[slug,'Isolated persistence verification'])).rows[0].id;
  await writeFile(path,JSON.stringify({id,slug}),{mode:0o600});
  const audience=(await db.query("INSERT INTO audiences(event_id,key,label) VALUES($1,'test','Test') RETURNING id",[id])).rows[0].id;
  const question=(await db.query("INSERT INTO questions(event_id,title,status) VALUES($1,'Synthetic persistence test','open') RETURNING id",[id])).rows[0].id;
  await db.query('INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',[id,question,audience]);
  const response=await fetch(base+'/api/public/events/'+slug+'/test/submissions',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:'mir_participant='+randomBytes(32).toString('hex')},body:JSON.stringify({questionId:question,text:'проверка сохранности',idempotencyKey:randomUUID()})});
  assert.equal(response.status,200);
  console.log('PERSISTENCE_FIXTURE_CREATED: one synthetic public answer');
 }else{
  const {id,slug}=JSON.parse(await readFile(path,'utf8'));
  assert.equal((await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1',[id])).rows[0].n,1);
  const cloud=await(await fetch(base+'/api/public/events/'+slug+'/screen')).json();
  assert.equal(cloud.audiences[0].words.reduce((n,w)=>n+w.count,0),1);
  if(process.argv[2]==='cleanup')await removeTestEvent(db,id);
  console.log('PERSISTENCE_VERIFIED: database and public cloud agree'+(process.argv[2]==='cleanup'?'; fixture removed':''));
 }
}finally{await db.end();}
