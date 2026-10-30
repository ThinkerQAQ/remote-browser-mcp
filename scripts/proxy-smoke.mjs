import path from "node:path";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
const transport=new StdioClientTransport({
  command:process.execPath,
  args:[path.resolve("scripts/proxy.mjs")],
  stderr:"pipe"
});
const client=new Client({name:"proxy-smoke-test",version:"0.1.0"});
const check=(label,v)=>{console.log(label+"="+v);if(!v)throw Error(label+" failed");};
const body=r=>(r.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n");
const ids=s=>[...s.matchAll(/^\s*(\d+):/gm)].map(x=>Number(x[1]));
let created=null;
try{
  await client.connect(transport);
  const list=await client.listTools();
  check("MCP_CONNECTED",list.tools.length>0);
  check("SCRIPT_EVAL_BLOCKED",!list.tools.some(t=>t.name==="evaluate_script"));
  const before=await client.callTool({name:"list_pages",arguments:{}});
  check("EXISTING_PAGES_HIDDEN",!body(before).includes("http"));
  const denied=await client.callTool({name:"select_page",arguments:{pageId:1,bringToFront:true}});
  check("USER_TAB_SELECTION_BLOCKED",denied.isError===true);
  const opened=await client.callTool({name:"new_page",arguments:{url:"about:blank",background:false}});
  check("NEW_BACKGROUND_PAGE_OK",opened.isError!==true);
  const after=await client.callTool({name:"list_pages",arguments:{}});
  const active=ids(body(after)).filter(id=>!ids(body(before)).includes(id));
  check("DEDICATED_TAB_FOUND",active.length===1);
  created=active[0];
  const selected=await client.callTool({name:"select_page",arguments:{pageId:created,bringToFront:true}});
  check("FORCED_NO_BRING_TO_FRONT",selected.isError!==true);
  const snapshot=await client.callTool({name:"take_snapshot",arguments:{}});
  if(snapshot.isError)console.log("SNAPSHOT_ERROR="+body(snapshot).slice(0,200));
  check("SNAPSHOT_OK",snapshot.isError!==true);
}catch(err){console.error("TEST_FAILED="+String(err.message||err).slice(0,180));process.exitCode=2;}
finally{
  if(created!==null){
    try{const closed=await client.callTool({name:"close_page",arguments:{pageId:created}});console.log("TEST_TAB_CLOSED="+(closed.isError!==true));}
    catch{console.log("TEST_TAB_CLOSED=false");}
  }
  await client.close().catch(()=>{});
}
