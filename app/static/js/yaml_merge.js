function mergeYaml(yaml1, yaml2) {
  const merged = {};
  
  // 遍历所有 topKey（来自 yaml1 和 yaml2）
  const allKeys = new Set([...Object.keys(yaml1), ...Object.keys(yaml2)]);
  
  for (const topKey of allKeys) {
    const value1 = yaml1[topKey];
    const value2 = yaml2[topKey];
    
    // 如果两个都有值
    if (value1 !== undefined && value2 !== undefined) {
      // 智能判断：哪个是列表，哪个是属性
      const listData = Array.isArray(value1) ? value1 : (Array.isArray(value2) ? value2 : null);
      const dictData = !Array.isArray(value1) && typeof value1 === 'object' && value1 !== null ? value1 : 
                      (!Array.isArray(value2) && typeof value2 === 'object' && value2 !== null ? value2 : null);
      
      // 如果一个是列表，另一个是字典，合并为属性+links格式
      if (listData !== null && dictData !== null) {
        merged[topKey] = {
          ...dictData,  // 属性数据放顶层
          links: listData  // 列表数据放入 links 字段
        };
      } else {
        // 其他情况，递归合并
        merged[topKey] = mergeValues(value1, value2);
      }
    } else if (value1 !== undefined) {
      merged[topKey] = value1;
    } else {
      merged[topKey] = value2;
    }
  }
  
  return merged;
}

function mergeValues(v1, v2) {
  // 辅助函数：合并两个值
  if (typeof v1 === 'object' && typeof v2 === 'object' && v1 !== null && v2 !== null) {
    if (Array.isArray(v1) && Array.isArray(v2)) {
      return [...v1, ...v2];
    } else if (!Array.isArray(v1) && !Array.isArray(v2)) {
      return mergeYaml(v1, v2);
    }
  }
  // 默认使用第二个值覆盖
  return v2;
}

function main() {
  const yaml1Input = document.getElementById("yaml1-input");
  const yaml2Input = document.getElementById("yaml2-input");
  const output = document.getElementById("yaml-output");
  const jsonOutput = document.getElementById("yaml-json-output");
  const btn = document.getElementById("yaml-merge-btn");

  function run() {
    try {
      const yaml1 = yaml1Input.value.trim() ? window.jsyaml.load(yaml1Input.value) : {};
      const yaml2 = yaml2Input.value.trim() ? window.jsyaml.load(yaml2Input.value) : {};
      const merged = mergeYaml(yaml1, yaml2);

      output.value = window.jsyaml.dump(merged, {
        noRefs: true,
        lineWidth: 120,
        quotingType: '"',
        forceQuotes: false,
        sortKeys: false,
      });
      jsonOutput.value = JSON.stringify(merged, null, 2);
    } catch (e) {
      const message = `合并失败：${e && e.message ? e.message : String(e)}`;
      output.value = message;
      jsonOutput.value = message;
    }
  }

  btn.addEventListener("click", run);
  
  // 监听输入变化，自动合并
  yaml1Input.addEventListener("input", run);
  yaml2Input.addEventListener("input", run);
  
  // 初始运行一次
  run();
}

document.addEventListener("DOMContentLoaded", main);
