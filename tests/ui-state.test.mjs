import test from 'node:test';
import assert from 'node:assert/strict';
import {controlState, headerState, savedKeyMask} from '../client/ui/state.js';
const configured = {id:'tunnel_saved', has_key:true, managed_process_running:false};
const draft = {id:configured.id,key:''};
test('only persisted, unchanged credentials enable Start; Save remains available', () => {
  for (const [saved, edit, start] of [
    [{}, {id:'',key:''}, false],
    [{id:'tunnel_saved'}, draft, false],
    [configured, draft, true],
    [configured, {...draft,id:'tunnel_unsaved'}, false],
    [configured, {...draft,key:'replacement'}, false],
    [{...configured,id:'invalid'}, {id:'invalid',key:''}, false]
  ]) {
    const controls=controlState(saved,edit);
    assert.equal(controls.canStart,start);
    assert.equal(controls.canSave,true);
  }
});
test('Stop survives dirty credentials; Restart requires saved credentials and an active service', () => {
  const running={...configured,managed_process_running:true};
  assert.equal(controlState(running,draft).canRestart,true);
  assert.equal(controlState(configured,draft).canRestart,false);
  const dirty={...draft,key:'replacement'};
  assert.equal(controlState(running,dirty).canStop,true);
  assert.equal(controlState(running,dirty).canRestart,false);
  assert.equal(controlState({...running,has_key:false},draft).canStop,true);
  assert.equal(controlState(running,draft,'saving').canStop,false);
  assert.equal(controlState(running,draft,'',false).canRestart,false);
});
test('readiness cannot hide unapplied settings, stopped services or unavailable status', () => {
  const ready={...configured,managed_process_running:true,tunnel_ready:true};
  assert.equal(headerState(ready).label,'ready');
  assert.equal(headerState({...ready,restart_required:true}).label,'restartPending');
  assert.equal(headerState({...ready,managed_process_running:false}).label,'stopped');
  assert.equal(headerState(ready,'saving').label,'saving');
  assert.equal(headerState(ready,'',false).label,'unavailable');
  assert.equal(headerState({...ready,tunnel_ready:false}).label,'starting');
  assert.equal(savedKeyMask(true),'****************');
  assert.equal(savedKeyMask(false),'');
});
