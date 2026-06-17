function splitLineToTokens(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function convertTextToObject(inputText) {
  const lines = inputText.split(/\r?\n/).filter(line => line.trim());

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
    if (!groupedMap[itemKey]) {
      groupedMap[itemKey] = [];
    }
    groupedMap[itemKey].push(item);
  }

  const result = {};
  for (const [itemKey, itemsList] of Object.entries(groupedMap)) {
    result[itemKey] = itemsList.length === 1 ? itemsList[0] : itemsList;
  }

  return result;
}

function convertTextToYaml(inputText) {
  const result = convertTextToObject(inputText);
  if (!result) return { yaml: '', json: '' };

  return {
    yaml: window.jsyaml.dump(result, {
      noRefs: true,
      indent: 2,
    }),
    json: JSON.stringify(result, null, 2),
  };
}

function main() {
  const input = document.getElementById("t2y-input");
  const output = document.getElementById("t2y-output");
  const jsonOutput = document.getElementById("t2y-json-output");
  const btn = document.getElementById("t2y-convert-btn");

  function run() {
    try {
      const { yaml, json } = convertTextToYaml(input.value);
      output.value = yaml;
      jsonOutput.value = json;
    } catch (e) {
      const message = `转换失败：${e && e.message ? e.message : String(e)}`;
      output.value = message;
      jsonOutput.value = message;
    }
  }

  btn.addEventListener("click", run);
  input.addEventListener("input", () => {
    run();
  });
  run();
}

document.addEventListener("DOMContentLoaded", main);
