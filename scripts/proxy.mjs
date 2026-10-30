import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {CallToolRequestSchema,ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import {settings,upstreamOptions} from "./lib/config.mjs";

let upstream=null, visibleTools=[], selectedOwned=false, selectedPageId=null;
const owned=new Set();
let queue=Promise.resolve();
const blocked=new Set(["get_network_request","list_network_requests","upload_file"]);
if(!settings.allowJS) blocked.add("evaluate_script");
const rawText=r=>(r.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n");
const pageIds=s=>[...s.matchAll(/^\s*(\d+):/gm)].map(m=>+m[1]);

async function attach(){
  if(upstream)return;
  const transport=new StdioClientTransport({...upstreamOptions(),stderr:"pipe"});
  const client=new Client({name:"remote-browser-proxy",version:"0.2.0"});
  try{
    await client.connect(transport);
    const listing=await client.listTools();
    visibleTools=listing.tools.filter(t=>!blocked.has(t.name));
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
function hideExisting(result){
  if(settings.allowExisting)return result;
  return {...result,content:(result.content||[]).map(c=>{
    if(c.type!=="text")return c;
    return {...c,text:c.text.split("\n").map(s=>{
      const m=s.match(/^\s*(\d+):/);
      return m&&!owned.has(+m[1])?m[1]+": [existing tab hidden]":s;
    }).join("\n")};
  })};
}
const server=new Server({name:"remote-browser-mcp",version:"0.2.0"},{
  capabilities:{tools:{}},
  instructions:"Use new_page to open a dedicated background tab. Never activate existing tabs."
});
server.setRequestHandler(ListToolsRequestSchema,async()=>{
  await attach();
  return {tools:visibleTools};
});
async function call(name,params){
  await attach();
  if(!visibleTools.some(t=>t.name===name))throw Error("Tool blocked by safety policy: "+name);
  const args={...params};
  if(name==="new_page"){
    args.background=true;
    const before=pageIds(rawText(await upstream.callTool({name:"list_pages",arguments:{}})));
    const result=await upstream.callTool({name,arguments:args});
    if(result.isError)return hideExisting(result);
    const after=pageIds(rawText(await upstream.callTool({name:"list_pages",arguments:{}})));
    const created=after.filter(id=>!before.includes(id));
    if(created.length!==1)throw Error("Cannot identify new dedicated background tab");
    owned.add(created[0]);selectedOwned=true;selectedPageId=created[0];
    return hideExisting(result);
  }
  if(name==="list_pages")return hideExisting(await upstream.callTool({name,arguments:args}));
  if(name==="select_page"){
    args.bringToFront=false;
    if(!settings.allowExisting&&!owned.has(args.pageId))throw Error("Existing user tabs are protected");
    selectedOwned=owned.has(args.pageId);selectedPageId=args.pageId;
  }else if(name==="close_page"){
    if(!owned.has(args.pageId))throw Error("Closing user tabs is blocked");
  }else if(!settings.allowExisting){
    if(!selectedOwned)throw Error("Create a dedicated background tab first");
    if(args.pageId!==undefined&&!owned.has(args.pageId))throw Error("Accessing existing user tabs is blocked");
    const spec=visibleTools.find(t=>t.name===name);
    if(args.pageId===undefined&&spec?.inputSchema?.properties?.pageId)args.pageId=selectedPageId;
  }
  const result=await upstream.callTool({name,arguments:args});
  if(name==="close_page"&&!result.isError){owned.delete(args.pageId);selectedOwned=false;selectedPageId=null;}
  return hideExisting(result);
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
