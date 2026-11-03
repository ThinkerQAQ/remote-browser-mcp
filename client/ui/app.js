const $=id=>document.getElementById(id);
let busy=false, running=false, loaded=false;
function setBusy(v){busy=v;for(const id of ["save","service","refresh"])$(id).disabled=v;}
function status(data){
 if(!loaded){$("id").value=data.id||"";loaded=true;}
 running=!!data.managed_process_running;
 $("running").textContent=running?"Running":"Stopped";
 $("connection").textContent=data.tunnel_ready?"Connected":running?"Not ready":"Disconnected";
 $("saved").textContent=data.has_key?"A saved API key is available. Leave this field empty to keep it.":"Enter a runtime API key for the first connection.";
 $("service").textContent=running?"Stop Service":"Start Service";
 if(data.error)$("message").textContent=data.error;
}
async function refresh(){
 try{const r=await fetch("/api/status",{cache:"no-store"});if(!r.ok)throw Error("Unable to read status");status(await r.json());}
 catch(e){$("message").textContent=e.message;}
}
async function action(name){
 if(busy)return;setBusy(true);$("message").textContent="";
 try{
  const body={action:name};if(name==="save"){body.id=$("id").value.trim();body.key=$("key").value;}
  const response=await fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json","X-RB-Session":"1"},body:JSON.stringify(body)});
  const payload=await response.json();if(!response.ok)throw Error(payload.error||"Operation failed");
  if(name==="save"){$("key").value="";$("message").textContent="Configuration saved. Restart the service to apply changes.";}else{$("message").textContent=name==="start"?"Service started.":"Service stopped.";}
  status(payload);
 }catch(e){$("message").textContent=e.message;}
 finally{setBusy(false);}
}
$("save").addEventListener("click",()=>action("save"));
$("service").addEventListener("click",()=>action(running?"stop":"start"));
$("refresh").addEventListener("click",refresh);
refresh();
