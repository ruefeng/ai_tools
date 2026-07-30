/**
 * YAML <-> JSON 互转 + 按空白分列的表格文本输入
 *
 * 行为：
 *  - 在 YAML 文本框输入有效 YAML → JSON 框清空并渲染为格式化 JSON
 *  - 在 JSON 文本框输入有效 JSON → YAML 框清空并渲染为格式化 YAML
 *  - 解析错误时在对应输入框下方的 message 区域显示错误文本
 *  - 下方表格文本区域：点击"转换表格"或输入时，也会同时写入 YAML 和 JSON
 */

// ------------------------------
// 工具：把按空白分列的表格文本转成对象
// ------------------------------
function splitLineToTokens(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function convertTextToObject(inputText) {
  const lines = (inputText || '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return null;

  const headers = splitLineToTokens(lines[0]);
  if (headers.length === 0) return null;

  const groupKey = headers[0];
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLineToTokens(lines[i]);
    if (values.length === 0) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || null;
    }
    items.push(obj);
  }

  const groupedMap = {};
  for (const item of items) {
    const itemKey = item[groupKey];
    if (!groupedMap[itemKey]) groupedMap[itemKey] = [];
    groupedMap[itemKey].push(item);
  }

  const result = {};
  for (const [itemKey, itemsList] of Object.entries(groupedMap)) {
    result[itemKey] = itemsList.length === 1 ? itemsList[0] : itemsList;
  }
  return result;
}

// ------------------------------
// 主体：三个输入区域的联动
// ------------------------------
function main() {
  const yamlEl = document.getElementById('t2y-yaml');
  const jsonEl = document.getElementById('t2y-json');
  const inputEl = document.getElementById('t2y-input');
  const btn = document.getElementById('t2y-convert-btn');

  const yamlMsg = document.getElementById('t2y-yaml-msg');
  const jsonMsg = document.getElementById('t2y-json-msg');
  const inputMsg = document.getElementById('t2y-input-msg');

  // 防抖，避免频繁输入时抖动
  const debounce = (fn, ms = 250) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };

  const setMsg = (el, text, isError) => {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  };

  // 写入对象到两个展示框；调用方负责清空/错误提示
  const writeObjToBoth = (obj) => {
    if (obj === null || obj === undefined) {
      yamlEl.value = '';
      jsonEl.value = '';
      return;
    }
    try {
      yamlEl.value = window.jsyaml.dump(obj, { noRefs: true, indent: 2 });
    } catch (e) {
      yamlEl.value = '';
      setMsg(yamlMsg, '写入 YAML 失败：' + (e && e.message ? e.message : String(e)), true);
    }
    try {
      jsonEl.value = JSON.stringify(obj, null, 2);
    } catch (e) {
      jsonEl.value = '';
      setMsg(jsonMsg, '写入 JSON 失败：' + (e && e.message ? e.message : String(e)), true);
    }
  };

  // --- YAML 输入事件：解析 -> 输出到 JSON ---
  const handleYamlInput = debounce(() => {
    const text = yamlEl.value;
    setMsg(yamlMsg, '', false);
    setMsg(jsonMsg, '', false);

    if (!text.trim()) {
      jsonEl.value = '';
      return;
    }
    try {
      const obj = window.jsyaml.load(text);
      if (obj === null || obj === undefined) {
        jsonEl.value = '';
        return;
      }
      jsonEl.value = JSON.stringify(obj, null, 2);
      setMsg(jsonMsg, '已由 YAML 自动生成', false);
      // 保持 YAML 框可编辑，不动它
    } catch (e) {
      // YAML 解析失败：保留用户输入，仅提示
      jsonEl.value = '';
      setMsg(yamlMsg, 'YAML 解析错误：' + (e && e.message ? e.message : String(e)), true);
    }
  });

  // --- JSON 输入事件：解析 -> 输出到 YAML ---
  const handleJsonInput = debounce(() => {
    const text = jsonEl.value;
    setMsg(yamlMsg, '', false);
    setMsg(jsonMsg, '', false);

    if (!text.trim()) {
      yamlEl.value = '';
      return;
    }
    try {
      const obj = JSON.parse(text);
      if (obj === null || obj === undefined) {
        yamlEl.value = '';
        return;
      }
      yamlEl.value = window.jsyaml.dump(obj, { noRefs: true, indent: 2 });
      setMsg(yamlMsg, '已由 JSON 自动生成', false);
    } catch (e) {
      yamlEl.value = '';
      setMsg(jsonMsg, 'JSON 解析错误：' + (e && e.message ? e.message : String(e)), true);
    }
  });

  // --- 表格文本：解析 -> 同时写到两个框 ---
  const handleTableInput = debounce(() => {
    const text = inputEl.value;
    setMsg(inputMsg, '', false);
    if (!text.trim()) {
      yamlEl.value = '';
      jsonEl.value = '';
      return;
    }
    try {
      const obj = convertTextToObject(text);
      if (!obj) {
        yamlEl.value = '';
        jsonEl.value = '';
        return;
      }
      writeObjToBoth(obj);
    } catch (e) {
      setMsg(inputMsg, '转换失败：' + (e && e.message ? e.message : String(e)), true);
    }
  });

  yamlEl.addEventListener('input', handleYamlInput);
  jsonEl.addEventListener('input', handleJsonInput);
  inputEl.addEventListener('input', handleTableInput);
  if (btn) btn.addEventListener('click', handleTableInput);
}

document.addEventListener('DOMContentLoaded', main);
