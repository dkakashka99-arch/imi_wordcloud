import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {removeTestEvent} from './scripts/test-cleanup.ts';
const base='https://imi-cloudpoll.ru';
const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
let id;
try{
 assert.equal((await fetch(base+'/api/ready')).status,200);
 for(let i=0;i<30;i++){if((await db.query("SELECT id FROM admins WHERE login='teacher' AND active")).rowCount)break;await new Promise(r=>setTimeout(r,1000));}
 const pw=(await readFile('/run/organizer-password','utf8')).trim();
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({login:'teacher',password:pw})});
 assert.equal(login.status,200,'Organizer login');
 const adminCookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/admin/events',{headers:{Cookie:adminCookie}})).status,200);
 assert.equal((await fetch(base+'/api/admin/events')).status,401);
 const slug='production-test-'+randomUUID();
 id=(await db.query('INSERT INTO events(slug,title,rehearsal) VALUES($1,$2,true) RETURNING id',[slug,'Isolated production verification'])).rows[0].id;
 const audience=(await db.query("INSERT INTO audiences(event_id,key,label) VALUES($1,'test','Test') RETURNING id",[id])).rows[0].id;
 const question=(await db.query("INSERT INTO questions(event_id,title,status) VALUES($1,'Synthetic load test','open') RETURNING id",[id])).rows[0].id;
 await db.query('INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true)',[id,question,audience]);
 const participant=await fetch(base+'/api/public/events/'+slug+'/test');
 assert.equal(participant.status,200);assert.ok(participant.headers.get('set-cookie')?.includes('Secure'));
 assert.equal((await fetch(base+'/api/public/events/'+slug+'/test/qr')).status,200);
 const endpoint=base+'/api/public/events/'+slug+'/test/submissions';
 assert.equal((await fetch(endpoint,{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json'},body:'{}'})).status,403);
 const start=Date.now(),times=[];
 const status=await Promise.all(Array.from({length:300},async(_,i)=>{
   const t=Date.now();
   const r=await fetch(endpoint,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:'mir_participant='+randomBytes(32).toString('hex')},body:JSON.stringify({questionId:question,text:'навык '+i%10,idempotencyKey:randomUUID()}),signal:AbortSignal.timeout(60000)});
   times.push(Date.now()-t);return r.status;
 }));
 assert.deepEqual([...new Set(status)],[200]);
 assert.equal((await db.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1',[id])).rows[0].n,300);
 const cloud=await (await fetch(base+'/api/public/events/'+slug+'/screen')).json();
 assert.equal(cloud.audiences[0].words.reduce((n,w)=>n+w.count,0),300);
 times.sort((a,b)=>a-b);
 console.log(JSON.stringify({status:'PASS',participants:300,success:300,totalMs:Date.now()-start,p95Ms:times[284],maxMs:times[299],cloudAnswers:300,organizerLogin:true,publicAdminBlocked:true,csrfBlocked:true,secureCookie:true,qr:true,syntheticOnly:true}));
 const logout=await fetch(base+'/api/admin/logout',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:adminCookie},body:'{}'});
 assert.equal(logout.status,200);
 assert.equal((await fetch(base+'/api/admin/events',{headers:{Cookie:adminCookie}})).status,401);
}finally{
 if(id)await removeTestEvent(db,id);
 await db.end();
}
