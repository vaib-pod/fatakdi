import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartyServer } from '../server.mjs';

async function fixture(t){
  const server=createPartyServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeParties();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const post=async(action,body={},token)=>{
    const response=await fetch(base+'/api/party/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    return {status:response.status,...await response.json()};
  };
  async function stream(token){
    const controller=new AbortController();t.after(()=>controller.abort());
    const response=await fetch(base+'/api/party/events?session='+token,{signal:controller.signal});
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    return {async next(type){
      const timeout=setTimeout(()=>controller.abort(),5000);
      try{while(true){
        const split=buffer.indexOf('\n\n');
        if(split>=0){const block=buffer.slice(0,split);buffer=buffer.slice(split+2);
          if(block.startsWith('event: '+type+'\n'))return JSON.parse(block.slice(block.indexOf('data: ')+6));
        }else{const part=await reader.read();if(part.done)throw Error('Stream ended');buffer+=decoder.decode(part.value,{stream:true});}
      }}finally{clearTimeout(timeout);}
    },close:()=>controller.abort()};
  }
  return {base,post,stream};
}

test('rooms synchronize people, movements, concurrent shows, late joins and host transfer',async t=>{
  const {post,stream}=await fixture(t);
  const host=await post('host',{name:'Asha',state:{phase:'show',clock:4,kind:'skyshot'}});assert.equal(host.status,200);assert.match(host.code,/^[A-Z2-9]{6}$/);
  assert.equal(host.player.state.phase,'idle');assert.equal(host.player.state.clock,0);
  const hostEvents=await stream(host.token);assert.equal((await hostEvents.next('room')).players.length,1);
  const guest=await post('join',{name:'Ravi',code:host.code});assert.equal(guest.status,200);
  assert.notDeepEqual(guest.player.target,host.player.target);
  assert.equal((await hostEvents.next('joined')).player.name,'Ravi');
  const guestEvents=await stream(guest.token);assert.equal((await guestEvents.next('room')).players.length,2);
  const state={kind:'fuljhadi',phase:'show',player:{x:400,y:500},fuljhadiColor:'purple',character:'female',jumpTime:.55,jumping:true};
  await post('update',{state},guest.token);
  const move=await hostEvents.next('move');assert.equal(move.state.player.x,400);assert.equal(move.state.character,'female');assert.equal(move.state.jumpTime,.55);assert.equal(move.state.jumping,true);
  await Promise.all([post('show',{state},guest.token),post('show',{state:{...state,kind:'skyshot',skyshotCount:12}},host.token)]);
  const effects=[await hostEvents.next('show'),await hostEvents.next('show')];assert.equal(new Set(effects.map(e=>e.playerId)).size,2);
  const late=await post('join',{name:'Meera',code:host.code});const lateEvents=await stream(late.token);
  const room=await lateEvents.next('room');assert.equal(room.effects.length,2);assert.equal(room.players.length,3);
  await post('leave',{},host.token);const left=await guestEvents.next('left');assert.equal(left.hostId,guest.id);
  assert.equal((await post('update',{state},host.token)).status,401);
});

test('face cutouts are opt-in, broadcast, removable, and validated',async t=>{
  const {post,stream}=await fixture(t);const host=await post('host',{name:'Host'});const events=await stream(host.token);
  assert.equal((await events.next('room')).players[0].face,null);
  const face={png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',faceWidth:1,anchorX:.5,anchorY:.5,hairColor:'#101010'};
  assert.equal((await post('profile',{face},host.token)).status,200);
  assert.equal((await events.next('profile')).face.png,face.png);
  await new Promise(resolve=>setTimeout(resolve,510));
  assert.equal((await post('profile',{face:null},host.token)).status,200);
  assert.equal((await events.next('profile')).face,null);
  await new Promise(resolve=>setTimeout(resolve,510));
  assert.equal((await post('profile',{face:{...face,png:'data:image/svg+xml;base64,AAAA'}},host.token)).status,400);
  const joiner=await post('join',{code:host.code,name:'Guest'});const joined=await stream(joiner.token);
  assert.equal((await joined.next('room')).players.find(p=>p.id===host.id).face,null);
});

test('out-of-order movement cannot rewind a player or swallow a firework',async t=>{
  const {post,stream}=await fixture(t),host=await post('host',{name:'Host'}),events=await stream(host.token);
  await events.next('room');
  await post('update',{sequence:2,state:{kind:'rocket',phase:'show',player:{x:500,y:550}}},host.token);
  await events.next('move');
  await new Promise(resolve=>setTimeout(resolve,65));
  await post('update',{sequence:1,state:{kind:'skyshot',phase:'idle',player:{x:65,y:310}}},host.token);
  await post('show',{sequence:1,state:{kind:'skyshot',phase:'show'}},host.token);
  assert.equal((await events.next('show')).state.kind,'skyshot');
  const guest=await post('join',{name:'Guest',code:host.code}),guestEvents=await stream(guest.token);
  const state=(await guestEvents.next('room')).players.find(p=>p.id===host.id).state;
  assert.equal(state.kind,'rocket');assert.equal(state.player.x,500);
});

for(const kind of ['peacock','kitkat','double'])test(`${kind} selection and active show reach room members and late joiners`,async t=>{
  const {post,stream,base}=await fixture(t),host=await post('host',{name:'Host'});
  const guest=await post('join',{name:'Guest',code:host.code}),events=await stream(guest.token);await events.next('room');
  const state={kind,phase:'show',clock:0,player:{x:500,y:550}};
  await post('update',{state},host.token);assert.equal((await events.next('move')).state.kind,kind);
  await post('show',{state},host.token);assert.equal((await events.next('show')).state.kind,kind);
  const late=await post('join',{name:'Late guest',code:host.code}),lateEvents=await stream(late.token);
  const room=await lateEvents.next('room');assert.equal(room.effects[0].state.kind,kind);
  const audio=await fetch(base+'/sounds/'+(kind==='double'?'sky_shot':kind)+'.mp3',{headers:{Range:'bytes=0-99'}});
  assert.equal(audio.status,206);assert.equal((await audio.arrayBuffer()).byteLength,100);
});

test('requires names and valid sessions; rooms isolate events and enforce capacity',async t=>{
  const {post,stream,base}=await fixture(t);
  assert.equal((await post('host',{name:'  '})).status,400);
  assert.equal((await post('join',{name:'Guest',code:'AAAAAA'})).status,404);
  const host=await post('host',{name:'Host'});
  assert.equal((await post('join',{name:'host',code:host.code})).status,409);
  for(let i=0;i<7;i++)assert.equal((await post('join',{name:'Guest '+i,code:host.code})).status,200);
  assert.equal((await post('join',{name:'Extra',code:host.code})).status,409);
  assert.equal((await post('update',{state:{}},'fake-token')).status,401);
  const separate=await post('host',{name:'Other'}),events=await stream(separate.token);
  const room=await events.next('room');assert.equal(room.players.length,1);assert.notEqual(room.code,host.code);assert.equal(room.effects.length,0);
  assert.equal((await fetch(base+'/server.mjs')).status,404);
  const range=await fetch(base+'/sounds/sky_shot.mp3',{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
  const cross=await fetch(base+'/api/party/host',{method:'POST',headers:{Origin:'https://elsewhere.example','Content-Type':'application/json'},body:'{"name":"Blocked"}'});assert.equal(cross.status,403);
});
