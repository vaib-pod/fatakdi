(() => {
  'use strict';
  const $=id=>document.getElementById(id),players=new Map(),seenEffects=new Map(),sounds=new Map();
  let bridge,session=null,source=null,connected=false,busy=false,sending=false,lastSend=0,offset=0,profileTimer;
  let connectionGeneration=0,lastFace=null,sequence=0;
  const status=(message,error=false)=>{$('party-status').textContent=message;$('party-status').dataset.error=String(error);};
  const now=()=>Date.now()+offset;
  async function request(action,body={},token=session?.token){
    if(action==='update'||action==='show')body={...body,sequence:++sequence};
    let response;
    try{response=await fetch('/api/party/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),cache:'no-store'});}
    catch{throw new Error('Cannot reach the party server. Start it with npm start, or check your connection.');}
    let data;try{data=await response.json();}catch{throw new Error('Parties need the multiplayer server. Run npm start and open http://localhost:3000.');}
    if(!response.ok){const error=new Error(data.error||'The party request failed.');error.status=response.status;throw error;}
    return data;
  }
  function roster(){
    $('party-count').textContent=`${players.size} / 8 people in the courtyard`;
    const list=$('party-roster');list.replaceChildren();
    for(const player of players.values()){
      const row=document.createElement('li');
      if(player.face){const image=new Image();image.src=player.face.png;image.alt='';row.append(image);}
      const name=document.createElement('span');name.textContent=player.name;row.append(name);
      const tag=document.createElement('small');tag.textContent=[player.id===session.id?'You':'',player.id===session.hostId?'Host':''].filter(Boolean).join(' · ');row.append(tag);list.append(row);
    }
  }
  function applyFace(player,face){
    player.face=face;player.faceImage=null;
    if(face){player.faceImage=new Image();player.faceImage.src=face.png;}
  }
  function upsert(player){
    let current=players.get(player.id);
    if(!current){current=player.id===session.id?{...player}:bridge.createActor(player);players.set(player.id,current);}
    else if(player.id!==session.id)bridge.receive(current,player.state);
    current.name=player.name;applyFace(current,player.face);
    return current;
  }
  function stopSounds(playerId){
    for(const [id,group] of sounds)if(!playerId||group.playerId===playerId){group.tracks.forEach(track=>{track.generation++;track.pending=false;track.playing=false;track.audio?.pause();track.loopSound?.stop();});sounds.delete(id);}
  }
  function addSound(effect){
    const tracks=bridge.audioPlan(effect.state);
    sounds.set(effect.id,{playerId:effect.playerId,at:effect.at,tracks:tracks.map(track=>({...track,
      audio:track.loopEnd?null:new Audio(track.src),loopSound:track.loopEnd?new CrackerLoop({src:track.src,startAt:track.loopStart,loopEndAt:track.loopEnd,burnDuration:track.end}):null,
      playing:false,pending:false,failed:false,generation:0}))});
  }
  function receiveEffect(effect){
    if(effect.playerId===session.id||seenEffects.has(effect.id))return;
    const actor=players.get(effect.playerId);if(!actor)return;
    const age=Math.max(0,(now()-effect.at)/1000);
    seenEffects.set(effect.id,now());
    bridge.startEffect(actor,effect,age);stopSounds(effect.playerId);addSound(effect);
  }
  function listen(generation){
    source=new EventSource('/api/party/events?session='+encodeURIComponent(session.token));
    const handle=(name,fn)=>source.addEventListener(name,event=>{
      if(generation!==connectionGeneration||!session)return;
      try{fn(JSON.parse(event.data));}catch(error){console.error('Party event:',error);}
    });
    handle('room',room=>{
      offset=room.now-Date.now();session.hostId=room.hostId;
      const live=new Set(room.players.map(player=>player.id));
      for(const id of players.keys())if(!live.has(id)){players.delete(id);stopSounds(id);}
      room.players.forEach(upsert);connected=true;roster();
      status('You’re in! Choose a cracker and light it together.');
      room.effects.forEach(receiveEffect);publishFace();
    });
    handle('joined',data=>{session.hostId=data.hostId;upsert(data.player);roster();});
    handle('left',data=>{players.delete(data.id);stopSounds(data.id);session.hostId=data.hostId;roster();});
    handle('move',data=>{
      if(data.id===session.id)return;
      const player=players.get(data.id);if(player){if(player.state.phase==='show'&&data.state.phase!=='show')stopSounds(data.id);bridge.receive(player,data.state);}
    });
    handle('profile',data=>{const player=players.get(data.id);if(player){applyFace(player,data.face);roster();}});
    handle('show',receiveEffect);
    source.onerror=()=>{if(generation!==connectionGeneration)return;connected=false;bridge.clearKeys();status('Connection interrupted. Reconnecting to your party…',true);};
  }
  async function enter(action){
    if(busy||session)return;
    const name=$('party-name').value.trim();if(!name){status('Enter your name first.',true);$('party-name').focus();return;}
    const code=$('party-code').value.trim().toUpperCase();
    if(action==='join'&&!/^[A-Z2-9]{6}$/.test(code)){status('Enter the six-character room code.',true);$('party-code').focus();return;}
    busy=true;$('party-host').disabled=$('party-join').disabled=true;status(action==='host'?'Creating your party…':'Joining the party…');
    try{
      session=await request(action,{name,code,state:bridge.snapshot()});
      bridge.join(session.player);players.clear();upsert(session.player);
      $('party-lobby').hidden=true;$('party-room').hidden=false;$('party-room-code').textContent=session.code;
      const invite=new URL(location.href);invite.searchParams.set('room',session.code);invite.hash='';$('party-invite').value=invite.href;
      roster();listen(++connectionGeneration);
    }catch(error){status(error.message,true);}
    finally{busy=false;$('party-host').disabled=$('party-join').disabled=false;}
  }
  function exit(message='You left the party. Your solo game is ready.',notify=true){
    if(!session)return;
    const old=session;session=null;connected=false;connectionGeneration++;source?.close();source=null;
    stopSounds();players.clear();seenEffects.clear();clearTimeout(profileTimer);lastFace=null;
    $('party-share-face').checked=false;$('party-room').hidden=true;$('party-lobby').hidden=false;
    bridge.leave();status(message);
    if(notify)request('leave',{},old.token).catch(()=>{});
  }
  async function publishFace(){
    if(!session||!connected)return;
    const face=$('party-share-face').checked?window.FaceAvatar.exportCutout():null;
    const signature=face?JSON.stringify(face):'default';
    if(signature===lastFace)return;
    const token=session.token;
    try{await request('profile',{face},token);if(session?.token===token)lastFace=signature;}
    catch(error){if(session?.token===token)status(error.message,true);}
  }
  function queueFace(){clearTimeout(profileTimer);profileTimer=setTimeout(publishFace,650);}
  async function copy(value){
    try{await navigator.clipboard.writeText(value);status('Copied! Send it to your friends.');}
    catch{$('party-invite').focus();$('party-invite').select();status('Select and copy the invite link above.');}
  }
  function updateSounds(){
    const settings=bridge.audioSettings();
    for(const [id,group] of sounds){
      const age=(now()-group.at)/1000;let finished=true;
      for(const track of group.tracks){
        const rate=track.playbackRate||1;
        const time=track.base+(age-track.start)*rate,active=age>=track.start&&time<track.end;
        if(time<track.end)finished=false;
        if(track.loopSound){
          track.loopSound.sync({context:settings.context,time:age-track.start,volume:settings.volume*.65,enabled:active&&settings.enabled});
          continue;
        }
        track.audio.volume=settings.volume*(group.tracks.length>1?.45:.65)*Math.min(1,Math.max(0,(track.end-time)/.15));
        track.audio.playbackRate=rate;track.audio.preservesPitch=true;
        if(!active||!settings.enabled){if(track.playing||track.pending){track.generation++;track.audio.pause();track.playing=false;track.pending=false;}continue;}
        if(track.playing||track.pending||track.failed)continue;
        const generation=++track.generation;track.pending=true;
        track.audio.currentTime=Math.max(0,time);
        track.audio.play().then(()=>{
          if(track.generation!==generation){track.audio.pause();return;}
          track.pending=false;track.playing=true;
          const current=track.base+((now()-group.at)/1000-track.start)*rate;
          if(Math.abs(track.audio.currentTime-current)>.1)track.audio.currentTime=Math.max(0,current);
        }).catch(()=>{if(generation===track.generation){track.pending=false;track.failed=true;}});
      }
      if(finished){group.tracks.forEach(track=>{track.audio?.pause();track.loopSound?.stop();});sounds.delete(id);}
    }
  }
  window.Party={
    get active(){return !!session;},get connected(){return connected;},
    get burningCrackers(){return session?[...players.values()].filter(player=>player.id!==session.id).map(player=>({state:player.state,target:player.target})):[];},
    get needsSkyView(){
      if(!session)return false;
      const airborne=state=>state.phase==='show'&&['skyshot','double','rocket','lantern'].includes(state.kind);
      if(airborne(bridge.snapshot()))return true;
      for(const player of players.values())if(player.id!==session.id&&player.effectActive&&airborne(player.state))return true;
      return false;
    },
    attach(game){bridge=game;},
    show(){
      if(!session||!connected)return;
      request('show',{state:bridge.snapshot()}).catch(error=>status('Could not share this firework: '+error.message,true));
    },
    tick(dt){
      if(!session)return;
      for(const player of players.values())if(player.id!==session.id)bridge.advanceActor(player,dt);
      updateSounds();
      const timestamp=performance.now();
      if(!sending&&timestamp-lastSend>100){
        lastSend=timestamp;sending=true;
        const token=session.token;
        request('update',{state:bridge.snapshot()},token).then(()=>{
          if(session?.token===token&&!connected&&source?.readyState===EventSource.OPEN){connected=true;status('You’re back in the party.');}
        }).catch(error=>{
          if(session?.token!==token)return;
          if(error.status===401)exit(error.message,false);
          else{connected=false;bridge.clearKeys();status(error.message,true);}
        }).finally(()=>sending=false);
      }
      for(const [id,time] of seenEffects)if(now()-time>60000)seenEffects.delete(id);
    },
    drawActors(context,localY,drawLocal){
      const actors=[...players.values()].filter(player=>player.id!==session.id).map(actor=>({y:actor.state.player.y,draw:()=>bridge.drawActor(actor),actor}));
      actors.push({y:localY,draw:drawLocal,actor:players.get(session.id),local:true});actors.sort((a,b)=>a.y-b.y);
      for(const entry of actors){
        entry.draw();
        const player=entry.local?bridge.snapshot().player:entry.actor.state.player;
        context.save();context.font='600 14px system-ui';context.textAlign='center';context.textBaseline='middle';
        const label=entry.actor.name+(entry.local?' · You':'');const width=context.measureText(label).width+18;
        context.fillStyle='#0b1125dd';context.beginPath();context.roundRect(player.x-width/2,player.y+15,width,23,8);context.fill();
        context.fillStyle=entry.local?'#ffd294':'#ecf5ff';context.fillText(label,player.x,player.y+27);context.restore();
      }
    },
    drawProps(){for(const player of players.values())if(player.id!==session.id)bridge.drawProp(player);},
    drawEffects(){for(const player of players.values())if(player.id!==session.id)bridge.drawEffects(player);}
  };
  $('party-host').addEventListener('click',()=>enter('host'));
  $('party-join').addEventListener('click',()=>enter('join'));
  $('party-leave').addEventListener('click',()=>exit());
  $('party-copy-code').addEventListener('click',()=>copy(session.code));
  $('party-copy-link').addEventListener('click',()=>copy($('party-invite').value));
  $('party-share-face').addEventListener('change',queueFace);
  window.addEventListener('avatar:change',queueFace);
  window.addEventListener('pagehide',()=>{
    if(session)fetch('/api/party/leave',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:'{}',keepalive:true}).catch(()=>{});
    source?.close();stopSounds();
  });
  $('party-code').addEventListener('input',()=>{$('party-code').value=$('party-code').value.toUpperCase().replace(/[^A-Z2-9]/g,'');});
  const invite=new URL(location.href).searchParams.get('room');
  if(invite){$('party-code').value=invite.toUpperCase().slice(0,6);status('You’ve been invited! Enter your name and choose Join.');}
})();
