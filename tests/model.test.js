import test from 'node:test';
import assert from 'node:assert/strict';
import {photoValidationError,photoLimits,occupations,bodyTypes} from '../dist/model.js';
import {readFile} from 'node:fs/promises';
test('ten photos with strict client format and size checks',()=>{
 assert.equal(photoLimits.maxCount,10);
 assert.equal(photoValidationError({type:'image/jpeg',size:photoLimits.maxBytes}),'');
 assert.ok(photoValidationError({type:'image/jpeg',size:photoLimits.maxBytes+1}));
 assert.ok(photoValidationError({type:'image/svg+xml',size:100}));
 assert.ok(photoValidationError({type:'image/png',size:0}));
 assert.ok(occupations.includes('Nông dân / Làm vườn'));
 assert.ok(occupations.includes('Công nhân / Thợ kỹ thuật'));
 assert.ok(bodyTypes.includes('Rắn rỏi'));
});
test('public interface contains no fictional membership claims or sample state',async()=>{
 for(const path of ['../dist/app.js','../dist/index.html','../dist/model.js']){
  const text=await readFile(new URL(path,import.meta.url),'utf8');
  assert.doesNotMatch(text,/hồ sơ minh họa|nhân vật hư cấu|bản trải nghiệm|thử nghiệm|chichdao\.preview|defaultState/i);
 }
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(html,/id="onboarding-track"/);assert.match(html,/id="login-step"/);assert.match(html,/id="profile-reminder"/);
});
