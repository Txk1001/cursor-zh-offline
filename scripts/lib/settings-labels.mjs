// VS Code derives these headings from configuration keys instead of NLS keys.
// Translate the display getters, leaving keys, values, search input and hover
// identifiers intact. Unknown phrases stay readable in their original form.
export function translateSettingsLabel(value, labels) {
  if (typeof value !== 'string' || !value) return value;
  return value.split(' › ').map(part => Object.hasOwn(labels, part) ? labels[part] : part).join(' › ');
}

const ANCHOR = 'get displayCategory(){return this._displayCategory||this.initLabels(),this._displayCategory}get displayLabel(){return this._displayLabel||this.initLabels(),this._displayLabel}';
const MARKER = '__cursorZhCnSettingsLabel';

export function injectSettingsLabels(source, labels) {
  if (!Object.keys(labels).length || source.includes(MARKER)) return source;
  const count = source.split(ANCHOR).length - 1;
  if (!source.includes('span.setting-item-label') && !count) return source;
  if (count !== 1) throw new Error('设置标题渲染入口已变化，已停止应用；请先核对该版本。');
  for (const [key, value] of Object.entries(labels)) {
    if (!key || typeof value !== 'string' || !value) throw new Error('设置标题词典含无效条目');
  }
  const mapping = JSON.stringify(labels).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const bootstrap = `;(()=>{const labels=${mapping};globalThis.${MARKER}=value=>(${translateSettingsLabel.toString()})(value,labels);})();\n`;
  const patched = ANCHOR.replace('this._displayCategory}get', `globalThis.${MARKER}(this._displayCategory)}get`)
    .replace('this._displayLabel}', `globalThis.${MARKER}(this._displayLabel)}`);
  return bootstrap + source.replace(ANCHOR, patched);
}
