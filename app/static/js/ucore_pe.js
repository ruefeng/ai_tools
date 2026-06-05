function splitLineToTokens(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function convertExcelToYaml(inputText) {
  const lines = inputText.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) return '';

  // 固定的 key 列表，对应新的数据格式
  // 新格式: local_switch, local_port, local_vpn, local_lagid, local_ipv4, local_ipv6, 
  //        peer_switch, peer_port, peer_vpn, peer_ipv4, peer_ipv6, peer_lagid, type
  const keys = [
    'local_port',
    'local_vpn',
    'local_lagid',
    'local_ipv4',
    'local_ipv6',
    'peer_switch',
    'peer_port',
    'peer_vpn',
    'peer_ipv4',
    'peer_ipv6',
    'peer_lagid',
    'type'
  ];

  const result = {};

  // 从第 2 行开始处理（第一行是表头）
  for (let i = 1; i < lines.length; i++) {
    const values = splitLineToTokens(lines[i]);
    
    if (values.length === 0) continue;
    if (values.length < 13) continue; // 需要至少13列数据
    
    // 第一列作为 top key (local_switch)
    const topKey = values[0];
    const peerKey = values[6]; // peer_switch 作为另一个top key
    
    // 创建原始数据对象 (本端视角)
    const obj = {};
    for (let j = 0; j < keys.length; j++) {
      obj[keys[j]] = values[j + 1] || null;
    }
    
    // 创建交换后的数据对象 (对端视角)
    const swappedObj = {};
    // local_* 变成 peer_*，peer_* 变成 local_*
    swappedObj['local_port'] = values[7];    // local_port <- peer_port
    swappedObj['local_vpn'] = values[8];     // local_vpn <- peer_vpn
    swappedObj['local_lagid'] = values[11];  // local_lagid <- peer_lagid
    swappedObj['local_ipv4'] = values[9];    // local_ipv4 <- peer_ipv4
    swappedObj['local_ipv6'] = values[10];   // local_ipv6 <- peer_ipv6
    swappedObj['peer_switch'] = values[0];   // peer_switch <- local_switch
    swappedObj['peer_port'] = values[1];     // peer_port <- local_port
    swappedObj['peer_vpn'] = values[2];      // peer_vpn <- local_vpn
    swappedObj['peer_ipv4'] = values[4];     // peer_ipv4 <- local_ipv4
    swappedObj['peer_ipv6'] = values[5];     // peer_ipv6 <- local_ipv6
    swappedObj['peer_lagid'] = values[3];    // peer_lagid <- local_lagid
    swappedObj['type'] = values[12];         // type 保持不变
    
    // 添加原始数据到top key
    if (result[topKey]) {
      if (Array.isArray(result[topKey])) {
        result[topKey].push(obj);
      } else {
        result[topKey] = [result[topKey], obj];
      }
    } else {
      result[topKey] = [obj];
    }
    
    // 添加交换后的数据到peer key
    if (result[peerKey]) {
      if (Array.isArray(result[peerKey])) {
        result[peerKey].push(swappedObj);
      } else {
        result[peerKey] = [result[peerKey], swappedObj];
      }
    } else {
      result[peerKey] = [swappedObj];
    }
  }

  // 生成 YAML
  return window.jsyaml.dump(result, {
    noRefs: true,
    indent: 2,
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('ucore-pe-input');
  const yamlOutput = document.getElementById('ucore-pe-yaml-output');
  const convertBtn = document.getElementById('ucore-pe-convert-btn');
  const templateSelect = document.getElementById('ucore-pe-template-select');
  const j2TemplateTextarea = document.getElementById('ucore-pe-j2-template');
  const generateBtn = document.getElementById('ucore-pe-generate-btn');
  const configOutput = document.getElementById('ucore-pe-config-output');

  // Excel 数据转 YAML
  function convertDataToYaml() {
    try {
      yamlOutput.value = convertExcelToYaml(input.value);
    } catch (e) {
      yamlOutput.value = `转换失败：${e && e.message ? e.message : String(e)}`;
    }
  }

  convertBtn.addEventListener('click', convertDataToYaml);

  // 选择模板时加载模板内容
  templateSelect.addEventListener('change', async (event) => {
    const filename = event.target.value;
    if (!filename) {
      j2TemplateTextarea.value = '';
      return;
    }
    
    try {
      const response = await fetch(`/main/get_j2_template/${filename}`);
      const data = await response.json();
      j2TemplateTextarea.value = data.j2_content;
    } catch (error) {
      console.error('获取模板内容失败:', error);
      alert('获取模板内容失败，请检查控制台。');
    }
  });

  // 生成配置
  generateBtn.addEventListener('click', async () => {
    const yamlData = yamlOutput.value;
    const j2Template = j2TemplateTextarea.value;

    if (!yamlData.trim()) {
      alert('请先将 Excel 数据转换为 YAML');
      return;
    }

    if (!j2Template.trim()) {
      alert('请先选择或填写 J2 模板');
      return;
    }

    try {
      // 前端处理数据格式：包装在 devices 下
      const parsedYaml = window.jsyaml.load(yamlData);
      const wrappedYaml = {
        devices: parsedYaml
      };
      const wrappedYamlStr = window.jsyaml.dump(wrappedYaml, {
        noRefs: true,
        indent: 2
      });

      const response = await fetch('/main/generate_config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          yaml_data: wrappedYamlStr,
          j2_template: j2Template
        })
      });

      const result = await response.json();

      if (response.ok) {
        configOutput.value = result.rendered_config;
      } else {
        alert('生成配置失败: ' + result.message);
      }
    } catch (error) {
      console.error('生成配置失败:', error);
      alert('生成配置失败，请检查网络连接或后端服务。');
    }
  });
});
