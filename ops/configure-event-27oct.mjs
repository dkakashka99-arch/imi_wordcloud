// Explicitly authorized configuration, additive questions; never delete answers.
import pg from 'pg';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const c=await db.connect();
try {
 await c.query('BEGIN');
 const event=(await c.query("SELECT id FROM events WHERE slug='mir-27-oct' FOR UPDATE")).rows[0];
 if(!event)throw new Error('Expected event missing');
 const id=event.id;
 const before=(await c.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1',[id])).rows[0].n;
 const audiences={};
 for(const [key,label]of [['student','Студенты'],['employer','Работодатели'],['graduate','Выпускники']]){
  audiences[key]=(await c.query('INSERT INTO audiences(event_id,key,label) VALUES($1,$2,$3) ON CONFLICT(event_id,key) DO UPDATE SET label=EXCLUDED.label RETURNING id',[id,key,label])).rows[0].id;
 }
 const specs=[
  ['Одно слово, которое описывает современный рынок труда',['student','employer']],
  ['Какие навыки вы ждете от выпускников?',['employer']],
  ['Назовите главное качество, которое вы хотите прокачать на первой работе',['graduate']],
 ];
 for(const [title,keys]of specs){
  let q=(await c.query('SELECT id FROM questions WHERE event_id=$1 AND title=$2 ORDER BY position,id LIMIT 1',[id,title])).rows[0];
  if(!q)q=(await c.query("INSERT INTO questions(event_id,title,status,max_answers) VALUES($1,$2,'paused',3) RETURNING id",[id,title])).rows[0];
  for(const key of keys)await c.query('INSERT INTO question_audiences(event_id,question_id,audience_id,active) VALUES($1,$2,$3,false) ON CONFLICT(question_id,audience_id) DO NOTHING',[id,q.id,audiences[key]]);
 }
 // Select the authorized initial question; leave collection paused for organizer start.
 for(const [key,index]of [['student',0],['employer',0],['graduate',2]]){
  const q=(await c.query('SELECT id,status FROM questions WHERE event_id=$1 AND title=$2 ORDER BY position,id LIMIT 1',[id,specs[index][0]])).rows[0];
  await c.query('UPDATE question_audiences SET active=false WHERE audience_id=$1',[audiences[key]]);
  await c.query('UPDATE question_audiences SET active=true WHERE question_id=$1 AND audience_id=$2',[q.id,audiences[key]]);
 }
 await c.query("UPDATE events SET title='Встреча студентов и работодателей',public_audience_key=NULL WHERE id=$1",[id]);
 const after=(await c.query('SELECT count(*)::int n FROM submissions WHERE event_id=$1',[id])).rows[0].n;
 if(before!==after)throw new Error('Answer preservation failed');
 await c.query('COMMIT');
 console.log(JSON.stringify({event:'authorized_event_configuration',slug:'mir-27-oct',audiences:Object.keys(audiences),questions:3,answersPreserved:true,collection:'new questions initially paused'}));
}catch(error){await c.query('ROLLBACK');console.error('Event configuration failed');process.exitCode=1;}
finally{c.release();await db.end();}
