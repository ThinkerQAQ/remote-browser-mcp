import {upstreamOptions} from './config.mjs';
import {createVersionProbe} from './cdp-probe.mjs';
const probeVersion = createVersionProbe();

// Only probes the browser version. It does not open tabs or inspect site data.
export async function browserStatus(timeoutMs = 10000) {
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
  return probeVersion(address, timeoutMs);
}
