import {chromium,webkit,devices,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='https://imi-cloudpoll.ru',slug='rehearsal-25-oct';
await fs.mkdir('public-mobile-evidence',{recursive:true});
for (const [name,type,device] of [['iphone-webkit',webkit,devices['iPhone 13']],['android-chromium',chromium,devices['Pixel 7']]]) {
 const browser=await type.launch();const ctx=await browser.newContext({...device,baseURL:base});
 const page=await ctx.newPage();const screen=await ctx.newPage();const failures=[];
 ctx.on('page',p=>p.on('pageerror',e=>failures.push({kind:'javascript',message:e.message})));
 for(const p of [page,screen]){p.on('pageerror',e=>failures.push({kind:'javascript',message:e.message}));p.on('requestfailed',r=>failures.push({kind:'request',path:new URL(r.url()).pathname,error:r.failure()?.errorText}));}
 try{
  assert.equal((await page.goto(base+'/',{timeout:30000})).status(),200);
  await page.getByRole('link',{name:'Ответить на вопрос →'}).click();
  await expect(page).toHaveURL(base+'/e/mir-27-oct/student',{timeout:20000});
  await expect(page.getByRole('heading',{name:'что вы ожидаете от будущей работы?'})).toBeVisible({timeout:20000});
  await page.getByRole('link',{name:'мир облако слов'}).click();await expect(page).toHaveURL(base+'/',{timeout:20000});
  assert.equal((await screen.goto(base+'/e/'+slug+'/screen',{timeout:30000})).status(),200);
  await expect(screen.getByRole('img',{name:'QR-код для группы: Участники'})).toBeVisible({timeout:20000});
  const qrText=(await screen.locator('.screen-link').innerText()).replace(/\s/g,'');
  assert.equal(qrText,base+'/e/'+slug+'/all');
  assert.equal((await page.goto(qrText,{timeout:30000})).status(),200);
  await expect(page.getByRole('textbox',{name:'Ваш ответ'})).toBeVisible({timeout:20000});
  const word=name==='iphone-webkit'?'проверка safari':'проверка android';
  await page.getByRole('textbox',{name:'Ваш ответ'}).fill(word);
  await page.getByRole('button',{name:'Отправить →'}).click();
  await expect(page.getByRole('status')).toContainText('Ответ принят',{timeout:20000});
  await expect(screen.locator('svg.cloud text').filter({hasText:word})).toBeVisible({timeout:15000});
  await page.screenshot({path:'public-mobile-evidence/'+name+'-answer.png',fullPage:true});
  await screen.screenshot({path:'public-mobile-evidence/'+name+'-cloud.png',fullPage:true});
  await page.getByRole('link',{name:'мир облако слов'}).click();await expect(page).toHaveURL(base+'/',{timeout:20000});
  await expect(page.getByRole('heading',{name:'Разные ожидания. Общее будущее.'})).toBeVisible();
  const ready=await ctx.request.get(base+'/api/ready');assert.equal(ready.status(),200);
  console.log(JSON.stringify({status:'PASS',name,realPublicProduction:true,homeParticipantHome:true,qrTarget:qrText,answerAccepted:true,liveCloud:true,homeAfterSubmission:true,failures}));
 }catch(e){console.log(JSON.stringify({status:'FAIL',name,failures,error:e.message}));await page.screenshot({path:'public-mobile-evidence/'+name+'-failure.png',fullPage:true}).catch(()=>{});throw e;}
 finally{await ctx.close();await browser.close();}
}
