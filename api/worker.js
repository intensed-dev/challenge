const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Secret"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{...cors,"Content-Type":"application/json"}});
const id = () => crypto.randomUUID();
const now = () => Math.floor(Date.now()/1000);
const clean = value => String(value||"").trim();
async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function body(request) { try { return await request.json(); } catch { return {}; } }
function remaining(c) {
  if (!c.started_at) return c.duration;
  const elapsed = c.paused_at ? c.elapsed_before_pause : c.elapsed_before_pause + (now()-c.started_at);
  return Math.max(0,c.duration-elapsed);
}
async function currentChallenge(env, code) {
  if (code) return env.DB.prepare("SELECT * FROM challenges WHERE code=?").bind(code).first();
  return env.DB.prepare("SELECT * FROM challenges ORDER BY created_at DESC LIMIT 1").first();
}
async function playerFrom(request, env) {
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const tokenHash=await hash(token);
  return env.DB.prepare("SELECT * FROM players WHERE token_hash=?").bind(tokenHash).first();
}
async function drawingRows(env, challengeId, playerId=null) {
  const sql = playerId
    ? "SELECT * FROM drawings WHERE challenge_id=? AND player_id=? ORDER BY created_at"
    : "SELECT * FROM drawings WHERE challenge_id=? ORDER BY created_at";
  const q=playerId?env.DB.prepare(sql).bind(challengeId,playerId):env.DB.prepare(sql).bind(challengeId);
  const {results=[]}=await q.all();
  return Promise.all(results.map(async d=>({...d,id:d.id,itemId:d.item_id,itemName:d.item_name,icon:d.icon_url,reviewed:!!d.reviewed,correct:d.correct===null?null:!!d.correct,imageUrl:await signedImage(env,d.image_key)})));
}
async function signedImage(env,key) {
  const obj=await env.DRAWINGS.get(key);
  if(!obj)return "";
  const bytes=await obj.arrayBuffer();
  const type=obj.httpMetadata?.contentType||"image/png";
  return "data:"+type+";base64,"+btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
async function resultData(env, challengeId) {
  const {results:players=[]}=await env.DB.prepare("SELECT id,name FROM players WHERE challenge_id=? ORDER BY created_at").bind(challengeId).all();
  const drawings=await drawingRows(env,challengeId);
  return players.map(p=>{
    const items=drawings.filter(d=>d.player_id===p.id).map(d=>({itemName:d.itemName,itemId:d.itemId,icon:d.icon,quantity:d.quantity,correct:d.correct===null?false:d.correct}));
    const totals=new Map();
    items.filter(i=>i.correct).forEach(i=>{const old=totals.get(i.itemId)||{...i,quantity:0};old.quantity+=i.quantity;totals.set(i.itemId,old);});
    return {playerId:p.id,name:p.name,items,inventory:[...totals.values()]};
  });
}
export default {
 async fetch(request,env) {
  if(request.method==="OPTIONS")return new Response(null,{headers:cors});
  const url=new URL(request.url),path=url.pathname;
  try {
   if(path==="/api/health")return json({ok:true});
   if(path==="/api/join"&&request.method==="POST"){
    const data=await body(request),name=clean(data.name).slice(0,24),code=clean(data.code).toUpperCase();
    if(!name||!code)return json({error:"Name und Teilnahme-Code sind erforderlich."},400);
    const challenge=await currentChallenge(env,code);
    if(!challenge||challenge.phase!=="waiting"&&challenge.phase!=="drawing")return json({error:"Diese Runde nimmt keine Teilnehmer mehr auf."},404);
    const playerId=id(),token=id()+id();
    try{await env.DB.prepare("INSERT INTO players(id,challenge_id,name,token_hash,created_at) VALUES(?,?,?,?,?)").bind(playerId,challenge.id,name,await hash(token),now()).run();}
    catch{return json({error:"Dieser Spielername ist in der Runde bereits vergeben."},409);}
    return json({playerId,name,token});
   }
   if(path==="/api/drawings"&&request.method==="POST"){
    const player=await playerFrom(request,env);if(!player)return json({error:"Bitte erneut beitreten."},401);
    const challenge=await env.DB.prepare("SELECT * FROM challenges WHERE id=?").bind(player.challenge_id).first();
    if(!challenge||challenge.phase!=="drawing"||remaining(challenge)<=0)return json({error:"Die Zeichnungsphase ist nicht aktiv."},403);
    const data=await body(request),itemId=clean(data.itemId).replace(/^minecraft:/,""),itemName=clean(data.itemName),quantity=Number(data.quantity),image=clean(data.image);
    if(!/^[a-z0-9_]+$/.test(itemId)||!itemName||!Number.isInteger(quantity)||quantity<1||quantity>9999||!image)return json({error:"Item, Anzahl und Zeichnung sind erforderlich."},400);
    if(image.length>5_500_000)return json({error:"Die Zeichnung ist zu groß."},413);
    const binary=Uint8Array.from(atob(image),c=>c.charCodeAt(0)),key=challenge.id+"/"+player.id+"/"+id()+".png";
    await env.DRAWINGS.put(key,binary,{httpMetadata:{contentType:"image/png"}});
    await env.DB.prepare("INSERT INTO drawings(id,challenge_id,player_id,item_id,item_name,icon_url,quantity,image_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id(),challenge.id,player.id,itemId,itemName,clean(data.icon),quantity,key,now()).run();
    return json({ok:true});
   }
   if(path==="/api/player"&&request.method==="GET"){
    const player=await playerFrom(request,env);if(!player)return json({error:"Nicht angemeldet."},401);
    const c=await env.DB.prepare("SELECT * FROM challenges WHERE id=?").bind(player.challenge_id).first();
    const drawings=await drawingRows(env,c.id,player.id);
    return json({name:player.name,playerId:player.id,challenge:{phase:c.phase,running:!!c.started_at&&!c.paused_at&&remaining(c)>0,remaining:remaining(c)},drawings,results:c.phase==="results"?await resultData(env,c.id):null});
   }
   if(path==="/api/results"&&request.method==="GET"){
    const c=await currentChallenge(env,clean(url.searchParams.get("code")).toUpperCase());
    if(!c||c.phase!=="results")return json({error:"Die Ergebnisse wurden noch nicht freigegeben."},404);
    const players=await resultData(env,c.id);
    return json({players:players.map(p=>({name:p.name,items:p.items}))});
   }
   if(path.startsWith("/api/admin/")){
    if(!env.ADMIN_SECRET||request.headers.get("X-Admin-Secret")!==env.ADMIN_SECRET)return json({error:"Admin-Code ungültig."},401);
    if(path==="/api/admin/challenge"&&request.method==="POST"){
      const data=await body(request),code=clean(data.code).toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,12)||"PLAY";
      await env.DB.prepare("UPDATE challenges SET phase='closed' WHERE phase!='results'").run();
      const challengeId=id();
      await env.DB.prepare("INSERT INTO challenges(id,code,phase,duration,created_at) VALUES(?,?,'waiting',300,?)").bind(challengeId,code,now()).run();
      return json({ok:true,id:challengeId});
    }
    const challenge=await currentChallenge(env);
    if(!challenge)return json({phase:"waiting",players:[],results:[]});
    if(path==="/api/admin/state"){
      const {results:players=[]}=await env.DB.prepare("SELECT id,name FROM players WHERE challenge_id=? ORDER BY created_at").bind(challenge.id).all();
      const drawings=await drawingRows(env,challenge.id);
      const grouped=players.map(p=>({id:p.id,name:p.name,drawingCount:drawings.filter(d=>d.player_id===p.id).length,drawings:drawings.filter(d=>d.player_id===p.id)}));
      return json({...challenge,remaining:remaining(challenge),players:grouped,results:await resultData(env,challenge.id)});
    }
    if(path==="/api/admin/action"&&request.method==="POST"){
      const data=await body(request);
      if(data.action==="start"){
        if(challenge.phase==="waiting")await env.DB.prepare("UPDATE challenges SET phase='drawing',started_at=?,paused_at=NULL WHERE id=?").bind(now(),challenge.id).run();
        else if(challenge.phase==="drawing"&&challenge.paused_at)await env.DB.prepare("UPDATE challenges SET paused_at=NULL,started_at=? WHERE id=?").bind(now(),challenge.id).run();
      } else if(data.action==="pause"&&challenge.phase==="drawing"&&!challenge.paused_at){
        const elapsed=challenge.elapsed_before_pause+(now()-challenge.started_at);
        await env.DB.prepare("UPDATE challenges SET paused_at=?,elapsed_before_pause=?,started_at=NULL WHERE id=?").bind(now(),elapsed,challenge.id).run();
      } else if(data.action==="finish"){
        await env.DB.prepare("UPDATE challenges SET phase='review' WHERE id=?").bind(challenge.id).run();
      } else if(data.action==="publish"){
        const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM drawings WHERE challenge_id=? AND reviewed=0").bind(challenge.id).first();
        if(pending.n>0)return json({error:"Bewerte zuerst alle Zeichnungen."},409);
        await env.DB.prepare("UPDATE challenges SET phase='results' WHERE id=?").bind(challenge.id).run();
      } else return json({error:"Unbekannte Aktion."},400);
      return json({ok:true});
    }
    if(path==="/api/admin/review"&&request.method==="POST"){
      if(challenge.phase!=="review")return json({error:"Die Bewertungsphase ist noch nicht aktiv."},403);
      const data=await body(request);
      await env.DB.prepare("UPDATE drawings SET reviewed=1,correct=? WHERE id=? AND challenge_id=?").bind(data.correct?1:0,data.drawingId,challenge.id).run();
      return json({ok:true});
    }
   }
   return json({error:"Route nicht gefunden."},404);
  } catch(error) { return json({error:"Serverfehler: "+(error?.message||"unbekannt")},500); }
 }
};