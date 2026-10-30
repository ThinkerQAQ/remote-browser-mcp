import assert from 'node:assert/strict';
import test from 'node:test';
import {allowedTools, enforceOwnedPage, hideExistingPages} from '../scripts/lib/policy.mjs';

test('untrusted and sensitive upstream tools default to unavailable', () => {
  const tools = ['click','new_page','list_pages','evaluate_script','upload_file','take_heapsnapshot','list_network_requests','get_network_request','future_privileged_tool'].map(name=>({name}));
  assert.deepEqual(allowedTools(tools).map(x=>x.name),['click','new_page','list_pages']);
  assert.equal(allowedTools(tools,{allowJS:true}).some(x=>x.name==='evaluate_script'),true);
  assert.equal(allowedTools(tools,{allowJS:true}).some(x=>x.name==='take_heapsnapshot'),false);
});

test('user tabs cannot be selected, accessed or closed by default', () => {
  const owned = new Set([8]);
  const common={owned, selectedOwned:true, selectedPageId:8, allowExisting:false};
  for(const name of ['select_page','click','navigate_page','take_snapshot','close_page']) {
    assert.throws(()=>enforceOwnedPage({name, pageId:7, ...common}),/user tab/i);
  }
  for(const name of ['select_page','click','navigate_page','take_snapshot','close_page']) {
    assert.doesNotThrow(()=>enforceOwnedPage({name, pageId:8, ...common}));
  }
});

test('no implicit access via a missing page ID', () => {
  assert.throws(()=>enforceOwnedPage({name:'click', pageId:undefined, owned:new Set([8]), selectedOwned:true, selectedPageId:8, allowExisting:false}),/user tab/i);
  assert.throws(()=>enforceOwnedPage({name:'click', pageId:8, owned:new Set([8]), selectedOwned:false, selectedPageId:8, allowExisting:false}),/dedicated background/i);
});

test('list pages hides user tab titles/URLs without affecting dedicated pages', () => {
  const result={content:[{type:'text',text:'1: https://private.invalid Secret Title\n8: https://example.org Owned\nSelected page: 8'}]};
  const sanitized=hideExistingPages(result,new Set([8]),false);
  assert.equal(sanitized.content[0].text.includes('private.invalid'),false);
  assert.equal(sanitized.content[0].text.includes('https://example.org Owned'),true);
  assert.equal(result.content[0].text.includes('private.invalid'),true);
});
