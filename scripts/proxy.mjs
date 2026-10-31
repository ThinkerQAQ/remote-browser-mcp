import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {CallToolRequestSchema,ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import {settings,upstreamOptions} from "./lib/config.mjs";
import {allowedTools,enforceOwnedPage,hideExistingPages} from "./lib/policy.mjs";
import {browserStatus} from "./lib/status.mjs";
import {discoverTools} from "./lib/discovery.mjs";
import {recordSetupHealth,writeSetupHealth} from "./lib/setup-health.mjs";

let upstream=null, visibleTools=[], selectedOwned=false, selectedPageId=null;
const owned=new Set();
let queue=Promise.resolve();
const rawText=r=>(r.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n");
const pageIds=s=>[...s.matchAll(/^\s*(\d+):/gm)].map(m=>+m[1]);

async function attach(){
  if(upstream)return;
  const transport=new StdioClientTransport({...upstreamOptions(),stderr:"pipe"});
  const client=new Client({name:"remote-browser-proxy",version:"0.3.0"});
  try{
    await client.connect(transport,{timeout:5000});
    const listing=await client.listTools({}, {timeout:5000});
    visibleTools=allowedTools(listing.tools,{allowJS:settings.allowJS});
    upstream=client;
    console.error("Proxy ready; tools="+visibleTools.length);
  }catch(e){await client.close().catch(()=>{});throw e;}
}
async function reset(){
  const old=upstream;
  upstream=null;selectedOwned=false;selectedPageId=null;owned.clear();
  if(old)await old.close().catch(()=>{});
  await attach();
}
const server=new Server({name:"remote-browser-mcp",version:"0.3.0"},{
  capabilities:{tools:{}},
  instructions:"Use new_page to open a dedicated background tab. Never activate existing tabs."
});
server.setRequestHandler(ListToolsRequestSchema,()=>discoverTools(
  async()=>{await attach();return visibleTools;},
  ()=>console.error("Browser upstream unavailable; only browser_status is advertised. Retry tools/list after recovery.")
));
async function call(name,params){
  if(name==="browser_status") {
    const health=await browserStatus();
    try{writeSetupHealth({phase:"finished",cdp_ready:health.cdp_ready===true});}catch{}
    return {content:[{type:"text",text:JSON.stringify({
      ...health,existing_tabs_protected:!settings.allowExisting,
      new_pages_background:true,arbitrary_javascript_enabled:settings.allowJS
    })}]};
  }
  await attach();
  if(!visibleTools.some(t=>t.name===name))throw Error("Tool blocked by safety policy: "+name);
  const args={...params};
  if(name==="new_page"){
    args.background=true;
    const before=pageIds(rawText(await upstream.callTool({name:"list_pages",arguments:{}})));
    const result=await upstream.callTool({name,arguments:args});
    if(result.isError)return hideExistingPages(result,owned,settings.allowExisting);
    const after=pageIds(rawText(await upstream.callTool({name:"list_pages",arguments:{}})));
    const created=after.filter(id=>!before.includes(id));
    if(created.length!==1)throw Error("Cannot identify new dedicated background tab");
    owned.add(created[0]);selectedOwned=true;selectedPageId=created[0];
    return hideExistingPages(result,owned,settings.allowExisting);
  }
  if(name==="list_pages")return hideExistingPages(await upstream.callTool({name,arguments:args}),owned,settings.allowExisting);
  // Required page IDs are always checked; no browser-selected-page fallback.
  const pageId=args.pageId;
  enforceOwnedPage({name,pageId,owned,selectedOwned,selectedPageId,allowExisting:settings.allowExisting});
  if(name==="select_page"){
    args.bringToFront=false;
    selectedOwned=owned.has(pageId);selectedPageId=pageId;
  }
  const result=await upstream.callTool({name,arguments:args});
  if(name==="close_page"&&!result.isError){owned.delete(args.pageId);selectedOwned=false;selectedPageId=null;}
  return hideExistingPages(result,owned,settings.allowExisting);
}
server.setRequestHandler(CallToolRequestSchema,async req=>{
  const work=queue.then(async()=>{
    const {name,arguments:params={}}=req.params;
    try{return await call(name,params);}
    catch(e){
      const message=String(e?.message||e);
      if(name==="list_pages"&&/closed|disconnect|transport|socket/i.test(message)){
        try{await reset();return await call(name,params);}catch{}
      }
      return {content:[{type:"text",text:"Proxy error: "+message.slice(0,180)}],isError:true};
    }
  });
  queue=work.then(()=>{},()=>{});
  return work;
});
await server.connect(new StdioServerTransport());

// Does not delay MCP initialization or create a second browser connection.
recordSetupHealth(browserStatus).catch(()=>console.error("Setup health checkpoint unavailable"));
