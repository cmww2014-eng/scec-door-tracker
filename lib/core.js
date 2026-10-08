// Shared helpers for the Door Tracker functions.
export const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
export const APPROVED=new Set(["owner","admin","member","viewer"]);
let ready=false;
export async function ensureSchema(env){
  if(ready)return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS docs(col TEXT NOT NULL,id TEXT NOT NULL,data TEXT,updated INTEGER NOT NULL,by TEXT,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(col,id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS docs_updated ON docs(col,updated)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS people(email TEXT PRIMARY KEY,name TEXT,role TEXT NOT NULL DEFAULT 'pending',first_seen INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS blobs(id TEXT PRIMARY KEY,type TEXT,data TEXT NOT NULL,created INTEGER,by TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT)")]);
  for(const c of ["requested INTEGER","note TEXT","decided_by TEXT","decided_at INTEGER"]){
    try{await env.DB.prepare("ALTER TABLE people ADD COLUMN "+c).run()}catch(e){/* already there */}
  }
  ready=true;
}
const niceName=email=>email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
export function owners(env){return (env.ADMIN_EMAILS||"").toLowerCase().split(/[,;\s]+/).filter(Boolean)}
export async function who(req,env){
  let email=(req.headers.get("cf-access-authenticated-user-email")||"").toLowerCase();
  if(!email&&env.DEV_USER)email=env.DEV_USER.toLowerCase();
  if(!email)return null;
  let row=await env.DB.prepare("SELECT email,name,role FROM people WHERE email=?").bind(email).first();
  if(!row){
    const auto=(env.AUTO_APPROVE||"").toLowerCase().split(/[,;\s]+/).filter(Boolean).some(d=>email.endsWith(d));
    const role=owners(env).includes(email)?"member":(auto?"member":"pending");
    await env.DB.prepare("INSERT INTO people(email,name,role,first_seen) VALUES(?,?,?,?)").bind(email,niceName(email),role,Date.now()).run();
    row={email,name:niceName(email),role};
  }
  let role=row.role;
  if(owners(env).includes(email))role="owner";
  else if(role==="member"){const a=await env.DB.prepare("SELECT data FROM docs WHERE col='users' AND id=? AND deleted=0").bind(email).first();if(a&&JSON.parse(a.data).role==="admin")role="admin"}
  return {id:email,email,name:row.name,role};
}
