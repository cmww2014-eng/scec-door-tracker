// Door Tracker API (Cloudflare Pages Functions + D1). Requests reach here only for approved users (see _middleware.js).
import {json,ensureSchema,who,owners,niceName} from "../../lib/core.js";
const ADMIN_ONLY=new Set(["users","overrides","diffres","prelim"]);
const COLS=new Set(["doors","louvres","defects","requests","photos","users","overrides","thresholds","firedocs","diffres","prelim"]);
const isAdm=u=>u.role==="owner"||u.role==="admin";
export async function onRequest(ctx){
  const {request:req,env,params}=ctx;const p=[].concat(params.path||[]);const m=req.method;
  await ensureSchema(env);
  const u=await who(req,env);if(!u)return json({error:"Not signed in"},401);
  try{
    if(p[0]==="me"){if(m==="PUT"){const b=await req.json().catch(()=>({}));const n=String(b.name||"").trim().slice(0,60);if(n.length<2)return json({error:"Enter your name"},400);
        await env.DB.prepare("UPDATE people SET name=? WHERE email=?").bind(n,u.email).run();return json({...u,name:n})}
      return json({...u,autoName:u.name===niceName(u.email)})}
    if(p[0]==="admin"){
      if(!isAdm(u))return json({error:"Admins only"},403);
      if(p[1]==="people"&&m==="GET"){const {results}=await env.DB.prepare("SELECT email,name,role,first_seen,requested,note,decided_by,decided_at FROM people ORDER BY (role='pending') DESC,requested DESC,email").all();
        const own=owners(env);const adm=new Set((await env.DB.prepare("SELECT id,data FROM docs WHERE col='users' AND deleted=0").all()).results.filter(r=>JSON.parse(r.data).role==="admin").map(r=>r.id));
        return json(results.map(r=>({...r,role:own.includes(r.email)?"owner":(r.role==="member"&&adm.has(r.email)?"admin":r.role)})))}
      if(p[1]==="people"&&p[2]&&m==="PUT"){const email=p[2].toLowerCase();const b=await req.json();if(b.name&&!b.role){const n=String(b.name).trim().slice(0,60);await env.DB.prepare("UPDATE people SET name=? WHERE email=?").bind(n,email).run();return json({ok:true})}const role=b.role;
        if(!["member","viewer","admin","rejected","pending"].includes(role))return json({error:"Bad role"},400);
        if(owners(env).includes(email))return json({error:"Owners are set in the site config"},400);
        await env.DB.prepare("UPDATE people SET role=?,decided_by=?,decided_at=? WHERE email=?").bind(role==="admin"?"member":role,u.email,Date.now(),email).run();
        const now=Date.now();
        if(role==="admin")await env.DB.prepare("INSERT INTO docs(col,id,data,updated,by,deleted) VALUES('users',?,?,?,?,0) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,updated=excluded.updated,by=excluded.by,deleted=0").bind(email,JSON.stringify({role:"admin",by:u.email,at:now}),now,u.email).run();
        else await env.DB.prepare("UPDATE docs SET deleted=1,updated=?,by=? WHERE col='users' AND id=?").bind(now,u.email,email).run();
        return json({ok:true})}
      if(p[1]==="code"){
        if(m==="PUT"){const b=await req.json();const v=b.code===null?null:String(b.code||"").trim().toUpperCase();
          if(v===null||v==="")await env.DB.prepare("DELETE FROM settings WHERE k='invite_code'").run();
          else await env.DB.prepare("INSERT INTO settings(k,v) VALUES('invite_code',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(v).run();}
        const s=await env.DB.prepare("SELECT v FROM settings WHERE k='invite_code'").first();return json({code:s?s.v:null})}
      return json({error:"Not found"},404);
    }
    if(p[0]==="people"){const q=(new URL(req.url).searchParams.get("q")||"").toLowerCase();
      const {results}=await env.DB.prepare("SELECT email,name FROM people WHERE role IN ('member','viewer')").all();const o={};
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
