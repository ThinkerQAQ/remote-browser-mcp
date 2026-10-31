// One browser-level WebSocket per proxy process. Repeated status calls must not
// create a fresh Edge remote-debugging authorization request each time.
export function createVersionProbe(makeSocket = address => new WebSocket(address)) {
  let socket, endpoint, inFlight, requestId = 0;
  return function probe(address, timeoutMs = 2500) {
    if (endpoint === address && inFlight) return inFlight;
    if (endpoint !== address || !socket || socket.readyState > 1) {
      try { socket?.close(); } catch {}
      endpoint = address;
      try { socket = makeSocket(address); }
      catch { socket = undefined; return Promise.resolve({cdp_ready: false}); }
    }
    const current = socket;
    const request = new Promise(resolve => {
      let settled = false;
      const id = ++requestId;
      const finish = ready => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        current.removeEventListener('open', send);
        current.removeEventListener('message', message);
        current.removeEventListener('error', failed);
        current.removeEventListener('close', failed);
        if (!ready) {
          if (socket === current) socket = undefined;
          try { current.close(); } catch {}
        }
        resolve({cdp_ready: ready});
      };
      const send = () => {
        try { current.send(JSON.stringify({id, method: 'Browser.getVersion'})); }
        catch { finish(false); }
      };
      const message = event => {
        try {
          const response = JSON.parse(event.data);
          if (response.id === id) finish(!!response.result?.product);
        } catch { finish(false); }
      };
      const failed = () => finish(false);
      const timer = setTimeout(failed, timeoutMs);
      current.addEventListener('open', send);
      current.addEventListener('message', message);
      current.addEventListener('error', failed);
      current.addEventListener('close', failed);
      if (current.readyState === 1) send();
    });
    inFlight = request;
    request.finally(() => { if (inFlight === request) inFlight = undefined; });
    return request;
  };
}
