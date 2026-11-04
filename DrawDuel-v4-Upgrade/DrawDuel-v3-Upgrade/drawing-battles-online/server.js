'use strict';
// Draw Duel multiplayer server. Zero dependencies; same-origin HTTP + Server-Sent Events.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const CLIENT = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const PROMPTS = require('./public/prompts.json');
const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const trim = (s, max = 20) => String(s ?? '').trim().slice(0, max);
const now = () => Date.now();
const MAX_PLAYERS = 8;
const MAX_FRAMES = 12;
function id() { return crypto.randomBytes(24).toString('hex'); }
function code() { let v; do { v = Array.from(crypto.randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(''); } while (rooms.has(v)); return v; }
function validSettings(s) {
  const duration = Number(s?.duration), rounds = Number(s?.rounds);
  return {
    duration: [45,60,90,120,180,300].includes(duration) ? duration : 90,
    rounds: [1,3,5,7,10].includes(rounds) ? rounds : 3,
    category: (Object.hasOwn(PROMPTS, s?.category) || s?.category === 'all') ? s.category : 'all',
    custom: trim(s?.custom, 90),
    maxPlayers: Math.min(MAX_PLAYERS, Math.max(2, Math.floor(Number(s?.maxPlayers) || 4))),
    artMode: s?.artMode === 'animation' ? 'animation' : 'drawing'
  };
}
function nextPrompt(room) {
  const pool = room.settings.category === 'all' ? Object.values(PROMPTS).flat() : PROMPTS[room.settings.category];
  let options = pool.filter(p => !room.used.includes(p));
  if (!options.length) { room.used = []; options = pool; }
  const p = options[crypto.randomInt(options.length)]; room.used.push(p); return p;
}
function person(name) { return { name: trim(name) || 'Artist', token: id(), streams: new Set(), disconnectedAt: 0 }; }
function seatOf(room, token) { return room.players.findIndex(p => p && p.token === token); }
function connected(p) { return Boolean(p && p.streams.size); }
function send(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(text),
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(text);
}
function fail(res, status, message) { send(res, status, { error:message }); }
function event(res, kind, data) { if (!res.destroyed && !res.writableEnded) res.write('event: '+kind+'\ndata: '+JSON.stringify(data)+'\n\n'); }
function stateFor(room, seat) {
  return { code:room.code, seat, host:seat===0, stage:room.stage, mode:room.mode,
    maxPlayers:room.settings.maxPlayers,
    players:room.players.map(p=>({ name:p.name, online:connected(p) })),
    settings:{ ...room.settings, names:room.players.map(p=>p.name) },
    round:room.round,
    // Individual assignments stay private until voting; never leak other players' submissions.
    prompt:room.stage==='battle'?(room.promptAssignments[seat]?.text||''):'',
    promptAuthor:room.stage==='battle'?(room.promptAssignments[seat]?.author??null):null,
    prompts:['vote','result','final'].includes(room.stage)?room.promptAssignments.map(a=>a?.text||''):[],
    authors:['vote','result','final'].includes(room.stage)?room.promptAssignments.map(a=>a?.author??null):[],
    promptsSubmitted:room.promptSubmissions.filter(Boolean).length,
    submitted:Boolean(room.promptSubmissions[seat]),
    myPrompts:room.promptSubmissions[seat]||[],
    remainingMs:room.remainingMs, endAt:room.endAt,
    scores:room.scores, art:room.art, animations:room.stage==='vote'?room.animations:[],
    winner:room.winner, winners:room.winners, gallery:room.stage==='final'?room.gallery:[],
    voted:Object.hasOwn(room.votes,seat), votesCast:Object.keys(room.votes).length };
}
function broadcast(room) {
  room.updatedAt = now();
  for (let seat=0;seat<room.players.length;seat++) {
    for (const res of room.players[seat].streams) event(res,'state',stateFor(room,seat));
  }
}
function broadcastArt(room, from, image) {
  room.updatedAt=now();
  for (let seat=0;seat<room.players.length;seat++) {
    if(seat===from)continue;
    for (const res of room.players[seat].streams) event(res,'art',{seat:from,image});
  }
}
function expireClock(room) {
  if(room.stage==='battle' && room.mode==='drawing' && now()>=room.endAt) {
    room.mode='finished'; room.stage='vote'; room.remainingMs=0; room.endAt=0; room.votes={}; broadcast(room);
  }
}
// Each round starts with a private, three-prompt writing phase.
function preparePromptPhase(room) {
  room.stage='prompting';room.mode='ready';room.prompt='';
  room.promptAssignments=[];
  room.promptSubmissions=room.players.map(()=>null);
  room.art=room.players.map(()=>null);room.animations=room.players.map(()=>[]);
  room.votes={};room.winner=null;room.winners=[];
  room.remainingMs=room.settings.duration*1000;room.endAt=0;
}
function assignPlayerPrompts(room) {
  const count=room.players.length;
  // A random cyclic derangement: every player receives from a DIFFERENT person,
  // and every prompt author contributes exactly one assigned challenge.
  const offset=crypto.randomInt(1,count);
  room.promptAssignments=room.players.map((_,seat)=>{
    const author=(seat+offset)%count;
    return {author,text:room.promptSubmissions[author][crypto.randomInt(3)]};
  });
  room.stage='battle';room.mode='ready';
}
function resetBattle(room) {
  room.round=1;room.scores=room.players.map(()=>0);room.used=[];room.gallery=[];
  preparePromptPhase(room);
}
function resolveVotes(room) {
  if(room.stage!=='vote')return;
  const tallies=room.players.map(()=>0);
  let everyoneTie=false;
  for(const vote of Object.values(room.votes))if(Number.isInteger(vote) && vote>=0 && vote<tallies.length)tallies[vote]++;
  const max=Math.max(...tallies);
  room.winners=max===0?room.players.map((_,i)=>i):tallies.flatMap((n,i)=>n===max?[i]:[]);
  room.winner=room.winners.length===1?room.winners[0]:'tie';
  room.winners.forEach(i=>room.scores[i]++);
  room.gallery.push({round:room.round,prompt:'Individual player challenges',prompts:room.promptAssignments.map(a=>a.text),authors:room.promptAssignments.map(a=>a.author),winner:room.winner,winners:room.winners.slice(),art:room.art.slice()});
  room.stage='result';room.votes={};
}
function handleAction(room,seat,body,res){
  expireClock(room);
  const a=body.action;
  if(['begin','clock','pause','extra','reroll','finish','reveal','next','rematch'].includes(a)&&seat!==0)return fail(res,403,'Only the room host can do that.');
  if(a==='begin'){
    if(room.stage!=='waiting')return fail(res,409,'The battle already started.');
    if(room.players.length<2)return fail(res,409,'At least two artists must join first.');
    if(!room.players.every(connected))return fail(res,409,'All joined artists need to be connected.');
    resetBattle(room);
  }else if(a==='submitPrompts'){
    if(room.stage!=='prompting')return fail(res,409,'Prompt writing has ended.');
    if(room.promptSubmissions[seat])return fail(res,409,'Your three prompts were already submitted.');
    if(!Array.isArray(body.prompts)||body.prompts.length!==3 ||
       body.prompts.some(x=>typeof x!=='string'))return fail(res,400,'Enter exactly three prompts.');
    const prompts=body.prompts.map(x=>x.trim().replace(/\s+/g,' '));
    if(prompts.some(x=>x.length<4||x.length>90||/[\x00-\x1f\x7f]/.test(x)))return fail(res,400,'Each prompt must be 4–90 characters.');
    if(new Set(prompts.map(x=>x.toLocaleLowerCase())).size!==3)return fail(res,400,'Make all three prompts different.');
    room.promptSubmissions[seat]=prompts;
    if(room.promptSubmissions.every(Boolean))assignPlayerPrompts(room);
  }else if(a==='clock'){
    if(room.stage!=='battle'||!['ready','paused'].includes(room.mode))return fail(res,409,'Cannot start the clock right now.');
    room.mode='drawing';room.endAt=now()+room.remainingMs;
  }else if(a==='pause'){
    if(room.stage!=='battle'||room.mode!=='drawing')return fail(res,409,'Clock is not running.');
    room.remainingMs=Math.max(0,room.endAt-now());room.endAt=0;room.mode='paused';
  }else if(a==='extra'){
    if(room.stage!=='battle'||room.mode==='finished')return fail(res,409,'Not in a drawing round.');
    room.remainingMs+=15000;if(room.mode==='drawing')room.endAt+=15000;
  }else if(a==='reroll'){
    if(room.stage!=='battle'||room.mode!=='ready')return fail(res,409,'Reroll before the timer starts.');
    return fail(res,409,'Prompts are assigned by other players and cannot be rerolled.');
  }else if(a==='finish'){
    if(room.stage!=='battle')return fail(res,409,'Not in a drawing round.');
    room.stage='vote';room.mode='finished';room.endAt=0;room.remainingMs=0;room.votes={};
  }else if(a==='vote'){
    if(room.stage!=='vote')return fail(res,409,'Not voting yet.');
    if(Object.hasOwn(room.votes,seat))return fail(res,409,'You already voted.');
    const vote=body.vote==='tie'?'tie':Number(body.vote);
    if(vote!=='tie'&&(!Number.isInteger(vote)||vote<0||vote>=room.players.length))return fail(res,400,'Invalid vote.');
    room.votes[seat]=vote;
    if(Object.keys(room.votes).length===room.players.length)resolveVotes(room);
  }else if(a==='reveal'){
    if(room.stage!=='vote')return fail(res,409,'Not voting yet.');
    if(Object.keys(room.votes).length===0)return fail(res,409,'At least one person needs to vote first.');
    resolveVotes(room);
  }else if(a==='next'){
    if(room.stage!=='result')return fail(res,409,'Round results are not ready.');
    if(room.round>=room.settings.rounds)room.stage='final';
    else {room.round++;preparePromptPhase(room);}
  }else if(a==='rematch'){
    if(room.stage!=='final')return fail(res,409,'The battle is still in progress.');
    resetBattle(room);
  }else return fail(res,400,'Unknown action.');
  send(res,200,{ok:true});broadcast(room);
}
async function readJson(req,max=700000){
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('Request too large.'),{status:413});chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    return res.end(CLIENT);
  }
  if(req.method==='GET'&&url.pathname==='/healthz')return send(res,200,{ok:true});
  if(req.method==='GET'&&url.pathname==='/api/events'){
    const room=rooms.get(trim(url.searchParams.get('code'),6).toUpperCase());
    const seat=room?seatOf(room,url.searchParams.get('token')):-1;
    if(seat<0)return fail(res,403,'Invalid room or player token.');
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(': connected\n\n');
    const p=room.players[seat];p.streams.add(res);p.disconnectedAt=0;
    event(res,'state',stateFor(room,seat));broadcast(room);
    const keepalive=setInterval(()=>{if(!res.destroyed&&!res.writableEnded)res.write(': ping\n\n');},20000);
    res.on('close',()=>{clearInterval(keepalive);p.streams.delete(res);if(!p.streams.size)p.disconnectedAt=now();broadcast(room);});
    return;
  }
  if(req.method!=='POST'||!url.pathname.startsWith('/api/'))return fail(res,404,'Not found.');
  let body;try{body=await readJson(req,url.pathname==='/api/frames'?2250000:700000);}catch(e){return fail(res,e.status||400,e.message);}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail(res,400,'Expected a JSON object.');
  if(url.pathname==='/api/create'){
    const host=person(body.name||'Player 1');
    const room={code:code(),players:[host],settings:validSettings(body.settings),stage:'waiting',mode:'ready',round:1,
      prompt:'',remainingMs:90000,endAt:0,scores:[0],art:[null],animations:[[]],votes:{},gallery:[],used:[],
      winner:null,winners:[],promptSubmissions:[null],promptAssignments:[],updatedAt:now()};
    rooms.set(room.code,room);return send(res,200,{code:room.code,token:host.token,seat:0});
  }
  const room=rooms.get(trim(body.code,6).toUpperCase());
  if(!room)return fail(res,404,'Room not found. Check the room code.');
  if(url.pathname==='/api/join'){
    let seat=seatOf(room,body.token);
    if(seat<0){
      if(room.stage!=='waiting')return fail(res,409,'This battle already started. Ask the host for the next room.');
      if(room.players.length>=room.settings.maxPlayers)return fail(res,409,'This room is full.');
      seat=room.players.length;room.players.push(person(body.name||`Player ${seat+1}`));
      room.scores.push(0);room.art.push(null);room.animations.push([]);
    }
    broadcast(room);return send(res,200,{code:room.code,token:room.players[seat].token,seat});
  }
  const seat=seatOf(room,body.token);
  if(seat<0)return fail(res,403,'Invalid player token. Rejoin using the room code.');
  if(url.pathname==='/api/action')return handleAction(room,seat,body,res);
  if(url.pathname==='/api/art'){
    expireClock(room);
    if(room.stage!=='battle'||room.mode!=='drawing'||Number(body.round)!==room.round)return fail(res,409,'Drawing is locked.');
    const image=body.image;
    if(typeof image!=='string'||image.length>450000||!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))return fail(res,400,'Invalid image snapshot.');
    room.art[seat]=image;send(res,200,{ok:true});broadcastArt(room,seat,image);return;
  }
  if(url.pathname==='/api/frames'){
    expireClock(room);
    if(room.settings.artMode!=='animation'||!['battle','vote'].includes(room.stage)||Number(body.round)!==room.round)return fail(res,409,'Animation is locked.');
    if(room.stage==='vote'&&Object.keys(room.votes).length)return fail(res,409,'Voting is underway.');
    const frames=body.frames;
    if(!Array.isArray(frames)||!frames.length||frames.length>MAX_FRAMES||
       frames.some(f=>typeof f!=='string'||f.length>200000||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(f))||
       frames.reduce((n,f)=>n+f.length,0)>1900000)return fail(res,400,'Invalid animation frames.');
    room.animations[seat]=frames;room.art[seat]=frames[0];
    send(res,200,{ok:true});broadcast(room);return;
  }
  return fail(res,404,'Unknown endpoint.');
});
setInterval(()=>{
  for(const [key,room] of rooms){
    expireClock(room);
    if(now()-room.updatedAt>2*60*60*1000&&room.players.every(p=>!connected(p)))rooms.delete(key);
  }
},400).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Draw Duel online running on http://localhost:${PORT}`));
module.exports={server,rooms};
