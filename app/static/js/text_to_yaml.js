function splitLineToTokens(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function convertTextToYaml(inputText) {
  const lines = inputText.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) return '';

  // 第一行作为key
  const headers = splitLineToTokens(lines[0]);
  
  if (headers.length === 0) return '';

  // 第一列的header作为分组的key
  const groupKey = headers[0];

  // 第一步：把每行转换为字典
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLineToTokens(lines[i]);
    
    if (values.length === 0) continue;
    
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = values[j] || null;
      obj[header] = value;
    }
    
    items.push(obj);
  }

  // 第二步：汇总相同第一列值的字典
  const groupedMap = {};
  for (const item of items) {
    const itemKey = item[groupKey];
    if (!groupedMap[itemKey]) {
      groupedMap[itemKey] = [];
    }
    groupedMap[itemKey].push(item);
  }

  // 第三步：生成最终格式：字典（不是列表）
  const result = {};
  for (const [itemKey, itemsList] of Object.entries(groupedMap)) {
    // 如果只有一行数据，直接用字典；如果有多行，用列表
    result[itemKey] = itemsList.length === 1 ? itemsList[0] : itemsList;
  }

  // 生成YAML
  return window.jsyaml.dump(result, {
    noRefs: true,
    indent: 2,
  });
}

function main() {
  const input = document.getElementById("t2y-input");
  const output = document.getElementById("t2y-output");
  const btn = document.getElementById("t2y-convert-btn");

  function run() {
    try {
      output.value = convertTextToYaml(input.value);
    } catch (e) {
      output.value = `转换失败：${e && e.message ? e.message : String(e)}`;
    }
  }

  btn.addEventListener("click", run);
  input.addEventListener("input", () => {
    run();
  });
  run();
}

document.addEventListener("DOMContentLoaded", main);
