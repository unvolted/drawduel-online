'use strict';
// Draw Duel multiplayer server. No npm dependencies: HTTP + Server-Sent Events.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const CLIENT = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace("$('[data-vote]').forEach(b=>b.disabled=s.voted);", () => "$$('[data-vote]').forEach(b=>b.disabled=s.voted);");
const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PROMPTS = require('./public/prompts.json');
const trim = (s, max = 20) => String(s ?? '').trim().slice(0, max);
function id() { return crypto.randomBytes(24).toString('hex'); }
function code() { let v; do { v = Array.from(crypto.randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(''); } while (rooms.has(v)); return v; }
function validSettings(s) {
  const duration = Number(s?.duration), rounds = Number(s?.rounds), playerCount=Number(s?.playerCount);
  const category = Object.hasOwn(PROMPTS, s?.category) || s?.category === 'all' ? s.category : 'all';
  return { duration: [45,60,90,120,180,300].includes(duration) ? duration : 90,
    rounds: [1,3,5,7,10].includes(rounds) ? rounds : 1, playerCount:Number.isInteger(playerCount)&&playerCount>=2&&playerCount<=6?playerCount:2, category,
    custom: trim(s?.custom, 90) };
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
function stateFor(room,seat){
  const revealed=['vote','result','final'].includes(room.stage);
  return {
    code:room.code,seat,host:seat===0,stage:room.stage,mode:room.mode,
    players:room.players.map(p=>p?{name:p.name,online:connected(p)}:null),
    settings:{...room.settings,custom:'',names:room.players.map((p,i)=>p?.name||'Player '+(i+1))},
    round:room.round,prompt:room.drawPrompts?.[seat]||'',
    promptsReady:room.prompts.map(Boolean),
    drawPrompts:revealed?room.drawPrompts:null,
    remainingMs:room.remainingMs,endAt:room.endAt,
    scores:room.scores,
    art:revealed?room.art:room.art.map((img,i)=>i===seat?img:null),
    winner:room.winner,gallery:room.gallery,voted:Object.hasOwn(room.votes,seat),
    votesCast:Object.keys(room.votes).length
  };
}
function broadcast(room){
  room.updatedAt=Date.now();
  room.players.forEach((p,seat)=>{if(p)for(const res of p.streams)event(res,'state',stateFor(room,seat));});
}
function broadcastArt(room,from,image){
  room.updatedAt=Date.now();
  // Opponents' artwork is intentionally private until the voting reveal.
}
function expireClock(room){
  if(room.stage==='battle'&&room.mode==='drawing'&&Date.now()>=room.endAt){
    room.mode='finished';room.stage='vote';room.remainingMs=0;room.endAt=0;
    broadcast(room);
  }
}
function preparePromptRound(room){
  const n=room.players.length;
  room.stage='prompts';room.mode='ready';room.prompts=Array(n).fill(null);
  room.drawPrompts=Array(n).fill(null);room.prompt='';room.settings.custom='';
  room.art=Array(n).fill(null);room.votes={};room.winner=null;
  room.remainingMs=room.settings.duration*1000;room.endAt=0;
}
function resetBattle(room){
  room.round=1;room.scores=Array(room.players.length).fill(0);
  room.used=[];room.gallery=[];preparePromptRound(room);
}
function handleAction(room,seat,body,res){
  expireClock(room);
  const a=body.action,n=room.players.length;
  const hostOnly=['begin','clock','pause','extra','reroll','finish','next','rematch'];
  if(hostOnly.includes(a)&&seat!==0)return fail(res,403,'Only the room host can do that.');
  if(a==='begin'){
    if(room.stage!=='waiting')return fail(res,409,'The battle already started.');
    if(!room.players.every(connected))return fail(res,409,'All '+n+' artists must be connected first.');
    resetBattle(room);
  }else if(a==='submit_prompt'){
    if(room.stage!=='prompts')return fail(res,409,'Prompts are not being collected right now.');
    if(room.prompts[seat])return fail(res,409,'You already submitted a prompt this round.');
    const submission=trim(body.prompt,90);
    if(!submission)return fail(res,400,'Enter one drawing prompt to continue.');
    if(room.prompts.some(p=>p&&p.toLocaleLowerCase()===submission.toLocaleLowerCase()))
      return fail(res,409,'That prompt was already submitted. Please choose a different one.');
    room.prompts[seat]=submission;
    if(room.prompts.every(Boolean)){
      // Each player draws the NEXT player's prompt, cycling through the room.
      room.drawPrompts=room.prompts.map((_,i)=>room.prompts[(i+1)%n]);
      room.stage='battle';room.mode='ready';
    }
  }else if(a==='clock'){
    if(room.stage!=='battle'||!['ready','paused'].includes(room.mode))return fail(res,409,'Cannot start the clock right now.');
    room.mode='drawing';room.endAt=Date.now()+room.remainingMs;
  }else if(a==='pause'){
    if(room.stage!=='battle'||room.mode!=='drawing')return fail(res,409,'Clock is not running.');
    room.remainingMs=Math.max(0,room.endAt-Date.now());room.endAt=0;room.mode='paused';
  }else if(a==='extra'){
    if(room.stage!=='battle'||room.mode==='finished')return fail(res,409,'Not in a drawing round.');
    room.remainingMs+=15000;if(room.mode==='drawing')room.endAt+=15000;
  }else if(a==='reroll'){
    return fail(res,409,'Each artist receives an opponent-written prompt. Reroll is not available.');
  }else if(a==='finish'){
    if(room.stage!=='battle')return fail(res,409,'Not in a drawing round.');
    room.stage='vote';room.mode='finished';room.endAt=0;room.remainingMs=0;room.votes={};
  }else if(a==='vote'){
    if(room.stage!=='vote')return fail(res,409,'Not voting yet.');
    if(Object.hasOwn(room.votes,seat))return fail(res,409,'You already voted.');
    const vote=body.vote==='tie'?'tie':Number(body.vote);
    if(vote!=='tie'&&(!Number.isInteger(vote)||vote<0||vote>=n))return fail(res,400,'Invalid vote.');
    room.votes[seat]=vote;
    if(Object.keys(room.votes).length===n){
      const counts=Array(n).fill(0);let tieVotes=0;
      for(const v of Object.values(room.votes)){if(v==='tie')tieVotes++;else counts[v]++;}
      const top=Math.max(...counts,tieVotes);
      const leaders=counts.map((v,i)=>v===top?i:-1).filter(i=>i>=0);
      room.winner=tieVotes===top||leaders.length!==1?'tie':leaders[0];
      if(room.winner==='tie')room.scores=room.scores.map(v=>v+1);
      else room.scores[room.winner]++;
      room.gallery.push({round:room.round,prompts:room.drawPrompts.slice(),winner:room.winner,art:room.art.slice()});
      room.stage='result';room.votes={};
    }
  }else if(a==='next'){
    if(room.stage!=='result')return fail(res,409,'Round results are not ready.');
    if(room.round>=room.settings.rounds)room.stage='final';
    else{room.round++;preparePromptRound(room);}
  }else if(a==='rematch'){
    if(room.stage!=='final')return fail(res,409,'The battle is still in progress.');
    resetBattle(room);
  }else return fail(res,400,'Unknown action.');
  send(res,200,{ok:true});broadcast(room);
}
async function readJson(req, max = 700000) {
  let size=0, chunks=[];
  for await (const chunk of req) {size+=chunk.length;if(size>max) throw Object.assign(new Error('Request too large.'),{status:413});chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw Object.assign(new Error('Invalid JSON.'),{status:400});}
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')) {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(CLIENT);
  }
  if (req.method==='GET' && url.pathname==='/healthz') return send(res,200,{ok:true});
  if (req.method==='GET' && url.pathname==='/api/events') {
    const room=rooms.get(trim(url.searchParams.get('code'),6).toUpperCase());
    const seat=room?seatOf(room,url.searchParams.get('token')):-1;
    if (seat<0) return fail(res,403,'Invalid room or player token.');
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(': connected\n\n');
    const p=room.players[seat];p.streams.add(res);p.disconnectedAt=0;
    event(res,'state',stateFor(room,seat));broadcast(room);
    const keepalive=setInterval(()=>{if(!res.destroyed && !res.writableEnded)res.write(': ping\n\n');},20000);
    res.on('close',()=>{clearInterval(keepalive);p.streams.delete(res);if(!p.streams.size)p.disconnectedAt=Date.now();broadcast(room);});
    return;
  }
  if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) return fail(res,404,'Not found.');
  let body;try {body=await readJson(req);} catch(e){return fail(res,e.status||400,e.message);}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res,400,'Expected a JSON object.');
  if (url.pathname==='/api/create') {
    const settings=validSettings(body.settings); settings.custom='';
    const roomCode=code(), host=person(body.name || 'Player 1');
    const n=settings.playerCount;
    const room={code:roomCode,players:[host,...Array(n-1).fill(null)],settings,prompts:Array(n).fill(null),drawPrompts:Array(n).fill(null),stage:'waiting',mode:'ready',round:1,
      prompt:'',remainingMs:settings.duration*1000,endAt:0,scores:Array(n).fill(0),art:Array(n).fill(null),votes:{},gallery:[],used:[],winner:null,updatedAt:Date.now()};
    rooms.set(roomCode,room);return send(res,200,{code:roomCode,token:host.token,seat:0});
  }
  const codeParam=trim(body.code,6).toUpperCase(), room=rooms.get(codeParam);
  if (!room) return fail(res,404,'Room not found. Check the room code.');
  if (url.pathname==='/api/join') {
    let seat=seatOf(room,body.token);
    if(seat<0){
      if(room.stage!=='waiting')return fail(res,409,'The battle has already started. You cannot join now.');
      seat=room.players.findIndex(p=>!p||(!connected(p)&&p.disconnectedAt&&Date.now()-p.disconnectedAt>120000));
      if(seat<0)return fail(res,409,'This room is full ('+room.players.length+' artists).');
      const requested=trim(body.name)||'Player '+(seat+1);
      const existing=room.players.some(p=>p&&p.name.toLocaleLowerCase()===requested.toLocaleLowerCase());
      room.players[seat]=person(existing?'Player '+(seat+1):requested);
    }
    broadcast(room);return send(res,200,{code:room.code,token:room.players[seat].token,seat});
  }
  const seat=seatOf(room,body.token);
  if(seat<0) return fail(res,403,'Invalid player token. Rejoin using the room code.');
  if (url.pathname==='/api/action') return handleAction(room,seat,body,res);
  if (url.pathname==='/api/art') {
    expireClock(room);
    if(room.stage!=='battle' || room.mode!=='drawing' || Number(body.round)!==room.round) return fail(res,409,'Drawing is locked.');
    const image=body.image;
    if(typeof image!=='string' || image.length>450000 || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))return fail(res,400,'Invalid image snapshot.');
    room.art[seat]=image;send(res,200,{ok:true});broadcastArt(room,seat,image);return;
  }
  return fail(res,404,'Unknown endpoint.');
});
setInterval(()=>{
  for (const [key,room] of rooms) {
    expireClock(room);
    if (Date.now()-room.updatedAt>2*60*60*1000 && room.players.every(p=>!connected(p))) rooms.delete(key);
  }
},400).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Draw Duel online running on http://localhost:${PORT}`));
module.exports = { server, rooms };
