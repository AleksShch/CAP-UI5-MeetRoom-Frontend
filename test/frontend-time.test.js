const {test}=require('node:test');
const assert=require('node:assert/strict');
const Time=require('../app/model/Time');
test('office wall times use the office timezone, including seasonal offsets',()=>{
  assert.equal(Time.toUTC('2030-07-01','09:00','Europe/Berlin'),'2030-07-01T07:00:00.000Z');
  assert.equal(Time.toUTC('2030-01-01','09:00','Europe/Berlin'),'2030-01-01T08:00:00.000Z');
  assert.equal(Time.toUTC('2030-07-01','09:00','America/New_York'),'2030-07-01T13:00:00.000Z');
  assert.throws(()=>Time.toUTC('2030-03-31','02:30','Europe/Berlin'),/nonexistentTime/);
  assert.throws(()=>Time.toUTC('2030-10-27','02:30','Europe/Berlin'),/ambiguousTime/);
  assert.throws(()=>Time.toUTC('2030-02-30','09:00','Europe/Berlin'),/invalidTime/);
});
