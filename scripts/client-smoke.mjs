import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const client = new Client({name:'installer-smoke',version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./launch.mjs',import.meta.url))],stderr:'pipe'});
try {
 await client.connect(transport);
 const result = await client.listTools();
 if (!result.tools.some(t => t.name === 'browser_status')) throw new Error('browser_status missing');
 console.log('CLIENT_MCP_HANDSHAKE_PASS');
} finally { await client.close(); }
