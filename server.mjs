import http from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('.',import.meta.url));
const kinds=['skyshot','double','rocket','fuljhadi','fountain','peacock','kitkat','chakri','lantern','mirchi','aloo'];
const colors=['golden','red','green','blue','orange','purple'];
const phases=['idle','lighting','fuse','show','fail'];
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const limit=8;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):min;
const pick=(value,options,fallback)=>options.includes(value)?value:fallback;
const outfitColor=(value,fallback)=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value)?value.toLowerCase():fallback;
function crackerSpot(state,anchor){
  if(state.kind!=='mirchi')return {...anchor};
  const count=state.mirchiCount||10,start=(count===10?-48:-count*3)*.8,end=(count===10?46.5:count*3)*.8;
  return {x:Math.max(74-start,Math.min(1000-74-end,anchor.x)),y:anchor.y};
}
function cleanState(input={}){
  return {player:{x:finite(input.player?.x,65,935),y:finite(input.player?.y,310,565)},
    character:pick(input.character,['male','female'],'male'),kind:pick(input.kind,kinds,'skyshot'),
    kurtaColor:outfitColor(input.kurtaColor,'#74c8bf'),ghagraColor:outfitColor(input.ghagraColor,'#b65baf'),
    phase:pick(input.phase,phases,'idle'),skyshotCount:pick(input.skyshotCount,[1,6,12],1),
    mirchiCount:pick(input.mirchiCount,[10,50,100],10),singleColor:pick(input.singleColor,colors,'golden'),
    fuljhadiColor:pick(input.fuljhadiColor,colors,'golden'),facingBack:input.facingBack===true,
    armRotating:input.armRotating===true,armAngle:finite(input.armAngle,-1e6,1e6),
    jumpTime:['fuse','show'].includes(input.phase)?finite(input.jumpTime,0,.7):0,
    jumping:['fuse','show'].includes(input.phase)&&input.jumping===true,
    clock:finite(input.clock,0,40),walk:finite(input.walk,0,1e9),fuse:finite(input.fuse,0,4.3)};
}
function cleanFace(face){
  if(face===null)return null;
  if(!face||typeof face.png!=='string'||face.png.length>60000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(face.png))throw fail('Invalid face cutout. Retake the photo.');
  const png=Buffer.from(face.png.slice(22),'base64');
  if(png.length<33||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR')throw fail('Invalid face image.');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(!width||!height||width>128||height>128||![face.faceWidth,face.anchorX,face.anchorY].every(Number.isFinite)||face.faceWidth<=0||face.faceWidth>128||face.anchorX<0||face.anchorX>width||face.anchorY<0||face.anchorY>height)throw fail('Invalid face dimensions.');
  return {png:face.png,faceWidth:face.faceWidth,anchorX:face.anchorX,anchorY:face.anchorY,hairColor:/^#[a-f\d]{6}$/i.test(face.hairColor)?face.hairColor:null};
}
async function jsonBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw fail('Send JSON.',415);
  let size=0,parts=[];
  for await(const chunk of req){size+=chunk.length;if(size>70000)throw fail('Request too large.',413);parts.push(chunk);}
  try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw fail('Invalid JSON.');}
}
export function createPartyServer(){
  const rooms=new Map(),sessions=new Map(),buckets=new Map();
  const rounds=new Map();
  const publicState=p=>({...p.state,crackerReserved:p.sharedIgnition?.stage==='lighting',serverIgnition:!!p.sharedIgnition});
  const publicPlayer=p=>({id:p.id,name:p.name,slot:p.slot,target:p.target,state:publicState(p),face:p.face});
  function clearIgnition(player){
    const round=player.sharedIgnition;if(!round)return;
    clearTimeout(round.contactTimer);clearTimeout(round.showTimer);clearTimeout(round.cleanupTimer);
    rounds.delete(player.id);player.sharedIgnition=null;
  }
  function send(player,event,data){
    const stream=player.stream;
    if(!stream||stream.destroyed)return;
    if(stream.writableLength>256000){stream.destroy();return;}
    stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  const broadcast=(room,event,data)=>{for(const player of room.players.values())send(player,event,data);};
  function remove(player){
    clearIgnition(player);
    const room=player.room;sessions.delete(player.token);room.players.delete(player.id);player.stream?.end();
    room.effects=room.effects.filter(effect=>effect.playerId!==player.id);
    if(!room.players.size){rooms.delete(room.code);return;}
    if(room.hostId===player.id)room.hostId=room.players.keys().next().value;
    broadcast(room,'left',{id:player.id,hostId:room.hostId});
  }
  const server=http.createServer(async(req,res)=>{
    const respond=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,'http://local');
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
      if(url.pathname.startsWith('/api/')){
        // Same-origin JSON requests prevent other sites from acting on a session.
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fail('Use the game’s own address.',403);
        if(url.pathname==='/api/party/health'&&req.method==='GET'){respond(200,{ok:true,maxPlayers:limit});return;}
        const now=Date.now();
        if(url.pathname==='/api/party/host'||url.pathname==='/api/party/join'){
          if(req.method!=='POST')throw fail('Use POST.',405);
          const ip=req.socket.remoteAddress;let bucket=buckets.get(ip);
          if(!bucket||now-bucket.at>60000){bucket={at:now,count:0};buckets.set(ip,bucket);}
          if(++bucket.count>30)throw fail('Too many attempts. Try again in a minute.',429);
          const body=await jsonBody(req),name=typeof body.name==='string'?body.name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,24):'';
          if(!name)throw fail('Enter your name to join.');
          let room;
          if(url.pathname.endsWith('/host')){
            if(rooms.size>=100)throw fail('All party rooms are busy. Try again later.',503);
            let code;do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(rooms.has(code));
            room={code,players:new Map(),effects:[],hostId:null};rooms.set(code,room);
          }else{
            room=rooms.get(String(body.code||'').trim().toUpperCase());
            if(!room)throw fail('Room not found. Check the code or ask for a new invite.',404);
          }
          if(room.players.size>=limit)throw fail('This room is full (8 people).',409);
          if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))throw fail('That name is already in this room. Choose another.',409);
          const slot=Array.from({length:limit},(_,i)=>i).find(i=>![...room.players.values()].some(p=>p.slot===i));
          const target={x:[155,385,615,845][slot%4],y:292+Math.floor(slot/4)*70};
          const player={id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),name,slot,target,room,face:null,
            state:cleanState({...body.state,phase:'idle',clock:0,player:{x:target.x,y:530}}),seen:now,lastUpdate:0,lastShow:0,lastProfile:0,lastSequence:0,stream:null};
          room.players.set(player.id,player);sessions.set(player.token,player);room.hostId??=player.id;
          broadcast(room,'joined',{player:publicPlayer(player),hostId:room.hostId});
          respond(200,{token:player.token,id:player.id,code:room.code,hostId:room.hostId,player:publicPlayer(player)});return;
        }
        const token=req.headers.authorization?.replace(/^Bearer /,'')||url.searchParams.get('session');
        const player=sessions.get(token);
        if(!player)throw fail('Your party session ended. Join the room again.',401);
        const room=player.room;player.seen=now;
        if(url.pathname==='/api/party/events'&&req.method==='GET'){
          player.stream?.end();player.stream=res;
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.write('retry: 1500\n\n');
          room.effects=room.effects.filter(effect=>now-effect.at<30000);
          send(player,'room',{code:room.code,selfId:player.id,hostId:room.hostId,now,players:[...room.players.values()].map(publicPlayer),effects:room.effects,
            ignitions:[...room.players.values()].filter(p=>p.sharedIgnition?.stage==='lighting').map(p=>p.sharedIgnition.info)});
          res.on('close',()=>{if(player.stream===res){player.stream=null;player.seen=Date.now();}});return;
        }
        if(req.method!=='POST')throw fail('Use POST.',405);
        const body=await jsonBody(req);
        if(url.pathname==='/api/party/update'){
          if(Number.isSafeInteger(body.sequence)&&body.sequence<=player.lastSequence){respond(200,{ok:true});return;}
          if(now-player.lastUpdate<60){respond(200,{ok:true});return;}
          if(Number.isSafeInteger(body.sequence))player.lastSequence=body.sequence;
          player.lastUpdate=now;const next=cleanState(body.state),round=player.sharedIgnition;
          if(round){
            for(const key of ['kind','mirchiCount','skyshotCount','singleColor','fuljhadiColor'])next[key]=round.info.state[key];
            if(round.stage==='lighting'){next.phase='idle';next.clock=0;}
            else if(round.stage==='fuse'){next.phase='fuse';next.fuse=Math.max(0,(round.showAt-now)/1000);}
            else if(next.phase==='show')clearIgnition(player);
            else {next.phase='show';next.clock=Math.max(0,(now-round.showAt)/1000)*(next.kind==='double'?.85:1);}
          }
          player.state=next;
          broadcast(room,'move',{id:player.id,state:publicState(player),at:now});
        }else if(url.pathname==='/api/party/ignite'){
          const owner=room.players.get(body.ownerId);
          if(!owner||owner.id===player.id)throw fail('Choose another player’s cracker in this room.',404);
          if(owner.state.kind==='fuljhadi')throw fail('Fuljhadi stays in its owner’s hand.',400);
          if(owner.state.phase!=='idle'||owner.sharedIgnition)throw fail('Someone is already lighting that cracker.',409);
          if(!['idle','fuse','show'].includes(player.state.phase)||player.sharedIgnition||player.lightingUntil>now)throw fail('Finish your current action first.',409);
          const lighter=cleanState(body.state||player.state),spot=crackerSpot(owner.state,owner.target);
          const start=owner.state.kind==='mirchi'?(owner.state.mirchiCount===10?-48:-owner.state.mirchiCount*3)*.8:0;
          if(Math.hypot(lighter.player.x-spot.x-start,lighter.player.y-spot.y)>112)throw fail('Walk closer to that cracker’s fuse.',400);
          player.state=lighter;player.lightingUntil=now+1550;
          const duration=owner.state.kind==='lantern'?0:['aloo','mirchi'].includes(owner.state.kind)?4:4.3;
          const info={id:randomBytes(8).toString('hex'),ownerId:owner.id,igniterId:player.id,at:now,state:{...owner.state},target:spot};
          const round={info,stage:'lighting',showAt:now+1550+duration*1000};owner.sharedIgnition=round;rounds.set(owner.id,owner);
          broadcast(room,'ignite',info);
          round.contactTimer=setTimeout(()=>{
            if(owner.sharedIgnition!==round)return;
            round.stage='fuse';owner.state={...owner.state,phase:'fuse',clock:0,fuse:duration};
            broadcast(room,'fuse',{ownerId:owner.id,id:info.id,at:Date.now(),state:publicState(owner),target:spot});
          },1550);round.contactTimer.unref();
          round.showTimer=setTimeout(()=>{
            if(owner.sharedIgnition!==round)return;
            round.stage='show';owner.state={...owner.state,phase:'show',clock:0,fuse:0};
            const effect={id:info.id,playerId:owner.id,shared:true,igniterId:player.id,at:Date.now(),state:publicState(owner),target:spot};
            room.effects=room.effects.filter(e=>Date.now()-e.at<30000);room.effects.push(effect);broadcast(room,'show',effect);
            round.cleanupTimer=setTimeout(()=>clearIgnition(owner),30000);round.cleanupTimer.unref();
          },1550+duration*1000);round.showTimer.unref();
          respond(200,{ok:true,ignition:info});return;
        }else if(url.pathname==='/api/party/profile'){
          if(now-player.lastProfile<500)throw fail('Please wait a moment before changing your face again.',429);
          player.face=cleanFace(body.face);player.lastProfile=now;
          broadcast(room,'profile',{id:player.id,face:player.face});
        }else if(url.pathname==='/api/party/show'){
          if(player.sharedIgnition)throw fail('That cracker’s shared ignition is already running.',409);
          if(now-player.lastShow<1500)throw fail('Your previous firecracker is still starting.',429);
          player.lastShow=now;const state=cleanState(body.state);
          if(!Number.isSafeInteger(body.sequence)||body.sequence>=player.lastSequence){player.state=state;player.lastSequence=body.sequence||player.lastSequence;}
          const effect={id:randomBytes(8).toString('hex'),playerId:player.id,at:now,state,target:crackerSpot(state,player.target)};
          room.effects=room.effects.filter(e=>now-e.at<30000);room.effects.push(effect);
          broadcast(room,'show',effect);
        }else if(url.pathname==='/api/party/leave'){remove(player);}
        else throw fail('Unknown party request.',404);
        respond(200,{ok:true});return;
      }
      if(!['GET','HEAD'].includes(req.method))throw fail('Method not allowed.',405);
      const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      if(!/^\/(?:index\.html|face-avatar\.js|cracker-audio\.js|party\.js|party\.css|onboarding\.js|onboarding\.css|sounds\/[\w.-]+|vendor\/mediapipe\/[\w./-]+)$/.test(name)||name.split('/').some(part=>part.startsWith('.')))throw fail('Not found.',404);
      const file=path.resolve(root,'.'+name);
      if(!file.startsWith(root))throw fail('Not found.',404);
      const info=await stat(file);if(!info.isFile())throw fail('Not found.',404);
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav','.wasm':'application/wasm','.tflite':'application/octet-stream'};
      let start=0,end=info.size-1,status=200;
      if(req.headers.range){
        const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if(!match)throw fail('Invalid range.',416);
        start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;
        if(start>end||start>=info.size){res.setHeader('Content-Range',`bytes */${info.size}`);throw fail('Invalid range.',416);}
        status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
      }
      res.writeHead(status,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes',
        'Cache-Control':name.startsWith('/vendor/')?'public, max-age=86400':'no-cache'});
      if(req.method==='HEAD'){res.end();return;}
      const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }catch(error){if(!res.headersSent)respond(error.status||(error.code==='ENOENT'?404:500),{error:error.status?error.message:'Request could not be completed.'});else res.end();}
  });
  const cleanup=setInterval(()=>{
    const now=Date.now();
    for(const player of sessions.values()){
      if(player.stream){player.seen=now;player.stream.write(': heartbeat\n\n');}
      else if(now-player.seen>45000)remove(player);
    }
    for(const [ip,bucket] of buckets)if(now-bucket.at>60000)buckets.delete(ip);
  },10000);cleanup.unref();
  server.on('close',()=>{clearInterval(cleanup);for(const player of rounds.values())clearIgnition(player);});
  server.closeParties=()=>{for(const player of rounds.values())clearIgnition(player);for(const player of sessions.values())player.stream?.end();};
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createPartyServer();server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Afterglow party server: http://localhost:${server.address().port}`));
  const shutdown=()=>{server.closeParties();server.close(()=>process.exit(0));};
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
