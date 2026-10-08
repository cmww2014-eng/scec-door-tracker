// Runs before every request (pages, drawings and API). Unapproved users only ever see the access-request page.
import {json,ensureSchema,who,APPROVED} from "../lib/core.js";
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function page(u,status){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCEC Door Tracker – access</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#EEF1F0;color:#17201D;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{background:#fff;border:1px solid #D3DAD7;border-radius:12px;padding:24px;max-width:440px;width:100%}h1{font-size:20px;margin:0 0 6px}p{margin:6px 0 14px;color:#5B6863}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}input,textarea{width:100%;box-sizing:border-box;border:1px solid #D3DAD7;border-radius:8px;padding:10px;font:inherit}
button{margin-top:10px;background:#1F5FA8;color:#fff;border:0;border-radius:8px;padding:10px 16px;font:600 15px system-ui;cursor:pointer}.or{margin:18px 0 6px;border-top:1px solid #D3DAD7;padding-top:14px}
.msg{font-size:14px;margin-top:10px}.ok{color:#2F9E62}.bad{color:#B4232C}</style></head><body><div class="c">
<h1>SCEC Door Tracker</h1>
${status==="rejected"?`<p>Signed in as <b>${esc(u.email)}</b>. Your access request was declined. Contact the tracker owner if this is a mistake.</p>`:`
<p>Signed in as <b>${esc(u.email)}</b>. Access to the tracker needs approval.</p>
${status==="requested"?`<p class="ok">Your request has been sent. Reload this page once an admin has approved you.</p>`:`
<label for="n">Your company and role</label><textarea id="n" rows="2" placeholder="e.g. Morris &amp; Spottiswood – site manager"></textarea>
<button id="r">Request access</button>`}
<div class="or"><label for="k">Have an access code?</label><input id="k" autocomplete="off" placeholder="Enter code"><button id="go">Enter</button></div>`}
<div class="msg" id="m"></div></div>
<script>
const m=document.getElementById('m');const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
const r=document.getElementById('r');if(r)r.onclick=async()=>{r.disabled=true;const x=await post('/api/access/request',{note:document.getElementById('n').value});if(x.ok)location.reload();else{m.className='msg bad';m.textContent=x.error||'Could not send';r.disabled=false}};
const g=document.getElementById('go');if(g)g.onclick=async()=>{const x=await post('/api/access/code',{code:document.getElementById('k').value});if(x.ok){m.className='msg ok';m.textContent='Code accepted – opening the tracker…';setTimeout(()=>location.replace('/'),600)}else{m.className='msg bad';m.textContent=x.error||'Code not recognised'}};
</script></body></html>`}
export async function onRequest(ctx){
  const {request:req,env}=ctx;const url=new URL(req.url);
  await ensureSchema(env);
  const u=await who(req,env);
  if(!u)return new Response("Sign-in required",{status:401});
  if(APPROVED.has(u.role))return ctx.next();
  if(req.method==="POST"&&url.pathname==="/api/access/request"&&u.role==="pending"){
    const b=await req.json().catch(()=>({}));
    await env.DB.prepare("UPDATE people SET requested=?,note=? WHERE email=?").bind(Date.now(),String(b.note||"").slice(0,300),u.email).run();
    return json({ok:true});
  }
  if(req.method==="POST"&&url.pathname==="/api/access/code"&&u.role==="pending"){
    const b=await req.json().catch(()=>({}));
    const s=await env.DB.prepare("SELECT v FROM settings WHERE k='invite_code'").first();
    const code=String(b.code||"").trim().toUpperCase();
    if(s&&s.v&&code&&code===s.v.toUpperCase()){
      await env.DB.prepare("UPDATE people SET role='member',decided_by='access code',decided_at=? WHERE email=?").bind(Date.now(),u.email).run();
      return json({ok:true});
    }
    return json({error:"Code not recognised"},403);
  }
  if(url.pathname.startsWith("/api/"))return json({error:"Awaiting approval",pending:true},403);
  const p=await env.DB.prepare("SELECT requested FROM people WHERE email=?").bind(u.email).first();
  return new Response(page(u,u.role==="rejected"?"rejected":(p&&p.requested?"requested":"new")),{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
