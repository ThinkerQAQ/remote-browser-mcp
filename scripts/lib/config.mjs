import fs from "node:fs";
import path from "node:path";
import {parse} from "smol-toml";
import {browserPortPath} from "./browser-profile.mjs";
const file=path.resolve(process.env.REMOTE_BROWSER_CONFIG||"config.toml");
const example=path.resolve("config.example.toml");
const config=parse(fs.readFileSync(fs.existsSync(file)?file:example,"utf8"));
const url=new URL(process.env.CDP_BROWSER_URL||config.browser?.endpoint||"http://127.0.0.1:9222");
if(url.protocol!=="http:"||!["127.0.0.1","localhost"].includes(url.hostname)||url.port!=="9222")
  throw new Error("Only local browser CDP at port 9222 is supported");
export const browserPortFile=browserPortPath({browser:config.browser?.name||"edge",userDataDir:process.env.REMOTE_BROWSER_PROFILE_DIR||config.browser?.user_data_dir});
export const settings={
  allowExisting:config.security?.allow_existing_pages===true,
  allowJS:config.security?.allow_javascript===true
};
export function upstreamOptions(){
  let endpoint="--browser-url="+url.toString();
  const file=browserPortFile;
  if(file&&fs.existsSync(file)){
    const [port,wsPath]=fs.readFileSync(file,"utf8").trim().split(/\r?\n/);
    if(port===url.port&&/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(wsPath||""))
      endpoint="--ws-endpoint=ws://"+url.host+wsPath;
  }
  const dir=path.resolve("node_modules/chrome-devtools-mcp");
  const pkg=JSON.parse(fs.readFileSync(path.join(dir,"package.json"),"utf8"));
  const bin=typeof pkg.bin==="string"?pkg.bin:pkg.bin["chrome-devtools-mcp"];
  return {command:process.execPath,args:[path.join(dir,bin),endpoint,
    "--usage-statistics=false","--performance-crux=false","--redact-network-headers=true"],
    env:{...process.env,CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS:"1"}};
}
