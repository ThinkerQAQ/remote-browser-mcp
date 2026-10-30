// Explicit allowlist: an upstream update must not silently expose new powers.
const allowed = new Set([
  'click', 'close_page', 'drag', 'emulate', 'fill', 'fill_form',
  'get_console_message', 'get_css_styles', 'handle_dialog', 'hover',
  'list_console_messages', 'list_pages', 'navigate_page', 'new_page',
  'performance_analyze_insight', 'performance_start_trace',
  'performance_stop_trace', 'press_key', 'resize_page', 'screencast_start',
  'screencast_stop', 'select_page', 'take_screenshot', 'take_snapshot',
  'type_text', 'wait_for'
]);
export function allowedTools(tools, {allowJS = false} = {}) {
  return tools.filter(t => allowed.has(t.name) || (allowJS && t.name === 'evaluate_script'));
}
export function enforceOwnedPage({name, pageId, owned, selectedOwned, selectedPageId, allowExisting}) {
  if (name === 'list_pages' || name === 'new_page') return;
  if (name === 'close_page' && !owned.has(pageId)) throw new Error('Closing a user tab is blocked');
  if (allowExisting) return;
  if (name === 'select_page') {
    if (!owned.has(pageId)) throw new Error('Selecting a user tab is blocked');
    return;
  }
  if (!selectedOwned || !owned.has(selectedPageId)) throw new Error('Create a dedicated background tab first');
  if (!owned.has(pageId)) throw new Error('Accessing a user tab is blocked');
}
export function hideExistingPages(result, owned, allowExisting) {
  if (allowExisting) return result;
  return {...result, content: (result.content || []).map(c => {
    if (c.type !== 'text') return c;
    return {...c, text: c.text.split('\n').map(line => {
      const match = line.match(/^\s*(\d+):/);
      return match && !owned.has(Number(match[1])) ? match[1] + ': [existing tab hidden]' : line;
    }).join('\n')};
  })};
}
