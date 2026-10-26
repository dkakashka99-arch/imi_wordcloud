// Authorized four independent poll entries. Existing questions and answers are preserved.
import pg from 'pg';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const c=await db.connect();
try {
 await c.query('BEGIN');
 const event=(await c.query("SELECT id FROM events WHERE slug='mir-27-oct' FOR UPDATE")).rows[0];
 if(!event)throw new Error('Expected event missing');
 const id=event.id;
 const before=(await c.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1',[id])).rows[0].n;
 const employer=(await c.query("SELECT id FROM audiences WHERE event_id=$1 AND key='employer' FOR UPDATE",[id])).rows[0];
 const student=(await c.query("SELECT id FROM audiences WHERE event_id=$1 AND key='student'",[id])).rows[0];
 if(!employer||!student)throw new Error('Expected audiences missing');
 const skills=(await c.query("SELECT q.id FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE q.event_id=$1 AND qa.audience_id=$2 AND q.title='Какие навыки вы ждете от выпускников?' ORDER BY qa.active DESC,q.position,q.id LIMIT 1",[id,employer.id])).rows[0];
 const studentMarket=(await c.query("SELECT q.id FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE q.event_id=$1 AND qa.audience_id=$2 AND qa.active AND lower(q.title)=lower($3)",[id,student.id,'Одно слово, которое описывает современный рынок труда'])).rows[0];
 if(!skills||!studentMarket)throw new Error('Expected questions missing');
 const second=(await c.query("INSERT INTO audiences(event_id,key,label) VALUES($1,'employer2','Работодатели 2') ON CONFLICT(event_id,key) DO UPDATE SET label=EXCLUDED.label RETURNING id",[id])).rows[0];
 await c.query("UPDATE audiences SET label='Работодатели 1' WHERE id=$1",[employer.id]);
 let market=(await c.query("SELECT q.id FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE q.event_id=$1 AND q.id<>$2 AND lower(q.title)=lower($3) AND qa.audience_id=ANY($4::uuid[]) ORDER BY qa.active DESC,q.position,q.id LIMIT 1",[id,studentMarket.id,'Одно слово, которое описывает современный рынок труда',[employer.id,second.id]])).rows[0];
 if(!market)market=(await c.query("INSERT INTO questions(event_id,title,status,max_answers,max_length) SELECT event_id,title,status,max_answers,max_length FROM questions WHERE id=$1 RETURNING id",[studentMarket.id])).rows[0];
 for(const [audience,question] of [[employer.id,skills.id],[second.id,market.id]]){
  await c.query('UPDATE question_audiences SET active=false WHERE audience_id=$1',[audience]);
  await c.query('INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,true) ON CONFLICT(question_id,audience_id) DO UPDATE SET active=true',[id,question,audience]);
 }
 await c.query("UPDATE questions SET status='open',revision=revision+1 WHERE id=$1 AND status<>'open'",[market.id]);
 const entries=(await c.query("SELECT a.key,a.label,q.id,q.title,q.status FROM audiences a JOIN question_audiences qa ON qa.audience_id=a.id AND qa.active JOIN questions q ON q.id=qa.question_id WHERE a.event_id=$1 ORDER BY a.key",[id])).rows;
 if(entries.length!==4||new Set(entries.map(e=>e.id)).size!==4)throw new Error('Expected four independent questions');
 const after=(await c.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1',[id])).rows[0].n;
 if(before!==after)throw new Error('Answer preservation failed');
 await c.query('COMMIT');
 console.log(JSON.stringify({event:'four_poll_entries_configured',answersPreserved:true,entries}));
}catch(error){await c.query('ROLLBACK');console.error('Four-poll configuration failed:',error.message);process.exitCode=1;}
finally{c.release();await db.end();}
