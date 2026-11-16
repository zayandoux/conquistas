import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const {completionState,canEditPerson,canManagePhoto,photoPath,comparePhotoDates}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../site/logic.js',import.meta.url))).toString('base64'));
const row=(goal,person,status)=>({goal,person,status});
test('treino só fica verde quando os dois começaram',()=>{
 assert.equal(completionState('training',[row('training','zayan','completed'),row('training','leo','pending')]),'pending');
 assert.equal(completionState('training',[row('training','zayan','completed'),row('training','leo','completed')]),'completed');
 assert.equal(completionState('training',[row('training','zayan','completed')]),'pending');
});
test('PC e CNH só concluem para o grupo quando os dois concluem',()=>{
 for(const goal of ['pc','cnh']){
  assert.equal(completionState(goal,[row(goal,'zayan','completed'),row(goal,'leo','pending')]),'in_progress');
  assert.equal(completionState(goal,[row(goal,'zayan','completed'),row(goal,'leo','completed')]),'completed');
 }
});
test('negócio e comemoração usam uma marcação compartilhada',()=>{
 assert.equal(completionState('business',[row('business','both','in_progress')]),'in_progress');
 assert.equal(completionState('business',[row('business','both','completed')]),'completed');
 assert.equal(completionState('celebrate',[row('celebrate','both','completed')]),'completed');
});
test('sem conexão não apresenta uma conclusão inexistente',()=>{
 assert.equal(completionState('business',[row('business','both','completed')],false),'unknown');
 assert.equal(completionState('pc',[]),'pending');
});
test('a mesma pessoa pode enviar várias fotos na mesma data sem colisão',()=>{
 const user='10000000-0000-4000-8000-000000000001';
 const ids=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003'];
 const paths=ids.map(id=>photoPath(user,id));
 assert.equal(new Set(paths).size,3);
 assert.ok(paths.every(path=>path.startsWith(user+'/')));
 assert.throws(()=>photoPath('../outro','foto'));
});
test('cada pessoa só altera suas metas individuais; as duas editam as compartilhadas',()=>{
 for(const person of ['zayan','leo']){
  assert.equal(canEditPerson(person,person),true);
  assert.equal(canEditPerson(person,'both'),true);
  assert.equal(canEditPerson(person,person==='zayan'?'leo':'zayan'),false);
 }
 assert.equal(canEditPerson(undefined,'both'),false);
 assert.equal(canEditPerson('terceiro','both'),false);
});
test('os controles de edição e exclusão de fotos pertencem apenas ao dono',()=>{
 assert.equal(canManagePhoto('zayan-user','zayan-user'),true);
 assert.equal(canManagePhoto('leo-user','zayan-user'),false);
 assert.equal(canManagePhoto(undefined,undefined),false);
});
test('a comparação desempata fotos do mesmo dia pela ordem de envio',()=>{
 const list=[{id:'b',captured_on:'2027-02-01',created_at:'2027-02-01T13:00:00Z'},
 {id:'c',captured_on:'2027-01-31',created_at:'2027-02-01T14:00:00Z'},
 {id:'a',captured_on:'2027-02-01',created_at:'2027-02-01T12:00:00Z'}];
 assert.deepEqual(list.sort(comparePhotoDates).map(p=>p.id),['c','a','b']);
});
