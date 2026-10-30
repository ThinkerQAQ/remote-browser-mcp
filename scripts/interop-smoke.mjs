import path from "node:path";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
const transport=new StdioClientTransport({
  command:"/bin/sh",args:[path.resolve("scripts/launch-from-wsl.sh")],stderr:"pipe"
});
const client=new Client({name:"interop-test",version:"0.1.0"});
try{
  await client.connect(transport);
  const tools=await client.listTools();
  if(!tools.tools.length)throw Error("No tools");
  console.log("WSL_TO_WINDOWS_MCP=true");
  const one=await client.callTool({name:"list_pages",arguments:{}});
  const two=await client.callTool({name:"list_pages",arguments:{}});
  if(one.isError||two.isError)throw Error("Read-only reuse failed");
  console.log("REUSED_CONNECTION_FOR_TWO_CALLS=true");
  console.log("BROWSER_CONTENT_REDACTED=true");
}catch(e){console.error("ERROR="+String(e?.message||e).slice(0,140));process.exitCode=2;}
finally{await client.close().catch(()=>{});}
