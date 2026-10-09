/* Cloudflare adapter: provides the same window.claude.use(...) API the tracker was written against,
   backed by /api (Pages Functions + D1). Identity comes from Cloudflare Access. */
(function(){
  const J=(u,o)=>fetch(u,Object.assign({credentials:"same-origin"},o||{})).then(async r=>{if(!r.ok){const e=new Error((await r.text())||r.statusText);e.code=r.status===403?"permission_denied":"http_"+r.status;throw e}return r.headers.get("content-type")?.includes("json")?r.json():r.text()});
  let mePromise=null;const me=()=>mePromise||(mePromise=J("/api/me"));
  const POLL=15000;const cols={};
  function colState(name){
    if(cols[name])return cols[name];
    const st={docs:new Map(),since:0,subs:new Set(),timer:null,busy:false};
    st.refresh=async()=>{if(st.busy)return;st.busy=true;try{const r=await J(`/api/col/${encodeURIComponent(name)}?since=${st.since}`);
        const first=!st.loaded;for(const d of r.docs){if(d.deleted)st.docs.delete(d.id);else st.docs.set(d.id,d.data)}st.since=r.now;st.loaded=true;if(first||r.docs.length)st.emit()}catch(e){st.subs.forEach(s=>s.err&&s.err(e))}finally{st.busy=false}};
    st.emit=()=>{const all=[...st.docs].map(([id,data])=>({id,data:()=>data}));st.subs.forEach(s=>s.cb({docs:s.filter?all.filter(d=>s.filter(d.data())):all}))};
    st.start=()=>{if(!st.timer){st.refresh();st.timer=setInterval(()=>{if(!document.hidden)st.refresh()},POLL)}};
    return cols[name]=st;
  }
  function collection(name,filter){return{
    doc:id=>({
      set:async data=>{await J(`/api/col/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const st=colState(name);st.docs.set(id,data);st.emit()},
      delete:async()=>{await J(`/api/col/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,{method:"DELETE"});const st=colState(name);st.docs.delete(id);st.emit()}
    }),
    where:(f,op,v)=>collection(name,d=>d&&d[f]===v),
    onSnapshot:(cb,err)=>{const st=colState(name);const s={cb,err,filter};st.subs.add(s);st.start();if(st.since)setTimeout(st.emit,0);return()=>st.subs.delete(s)}
  }}
  const caps={
    db:async()=>({collection:n=>collection(n)}),
    user:async()=>{const m=await me();return{
      id:async()=>m.id,me:async()=>({id:m.id,name:m.name,email:m.email,isOwner:m.role==="owner",canEdit:m.role==="owner"||m.role==="admin",avatarUrl:"data:image/svg+xml,"+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' rx='16' fill='%231F5FA8'/><text x='16' y='21' font-size='14' font-family='sans-serif' fill='white' text-anchor='middle'>${(m.name||"?")[0].toUpperCase()}</text></svg>`),color:"#1F5FA8"}),
      isOwner:async()=>m.role==="owner",canEdit:async()=>m.role!=="viewer",can:async c=>c==="data.write"?m.role!=="viewer":null,
      profiles:async ids=>{const r=await J("/api/people");const o={};for(const id of [].concat(ids)){const p=r[id];o[id]={id,name:p?p.name:"",email:p?p.email:null,isMe:id===m.id,guest:false,avatarUrl:"",color:"#888"}}return o},
      search:async q=>{const r=await J("/api/people?q="+encodeURIComponent(q||""));return Object.values(r).map(p=>({id:p.id,name:p.name,email:p.email,isMe:p.id===m.id,guest:false,avatarUrl:"",color:"#888"}))}
    }},
    assets:async()=>({upload:async blob=>{const r=await J("/api/photo",{method:"POST",headers:{"content-type":blob.type||"image/jpeg"},body:blob});return{id:r.id,url:"/api/photo/"+r.id,sizeBytes:blob.size,contentType:blob.type}},
      delete:async id=>J("/api/photo/"+encodeURIComponent(id),{method:"DELETE"})}),
    downloads:async()=>({save:async({filename,data})=>{const b=data instanceof Blob?data:new Blob([data]);const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}})
  };
  window.claude={use:n=>caps[n]?caps[n]().catch(()=>null):Promise.resolve(null)};
  window.__CF__=true;
})();
