import {upstreamOptions} from './config.mjs';

// Only probes the browser version. It does not open tabs or inspect site data.
export async function browserStatus(timeoutMs = 2500) {
  const flag=upstreamOptions().args.find(x=>x.startsWith('--ws-endpoint=')||x.startsWith('--browser-url='));
  if (!flag) return {cdp_ready:false};
  let address=flag.split('=').slice(1).join('=');
  if (flag.startsWith('--browser-url=')) {
    try {
      const response=await fetch(new URL('/json/version', address),{signal:AbortSignal.timeout(timeoutMs)});
      if (!response.ok) return {cdp_ready:false};
      const json=await response.json();
      address=json.webSocketDebuggerUrl;
    } catch {return {cdp_ready:false};}
    if (!address) return {cdp_ready:false};
  }
  return await new Promise(resolve=>{
    let resolved=false;
    let ws;
    const settle=(value)=>{
      if(resolved)return;
      resolved=true;
      clearTimeout(timer);
      try{ws?.close();}catch{}
      resolve({cdp_ready:value});
    };
    const timer=setTimeout(()=>settle(false),timeoutMs);
    try {
      ws=new WebSocket(address);
      ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Browser.getVersion'})));
      ws.addEventListener('message',e=>{
        try{settle(!!JSON.parse(e.data).result?.product);}catch{settle(false);}
      });
      ws.addEventListener('error',()=>settle(false));
      ws.addEventListener('close',()=>settle(false));
    }catch{settle(false);}
  });
}
