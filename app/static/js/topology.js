(function () {
  const STORAGE_KEY = 'topology_graph_state_v1';
  const POSITIONS_KEY = 'topology_node_positions_v1';

  const HEADER_ALIASES = {
    aDevice: ['a端设备', 'a设备', 'a_device', 'adevice', 'local_switch', '本端设备', '源设备', 'from'],
    aPort: ['a端端口', 'a端口', 'a_port', 'aport', 'local_port', '本端端口', '源端口'],
    bDevice: ['b端设备', 'b设备', 'b_device', 'bdevice', 'peer_switch', '对端设备', '目标设备', 'to'],
    bPort: ['b端端口', 'b端口', 'b_port', 'bport', 'peer_port', '对端端口', '目标端口'],
    attr1: ['属性1', 'attr1', 'property1', 'prop1', '链路属性1'],
    attr2: ['属性2', 'attr2', 'property2', 'prop2', '链路属性2'],
    attr3: ['属性3', 'attr3', 'property3', 'prop3', '链路属性3'],
  };

  let links = [];
  let extraNodes = new Set();
  let edgeIdCounter = 1;
  let network = null;
  let nodesDataSet = null;
  let edgesDataSet = null;

  const els = {
    paste: document.getElementById('topology-paste-input'),
    file: document.getElementById('topology-file-input'),
    importBtn: document.getElementById('topology-import-btn'),
    clearDataBtn: document.getElementById('topology-clear-data-btn'),
    nodeName: document.getElementById('topology-node-name'),
    addNodeBtn: document.getElementById('topology-add-node-btn'),
    linkADevice: document.getElementById('topology-link-a-device'),
    linkAPort: document.getElementById('topology-link-a-port'),
    linkBDevice: document.getElementById('topology-link-b-device'),
    linkBPort: document.getElementById('topology-link-b-port'),
    linkAttr1: document.getElementById('topology-link-attr1'),
    linkAttr2: document.getElementById('topology-link-attr2'),
    linkAttr3: document.getElementById('topology-link-attr3'),
    addLinkBtn: document.getElementById('topology-add-link-btn'),
    savePosBtn: document.getElementById('topology-save-pos-btn'),
    loadPosBtn: document.getElementById('topology-load-pos-btn'),
    autoLayoutBtn: document.getElementById('topology-auto-layout-btn'),
    exportJsonBtn: document.getElementById('topology-export-json-btn'),
    importJsonBtn: document.getElementById('topology-import-json-btn'),
    jsonFile: document.getElementById('topology-json-file-input'),
    stats: document.getElementById('topology-stats'),
    status: document.getElementById('topology-status'),
  };

  function normalizeHeader(cell) {
    return String(cell || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  function mapHeaderRow(cells) {
    const map = {};
    const normalized = cells.map(normalizeHeader);
    Object.keys(HEADER_ALIASES).forEach((key) => {
      const idx = normalized.findIndex((h) => HEADER_ALIASES[key].some((alias) => h === alias.replace(/\s+/g, '')));
      if (idx >= 0) map[key] = idx;
    });
    const required = ['aDevice', 'aPort', 'bDevice', 'bPort'];
    if (required.every((k) => map[k] !== undefined)) return map;
    return null;
  }

  function splitRow(line) {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    return line.trim().split(/\s{2,}|\s+/).map((c) => c.trim()).filter((c, i, arr) => {
      if (c !== '') return true;
      return false;
    });
  }

  function rowToLink(cells, headerMap) {
    const pick = (key, fallbackIndex) => {
      const idx = headerMap ? headerMap[key] : fallbackIndex;
      return cells[idx] != null ? String(cells[idx]).trim() : '';
    };
    const link = {
      aDevice: pick('aDevice', 0),
      aPort: pick('aPort', 1),
      bDevice: pick('bDevice', 2),
      bPort: pick('bPort', 3),
      attr1: pick('attr1', 4),
      attr2: pick('attr2', 5),
      attr3: pick('attr3', 6),
    };
    if (!link.aDevice || !link.bDevice) return null;
    return link;
  }

  function parseTextToLinks(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const firstCells = splitRow(lines[0]);
    let headerMap = mapHeaderRow(firstCells);
    let startIndex = headerMap ? 1 : 0;

    if (!headerMap && firstCells.length >= 7) {
      startIndex = 0;
    } else if (!headerMap && firstCells.length < 7) {
      setStatus('数据列不足，需要至少 7 列（A设备、A端口、B设备、B端口、属性1-3）', true);
      return [];
    }

    const result = [];
    for (let i = startIndex; i < lines.length; i++) {
      const cells = splitRow(lines[i]);
      if (cells.length < 4) continue;
      const link = rowToLink(cells, headerMap);
      if (link) result.push(link);
    }
    return result;
  }

  function parseSheetRows(rows) {
    if (!rows || rows.length === 0) return [];
    const text = rows
      .map((row) => row.map((c) => (c == null ? '' : String(c))).join('\t'))
      .join('\n');
    return parseTextToLinks(text);
  }

  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          resolve(parseSheetRows(rows));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function readCsvFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          resolve(parseTextToLinks(text.replace(/,/g, '\t')));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'UTF-8');
    });
  }

  function getAllDeviceNames() {
    const names = new Set(extraNodes);
    links.forEach((l) => {
      names.add(l.aDevice);
      names.add(l.bDevice);
    });
    return names;
  }

  function buildEdgeLabel(link) {
    const parts = [];
    if (link.aPort || link.bPort) parts.push(`${link.aPort || '-'} ↔ ${link.bPort || '-'}`);
    const attrs = [link.attr1, link.attr2, link.attr3].filter(Boolean);
    if (attrs.length) parts.push(attrs.join(' | '));
    return parts.join('\n') || '链路';
  }

  function buildEdgeTitle(link) {
    return [
      `A: ${link.aDevice} / ${link.aPort || '-'}`,
      `B: ${link.bDevice} / ${link.bPort || '-'}`,
      `属性1: ${link.attr1 || '-'}`,
      `属性2: ${link.attr2 || '-'}`,
      `属性3: ${link.attr3 || '-'}`,
    ].join('\n');
  }

  function getSavedPositions() {
    try {
      const raw = localStorage.getItem(POSITIONS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function savePositionsToStorage() {
    if (!network) return;
    const positions = network.getPositions();
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
    setStatus(`已保存 ${Object.keys(positions).length} 个节点位置到本地`);
  }

  function applySavedPositions() {
    const positions = getSavedPositions();
    if (!nodesDataSet || Object.keys(positions).length === 0) {
      setStatus('没有可恢复的本地位置', true);
      return false;
    }
    const updates = [];
    nodesDataSet.forEach((node) => {
      if (positions[node.id]) {
        updates.push({ id: node.id, x: positions[node.id].x, y: positions[node.id].y, fixed: false });
      }
    });
    if (updates.length) nodesDataSet.update(updates);
    if (network) {
      network.setOptions({ physics: { enabled: false } });
      network.fit({ animation: { duration: 400 } });
    }
    setStatus(`已恢复 ${updates.length} 个节点位置`);
    return true;
  }

  function buildVisData() {
    const deviceNames = getAllDeviceNames();
    const savedPos = getSavedPositions();
    const nodes = [];
    let idx = 0;
    const cols = Math.ceil(Math.sqrt(deviceNames.size)) || 1;

    deviceNames.forEach((name) => {
      const pos = savedPos[name];
      const node = {
        id: name,
        label: name,
        shape: 'box',
        margin: 10,
        font: { color: '#e8ecff', size: 13 },
        color: {
          background: '#1e2a4a',
          border: '#6d7cff',
          highlight: { background: '#2a3a66', border: '#22d3ee' },
        },
      };
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      } else {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        node.x = col * 220;
        node.y = row * 140;
      }
      nodes.push(node);
      idx += 1;
    });

    const edges = links.map((link, i) => ({
      id: `edge-${edgeIdCounter + i}`,
      from: link.aDevice,
      to: link.bDevice,
      label: buildEdgeLabel(link),
      title: buildEdgeTitle(link),
      font: { align: 'middle', size: 11, color: '#b8c0e0', strokeWidth: 0 },
      color: { color: '#5a6a9a', highlight: '#22d3ee' },
      smooth: { type: 'curvedCW', roundness: 0.15 },
      arrows: { to: { enabled: false } },
    }));

    edgeIdCounter += links.length;
    return { nodes, edges };
  }

  function updateStats() {
    const nodeCount = getAllDeviceNames().size;
    els.stats.textContent = `节点 ${nodeCount} · 链路 ${links.length}`;
  }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.classList.toggle('topology-status--error', !!isError);
  }

  function initNetwork() {
    const container = document.getElementById('topology-network');
    const visData = buildVisData();
    const hasSavedLayout = Object.keys(getSavedPositions()).length > 0;

    nodesDataSet = new vis.DataSet(visData.nodes);
    edgesDataSet = new vis.DataSet(visData.edges);

    const options = {
      nodes: {
        borderWidth: 2,
        shadow: true,
      },
      edges: {
        width: 2,
        shadow: false,
      },
      interaction: {
        dragNodes: true,
        dragView: true,
        zoomView: true,
        hover: true,
        tooltipDelay: 120,
      },
      physics: {
        enabled: !hasSavedLayout,
        stabilization: { iterations: 120 },
        barnesHut: {
          gravitationalConstant: -3500,
          springLength: 180,
          springConstant: 0.04,
        },
      },
      layout: {
        improvedLayout: true,
      },
    };

    if (network) {
      network.destroy();
    }
    network = new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, options);

    network.on('dragEnd', () => {
      if (network.getOptions().physics.enabled) {
        network.setOptions({ physics: { enabled: false } });
      }
    });

    network.once('stabilizationIterationsDone', () => {
      if (!hasSavedLayout) {
        network.setOptions({ physics: { enabled: false } });
      }
    });

    updateStats();
  }

  function refreshGraph() {
    if (getAllDeviceNames().size === 0) {
      setStatus('没有可显示的节点，请先导入或添加数据', true);
      return;
    }
    initNetwork();
    setStatus('拓扑图已更新');
  }

  function addLink(link) {
    if (!link.aDevice || !link.bDevice) {
      setStatus('A端与B端设备名称不能为空', true);
      return false;
    }
    links.push(link);
    updateStats();
    refreshGraph();
    return true;
  }

  function addNode(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      setStatus('请输入设备名称', true);
      return false;
    }
    extraNodes.add(trimmed);
    updateStats();
    refreshGraph();
    setStatus(`已添加节点：${trimmed}`);
    return true;
  }

  function persistFullState() {
    const state = {
      links,
      extraNodes: Array.from(extraNodes),
      positions: network ? network.getPositions() : getSavedPositions(),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function loadFullState(state) {
    links = Array.isArray(state.links) ? state.links : [];
    extraNodes = new Set(Array.isArray(state.extraNodes) ? state.extraNodes : []);
    if (state.positions) {
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(state.positions));
    }
    edgeIdCounter = links.length + 1;
    if (els.paste && links.length) {
      const header = 'A端设备\tA端端口\tB端设备\tB端端口\t属性1\t属性2\t属性3';
      const rows = links.map(
        (l) =>
          [l.aDevice, l.aPort, l.bDevice, l.bPort, l.attr1, l.attr2, l.attr3]
            .map((v) => v || '')
            .join('\t')
      );
      els.paste.value = [header, ...rows].join('\n');
    }
    updateStats();
    refreshGraph();
  }

  async function handleImport() {
    let imported = [];

    if (els.file.files && els.file.files[0]) {
      const file = els.file.files[0];
      const name = file.name.toLowerCase();
      try {
        if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
          imported = await readCsvFile(file);
        } else {
          imported = await readExcelFile(file);
        }
      } catch (err) {
        setStatus('文件解析失败：' + err.message, true);
        return;
      }
    }

    if (imported.length === 0 && els.paste.value.trim()) {
      imported = parseTextToLinks(els.paste.value);
    }

    if (imported.length === 0) {
      setStatus('未解析到有效链路，请上传文件或粘贴数据', true);
      return;
    }

    links = imported;
    edgeIdCounter = links.length + 1;
    updateStats();
    refreshGraph();
    persistFullState();
    setStatus(`已导入 ${imported.length} 条链路`);
  }

  els.importBtn.addEventListener('click', handleImport);

  els.clearDataBtn.addEventListener('click', () => {
    links = [];
    extraNodes.clear();
    edgeIdCounter = 1;
    if (els.paste) els.paste.value = '';
    if (els.file) els.file.value = '';
    updateStats();
    if (network) {
      network.destroy();
      network = null;
    }
    setStatus('数据已清空');
  });

  els.addNodeBtn.addEventListener('click', () => {
    if (addNode(els.nodeName.value)) {
      els.nodeName.value = '';
      persistFullState();
    }
  });

  els.nodeName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.addNodeBtn.click();
  });

  els.addLinkBtn.addEventListener('click', () => {
    const link = {
      aDevice: els.linkADevice.value.trim(),
      aPort: els.linkAPort.value.trim(),
      bDevice: els.linkBDevice.value.trim(),
      bPort: els.linkBPort.value.trim(),
      attr1: els.linkAttr1.value.trim(),
      attr2: els.linkAttr2.value.trim(),
      attr3: els.linkAttr3.value.trim(),
    };
    if (addLink(link)) {
      els.linkADevice.value = '';
      els.linkAPort.value = '';
      els.linkBDevice.value = '';
      els.linkBPort.value = '';
      els.linkAttr1.value = '';
      els.linkAttr2.value = '';
      els.linkAttr3.value = '';
      persistFullState();
    }
  });

  els.savePosBtn.addEventListener('click', () => {
    savePositionsToStorage();
    persistFullState();
  });

  els.loadPosBtn.addEventListener('click', applySavedPositions);

  els.autoLayoutBtn.addEventListener('click', () => {
    if (!network) return;
    localStorage.removeItem(POSITIONS_KEY);
    network.setOptions({ physics: { enabled: true } });
    network.stabilize(150);
    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
      setStatus('自动布局完成');
    });
  });

  els.exportJsonBtn.addEventListener('click', () => {
    const state = persistFullState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('JSON 已导出');
  });

  els.importJsonBtn.addEventListener('click', () => els.jsonFile.click());

  els.jsonFile.addEventListener('change', () => {
    const file = els.jsonFile.files && els.jsonFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        loadFullState(state);
        persistFullState();
        setStatus('JSON 导入成功');
      } catch (err) {
        setStatus('JSON 解析失败', true);
      }
      els.jsonFile.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  });

  els.file.addEventListener('change', () => {
    if (els.file.files && els.file.files[0]) {
      handleImport();
    }
  });

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      loadFullState(JSON.parse(saved));
      setStatus('已加载上次保存的拓扑数据');
    } else {
      updateStats();
    }
  } catch {
    updateStats();
  }
})();
