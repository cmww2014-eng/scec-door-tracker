// Door Tracker API (Cloudflare Pages Functions + D1). Every request has already passed Cloudflare Access.
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const ADMIN_ONLY=new Set(["users","overrides"]);
const COLS=new Set(["doors","louvres","defects","requests","photos","users","overrides"]);
async function who(req,env){
  let email=(req.headers.get("cf-access-authenticated-user-email")||"").toLowerCase();
  if(!email&&env.DEV_USER)email=env.DEV_USER.toLowerCase();
  if(!email)return null;
  const owners=(env.ADMIN_EMAILS||"").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  let row=await env.DB.prepare("SELECT email,name,role FROM people WHERE email=?").bind(email).first();
  if(!row){const name=email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    await env.DB.prepare("INSERT INTO people(email,name,role,first_seen) VALUES(?,?,?,?)").bind(email,name,"member",Date.now()).run();row={email,name,role:"member"}}
  const adminDoc=await env.DB.prepare("SELECT data FROM docs WHERE col='users' AND id=? AND deleted=0").bind(email).first();
  let role=owners.includes(email)?"owner":(adminDoc&&JSON.parse(adminDoc.data).role==="admin"?"admin":(row.role==="viewer"?"viewer":"member"));
  return {id:email,email,name:row.name,role};
}
export async function onRequest(ctx){
  const {request:req,env,params}=ctx;const p=[].concat(params.path||[]);const m=req.method;
  const u=await who(req,env);if(!u)return json({error:"Not signed in"},401);
  try{
    if(p[0]==="me")return json(u);
    if(p[0]==="people"){const q=(new URL(req.url).searchParams.get("q")||"").toLowerCase();
      const {results}=await env.DB.prepare("SELECT email,name FROM people").all();const o={};
      for(const r of results)if(!q||r.email.includes(q)||r.name.toLowerCase().includes(q))o[r.email]={id:r.email,email:r.email,name:r.name};return json(o)}
    if(p[0]==="col"&&COLS.has(p[1])){
      const col=p[1],id=p[2];
      if(m==="GET"&&!id){const since=+new URL(req.url).searchParams.get("since")||0;const now=Date.now();
        const {results}=await env.DB.prepare("SELECT id,data,deleted FROM docs WHERE col=? AND updated>?").bind(col,since).all();
        return json({now,docs:results.map(r=>({id:r.id,deleted:!!r.deleted,data:r.deleted?null:JSON.parse(r.data)}))})}
      if(u.role==="viewer")return json({error:"View-only access"},403);
      if(ADMIN_ONLY.has(col)&&!(u.role==="owner"||u.role==="admin"))return json({error:"Admins only"},403);
      if(m==="PUT"&&id){const body=await req.text();if(body.length>900000)return json({error:"Too large"},413);
        // only admins may remove stage-history entries
        if((col==="doors"||col==="louvres")&&!(u.role==="owner"||u.role==="admin")){const old=await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=? AND deleted=0").bind(col,id).first();
          if(old){const oh=(JSON.parse(old.data).hist||[]).length,nh=(JSON.parse(body).hist||[]).length;if(nh<oh&&oh<40)return json({error:"Only admins can delete history"},403)}}
        await env.DB.prepare("INSERT INTO docs(col,id,data,updated,by,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,updated=excluded.updated,by=excluded.by,deleted=0").bind(col,id,body,Date.now(),u.email).run();
        return json({ok:true})}
      if(m==="DELETE"&&id){await env.DB.prepare("UPDATE docs SET deleted=1,updated=?,by=? WHERE col=? AND id=?").bind(Date.now(),u.email,col,id).run();return json({ok:true})}
    }
    if(p[0]==="photo"){
      if(m==="POST"){if(u.role==="viewer")return json({error:"View-only access"},403);
        const buf=await req.arrayBuffer();if(buf.byteLength>1800000)return json({error:"Photo too large"},413);
        const id=crypto.randomUUID().replace(/-/g,"");const u8=new Uint8Array(buf);let bin='';for(let i=0;i<u8.length;i+=32768)bin+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));const b64=btoa(bin);
        await env.DB.prepare("INSERT INTO blobs(id,type,data,created,by) VALUES(?,?,?,?,?)").bind(id,req.headers.get("content-type")||"image/jpeg",b64,Date.now(),u.email).run();
        return json({id})}
      if(m==="GET"&&p[1]){const r=await env.DB.prepare("SELECT type,data FROM blobs WHERE id=?").bind(p[1]).first();if(!r)return new Response("Not found",{status:404});
        const bin=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));return new Response(bin,{headers:{"content-type":r.type,"cache-control":"private, max-age=31536000, immutable"}})}
      if(m==="DELETE"&&p[1]){if(u.role==="viewer")return json({error:"View-only access"},403);await env.DB.prepare("DELETE FROM blobs WHERE id=?").bind(p[1]).run();return json({ok:true})}
    }
    return json({error:"Not found"},404);
  }catch(e){return json({error:String(e&&e.message||e)},500)}
}
