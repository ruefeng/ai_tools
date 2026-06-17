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

  function estimateNodeSize(name) {
    const label = (name || '').toString();
    // 粗略估算：英文 13px 字号每个字符约 7px，中文约 13px；边距 10 * 2
    let charWidth = 0;
    for (const ch of label) {
      charWidth += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? 13 : 7;
    }
    const width = Math.max(80, charWidth + 28);
    const height = 36;
    return { width, height };
  }

  function buildVisData() {
    const deviceNames = getAllDeviceNames();
    const savedPos = getSavedPositions();
    const nodes = [];
    let idx = 0;
    const cols = Math.ceil(Math.sqrt(deviceNames.size)) || 1;

    let maxNodeWidth = 120;
    const sizes = [];
    deviceNames.forEach((name) => {
      const size = estimateNodeSize(name);
      if (size.width > maxNodeWidth) maxNodeWidth = size.width;
      sizes.push(size);
    });

    const gridStepX = Math.max(220, maxNodeWidth + 120);
    const gridStepY = 160;

    let j = 0;
    deviceNames.forEach((name) => {
      const pos = savedPos[name];
      const size = sizes[j];
      const node = {
        id: name,
        label: name,
        shape: 'box',
        margin: 12,
        widthConstraint: { minimum: size.width, maximum: Math.max(size.width, 260) },
        heightConstraint: { minimum: size.height },
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
        node.x = col * gridStepX;
        node.y = row * gridStepY;
      }
      nodes.push(node);
      idx += 1;
      j += 1;
    });

    const pairIndex = {};
    const pairCount = {};
    links.forEach((link) => {
      const pair = [link.aDevice, link.bDevice].sort().join('||');
      pairCount[pair] = (pairCount[pair] || 0) + 1;
    });
    const edges = links.map((link, i) => {
      const pair = [link.aDevice, link.bDevice].sort().join('||');
      const isReversed = pair !== `${link.aDevice}||${link.bDevice}`;
      const total = pairCount[pair] || 1;
      const idx = pairIndex[pair] == null ? 0 : pairIndex[pair];
      pairIndex[pair] = idx + 1;

      let smooth;
      if (total <= 1) {
        smooth = { type: 'continuous', roundness: 0 };
      } else {
        const offset = (idx - (total - 1) / 2);
        const baseRoundness = Math.min(0.55, 0.15 + Math.abs(offset) * 0.15);
        const type = offset < 0 ? 'curvedCCW' : 'curvedCW';
        smooth = { type, roundness: baseRoundness };
      }

      return {
        id: `edge-${edgeIdCounter + i}`,
        from: link.aDevice,
        to: link.bDevice,
        label: buildEdgeLabel(link),
        title: buildEdgeTitle(link),
        font: { align: 'middle', size: 11, color: '#b8c0e0', strokeWidth: 0 },
        color: { color: '#5a6a9a', highlight: '#22d3ee' },
        smooth,
        arrows: { to: { enabled: false } },
      };
    });

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

  function buildPhysicsOptions(hasSavedLayout, nodeList) {
    let maxNodeWidth = 120;
    nodeList.forEach((n) => {
      if (n && n.widthConstraint && n.widthConstraint.minimum) {
        if (n.widthConstraint.minimum > maxNodeWidth) maxNodeWidth = n.widthConstraint.minimum;
      }
    });
    const nodeCount = nodeList.length;
    const springLength = Math.max(220, maxNodeWidth + 170);
    const gravitationalConstant = -1 * Math.max(1600, 1200 + nodeCount * 60 + maxNodeWidth * 4);
    const centralGravity = 0.15;
    const iterations = Math.min(600, 150 + nodeCount * 5);
    return {
      enabled: !hasSavedLayout,
      stabilization: { iterations, updateInterval: 50, fit: false },
      barnesHut: {
        gravitationalConstant,
        centralGravity,
        springLength,
        springConstant: 0.05,
        avoidOverlap: 0.4,
        damping: 0.12,
      },
    };
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
      physics: buildPhysicsOptions(hasSavedLayout, visData.nodes),
      layout: {
        improvedLayout: true,
      },
    };

    if (network) {
      network.destroy();
    }
    network = new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, options);

    // 注意：不要再在 dragStart / dragEnd 中调用 network.setOptions 或
    // nodesDataSet.update，这会破坏 vis-network 内部的拖动状态机，
    // 导致"节点拖不动 / 松手后还在拖 / 需要双击才能结束拖动"的问题。
    // 让 vis-network 自己管理节点 / 视图的拖动行为。

    // 初始布局稳定后自动关闭物理引擎，让节点停住。
    network.once('stabilizationIterationsDone', () => {
      if (network && network.getOptions().physics.enabled) {
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

  function isLinkLike(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const has = (k) => Object.prototype.hasOwnProperty.call(obj, k);
    return (has('aDevice') && has('bDevice')) || (has('source') && has('target'));
  }

  function normalizeLink(obj) {
    return {
      aDevice: (obj.aDevice || obj.source || '').toString(),
      aPort: (obj.aPort || obj.sourcePort || '').toString(),
      bDevice: (obj.bDevice || obj.target || '').toString(),
      bPort: (obj.bPort || obj.targetPort || '').toString(),
      attr1: (obj.attr1 || obj.attr_1 || '').toString(),
      attr2: (obj.attr2 || obj.attr_2 || '').toString(),
      attr3: (obj.attr3 || obj.attr_3 || '').toString(),
    };
  }

  function extractLinksFromJson(state) {
    // 1) 本页面自己导出的格式：{ links: [...], extraNodes: [...], positions: {...} }
    if (Array.isArray(state.links) && state.links.every(isLinkLike)) {
      return state.links.map(normalizeLink);
    }
    // 2) 数组本身就是链路
    if (Array.isArray(state) && state.every(isLinkLike)) {
      return state.map(normalizeLink);
    }
    // 3) 外部常见格式：{ result: [...] } / { data: [...] } / { links: [...] }
    const candidates = [state.result, state.data, state.links, state.records, state.items];
    for (const list of candidates) {
      if (Array.isArray(list) && list.every(isLinkLike)) {
        return list.map(normalizeLink);
      }
    }
    // 4) 单层对象也可能是一条链路
    if (isLinkLike(state)) {
      return [normalizeLink(state)];
    }
    return null;
  }

  function loadFullState(state) {
    const recognized = extractLinksFromJson(state);
    if (recognized) {
      links = recognized;
    } else {
      links = [];
    }
    const extraList = Array.isArray(state.extraNodes) ? state.extraNodes : [];
    extraNodes = new Set(extraList.filter((n) => typeof n === 'string' && n));
    const hasPositions =
      state.positions && typeof state.positions === 'object' && Object.keys(state.positions).length > 0;
    if (hasPositions) {
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(state.positions));
    } else {
      localStorage.removeItem(POSITIONS_KEY);
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
    if (!recognized) {
      setStatus('JSON 已解析，但没有识别到可用的链路字段', true);
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
    if (nodesDataSet) {
      // 解除手动拖动导致的 fixed，允许自动布局重新排布
      const reset = [];
      nodesDataSet.forEach((n) => {
        if (n && n.fixed && (n.fixed.x || n.fixed.y)) {
          reset.push({ id: n.id, fixed: { x: false, y: false } });
        }
      });
      if (reset.length) nodesDataSet.update(reset);
    }
    network.setOptions({ physics: { enabled: true } });
    network.stabilize(200);
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
