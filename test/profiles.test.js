const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
let child, origin, profiles, admin, keyUser, user, logs='';
async function http(url, method='GET', body, cookie, status=200, headers={}) {
  const response=await fetch(origin+url,{method,headers:{'content-type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();assert.equal(response.status,status,method+' '+url+': '+text);
  return {data:text?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const api=async(cookie,method,url,body,status=200)=>(await http('/odata/v4/booking/'+url,method,body,cookie,status)).data;
before(async()=>{
  child=fork(path.join(__dirname,'fixtures/server.cjs'),[],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'test',CDS_ENV:'test',RSVROOM_AUTH_MODE:'profile',CDS_REQUIRES_DB_CREDENTIALS_URL:':memory:'},silent:true});
  child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
  const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(logs)),30000);child.once('message',data=>{clearTimeout(timeout);resolve(data.port);});child.once('exit',()=>{clearTimeout(timeout);reject(new Error(logs));});child.once('error',reject);});
  origin=`http://127.0.0.1:${port}`;
});
after(async()=>{if(child&&child.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}});

test('active profiles and all three roles are available without passwords or setup',async()=>{
  assert.deepEqual((await http('/auth/status')).data,{mode:'profile',setupRequired:false});
  profiles=(await http('/auth/profiles')).data;
  assert.deepEqual([...new Set(profiles.map(row=>row.role))].sort(),['ADMIN','KEY_USER','USER']);
  assert.equal(profiles.filter(row=>row.role==='USER').length,7);
  assert(profiles.every(row=>Object.keys(row).sort().join(',')==='ID,company_ID,displayName,email,role'));
  await http('/auth/setup','POST',{},undefined,409);
  await http('/auth/login','POST',{},undefined,401);
  await http('/auth/login','POST',{userID:'missing',role:'ADMIN'},undefined,401);
  for(const profile of profiles){
    const result=await http('/auth/login','POST',{userID:profile.ID,role:'ADMIN'});
    assert.equal(result.data.role,profile.role);assert(!('passwordHash'in result.data));
    assert.equal((await api(result.cookie,'GET','currentUser()')).ID,profile.ID);
    if(profile.role==='ADMIN')admin=result.cookie;else if(profile.role==='KEY_USER')keyUser=result.cookie;else if(!user)user=result.cookie;
  }
});

test('profile sessions enforce own bookings and the key-user/admin distinction',async()=>{
  const regular=profiles.find(row=>row.role==='USER');
  const room=(await api(user,'GET','Resources')).value.find(row=>row.type==='ROOM');
  const data={resource_ID:room.ID,title:'Profile reservation',startAt:'2043-04-01T09:00:00Z',endAt:'2043-04-01T10:00:00Z'};
  const booking=await api(user,'POST','Bookings',data,201);assert.equal(booking.user_ID,regular.ID);
  await api(user,'POST','Bookings',{...data,user_ID:profiles[0].ID},403);
  await api(user,'PATCH',`Users(${regular.ID})`,{role:'ADMIN'},403);
  await api(keyUser,'PATCH',`Resources(${room.ID})`,{name:'Forbidden'},403);
  await api(keyUser,'PATCH',`Bookings(${booking.ID})`,{title:'Forbidden'},403);
  await api(keyUser,'DELETE',`Bookings(${booking.ID})`,undefined,204);
  const added=await api(keyUser,'POST','Users',{displayName:'New profile',email:'new-profile@example.com',company_ID:regular.company_ID},201);
  assert.equal(added.role,'USER');
  assert((await http('/auth/profiles')).data.some(row=>row.ID===added.ID));
  await http('/auth/login','POST',{userID:added.ID});
  await api(admin,'PATCH',`Users(${added.ID})`,{role:'ADMIN'});
  // The second administrator needs no password to keep administration accessible.
  const originalAdmin=profiles.find(row=>row.role==='ADMIN');
  await api(admin,'PATCH',`Users(${originalAdmin.ID})`,{role:'KEY_USER'});
  const replacement=(await http('/auth/login','POST',{userID:added.ID})).cookie;
  await api(replacement,'PATCH',`Users(${originalAdmin.ID})`,{role:'ADMIN'});
  await api(replacement,'DELETE',`Users(${added.ID})`,undefined,204);
});

test('switching rotates the session, inactive profiles cannot log in, and logout revokes access',async()=>{
  const regular=profiles.find(row=>row.role==='USER');
  const administrator=profiles.find(row=>row.role==='ADMIN');
  const switched=await http('/auth/login','POST',{userID:administrator.ID},user);
  await api(user,'GET','currentUser()',undefined,401);
  assert.equal((await api(switched.cookie,'GET','currentUser()')).role,'ADMIN');
  await api(admin,'PATCH',`Users(${regular.ID})`,{active:false});
  assert(!(await http('/auth/profiles')).data.some(row=>row.ID===regular.ID));
  await http('/auth/login','POST',{userID:regular.ID},undefined,401);
  await api(admin,'PATCH',`Users(${regular.ID})`,{active:true});
  await http('/auth/login','POST',{userID:regular.ID},undefined,403,{Origin:'https://foreign.example'});
  await http('/auth/logout','POST',{},switched.cookie,204);
  await api(switched.cookie,'GET','currentUser()',undefined,401);
});
