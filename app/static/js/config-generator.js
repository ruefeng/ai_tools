(function () {
    'use strict';

    const modeSelect = document.getElementById('mode-select');
    const secondSelect = document.getElementById('second-select');
    const secondSelectLabel = document.getElementById('second-select-label');
    const yamlTextarea = document.getElementById('yaml-data-textarea');
    const j2Textarea = document.getElementById('j2-template-textarea');
    const scenarioInfo = document.getElementById('scenario-info');
    const modeIndicator = document.getElementById('mode-indicator');
    const generateButton = document.getElementById('generate-button');
    const downloadButton = document.getElementById('download-button');
    const generatedTextarea = document.getElementById('generated-config-textarea');

    let options = { templates: [], scenarios: [] };
    // 当前"生成模式"：single / scenario
    let currentMode = 'single';

    // ------------------------------------------------------------------
    // 更新"当前生成模式"文字提示
    // ------------------------------------------------------------------
    function updateModeIndicator() {
        if (!modeIndicator) return;
        const current = secondSelect.value;
        if (currentMode === 'single') {
            modeIndicator.innerHTML =
                '<strong>当前生成模式：</strong>单一 Jinja2 模板 ' +
                '（使用右侧的 Jinja2 模板渲染左侧 YAML，按 top-key 逐个生成配置）';
        } else {
            const name = current
                ? '（当前示例场景：<code>' + escapeHtml(current) + '</code>）'
                : '（请从上方"选择示例"下拉加载一个场景，以决定各 role 使用哪个模板）';
            modeIndicator.innerHTML =
                '<strong>当前生成模式：</strong>基于 role 的多模板 ' + name +
                '<br>系统会根据每个设备第二层的 <code>role</code> 字段，自动选择对应的 Jinja2 模板，此时右侧的模板内容不会被使用。';
        }
    }

    // ------------------------------------------------------------------
    // 重置第二个下拉（根据当前模式），默认选中第一项并加载示例
    // ------------------------------------------------------------------
    function resetSecondSelect() {
        const list = currentMode === 'single' ? options.templates : options.scenarios;
        secondSelect.innerHTML = '';
        list.forEach(function (name) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            secondSelect.appendChild(opt);
        });
        if (list.length > 0) {
            secondSelect.selectedIndex = 0;
            const first = list[0];
            if (currentMode === 'single') {
                loadTemplateExample(first);
            } else {
                loadScenarioExample(first);
            }
        }
        secondSelectLabel.textContent = currentMode === 'single'
            ? '加载示例（YAML + Jinja2 模板）'
            : '加载示例（场景 YAML）';
    }

    // ------------------------------------------------------------------
    // 加载单模板示例
    // ------------------------------------------------------------------
    async function loadTemplateExample(name) {
        if (!name) return;
        try {
            const resp = await fetch('/main/get_file_content/' + encodeURIComponent(name));
            const data = await resp.json();
            yamlTextarea.value = data.yaml_content || '';
            j2Textarea.value = data.j2_content || '';
            scenarioInfo.style.display = 'none';
            scenarioInfo.innerHTML = '';
            updateModeIndicator();
        } catch (err) {
            console.error(err);
            alert('加载示例模板失败，请查看控制台');
        }
    }

    // ------------------------------------------------------------------
    // 加载场景示例
    // ------------------------------------------------------------------
    async function loadScenarioExample(name) {
        if (!name) return;
        try {
            const resp = await fetch('/main/get_scenario/' + encodeURIComponent(name));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            yamlTextarea.value = data.example_yaml || '';

            const info = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'scenario-info-title';
            title.textContent = '场景: ' + (data.name || name);
            info.appendChild(title);

            if (data.role_templates && Object.keys(data.role_templates).length > 0) {
                const listEl = document.createElement('ul');
                Object.keys(data.role_templates).forEach(function (role) {
                    const tplName = data.role_templates[role];
                    const exists = data.role_template_info
                        ? data.role_template_info[role].template_exists
                        : true;
                    const li = document.createElement('li');
                    li.innerHTML =
                        '<code>role = ' + escapeHtml(role) + '</code> → 使用模板 ' +
                        '<code>' + escapeHtml(tplName) + '.j2</code>' +
                        (exists ? '' : ' <span style="color:#d9534f">(文件未找到)</span>');
                    listEl.appendChild(li);
                });
                info.appendChild(listEl);
            } else {
                const empty = document.createElement('div');
                empty.textContent = '该场景未定义 role 到模板的映射。';
                info.appendChild(empty);
            }

            const hint = document.createElement('div');
            hint.style.marginTop = '6px';
            hint.style.fontSize = '0.92em';
            hint.style.color = '#4b6485';
            hint.innerHTML =
                '提示：当前为"基于 role"模式，生成配置时忽略右侧 Jinja2 模板文本框，改用此场景定义中的模板映射。' +
                '可在左侧自由编辑设备列表（每项需含 <code>role</code>）。';
            info.appendChild(hint);

            scenarioInfo.innerHTML = '';
            scenarioInfo.appendChild(info);
            scenarioInfo.style.display = 'block';
            updateModeIndicator();
        } catch (err) {
            console.error(err);
            alert('加载场景示例失败，请查看控制台');
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    // ------------------------------------------------------------------
    // 构造 payload（scenario_name 以当前下拉选中值为准）
    // ------------------------------------------------------------------
    function buildPayload() {
        const payload = {
            mode: currentMode,
            yaml_data: yamlTextarea.value,
        };
        if (currentMode === 'single') {
            payload.j2_template = j2Textarea.value;
        } else {
            payload.scenario_name = secondSelect.value;
        }
        return payload;
    }

    // ------------------------------------------------------------------
    // 生成配置（错误信息同时写进下方结果框，便于直接排查）
    // ------------------------------------------------------------------
    async function doGenerate() {
        const payload = buildPayload();

        if (!payload.yaml_data || !payload.yaml_data.trim()) {
            setResultError('请先在左侧输入 YAML 数据');
            return;
        }
        if (currentMode === 'single') {
            if (!payload.j2_template || !payload.j2_template.trim()) {
                setResultError('请先在右侧输入 Jinja2 模板，或从上方"选择示例"下拉加载一个模板示例。');
                return;
            }
        } else {
            if (!payload.scenario_name) {
                setResultError('请先从上方"选择示例"下拉加载一个场景（用于决定各 role 使用哪个模板）。');
                return;
            }
        }

        try {
            const resp = await fetch('/main/generate_config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            let data = {};
            try { data = await resp.json(); } catch (_) { /* ignore */ }

            if (!resp.ok) {
                const msg = (data && data.message)
                    ? data.message
                    : ('HTTP ' + resp.status + ' ' + resp.statusText);
                setResultError('生成配置失败: ' + msg);
                return;
            }

            generatedTextarea.value = (data && data.rendered_config) || '';
            downloadButton.disabled = !(data && data.device_configs && data.device_configs.length);
        } catch (err) {
            console.error(err);
            setResultError('生成配置失败，请检查网络或后端服务。详细错误请查看浏览器控制台。');
        }
    }

    function setResultError(msg) {
        generatedTextarea.value = msg;
        downloadButton.disabled = true;
        alert(msg);
    }

    // ------------------------------------------------------------------
    // 下载 ZIP
    // ------------------------------------------------------------------
    async function doDownload() {
        const payload = buildPayload();

        if (!payload.yaml_data || !payload.yaml_data.trim()) {
            alert('请先在左侧输入 YAML 数据');
            return;
        }
        if (currentMode === 'single' && (!payload.j2_template || !payload.j2_template.trim())) {
            alert('请先在右侧输入 Jinja2 模板');
            return;
        }
        if (currentMode === 'scenario' && !payload.scenario_name) {
            alert('请先从上方"选择示例"下拉加载一个场景');
            return;
        }

        try {
            const resp = await fetch('/main/download_config_zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) {
                let msg = 'HTTP ' + resp.status;
                try {
                    const err = await resp.json();
                    if (err && err.message) msg = err.message;
                } catch (_) { /* ignore */ }
                alert('下载失败: ' + msg);
                return;
            }
            const blob = await resp.blob();
            const contentDisp = resp.headers.get('Content-Disposition') || '';
            let filename = 'configs.zip';
            const m = contentDisp.match(/filename="?([^"]+)"?/);
            if (m && m[1]) filename = m[1];

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 0);
        } catch (err) {
            console.error(err);
            alert('下载失败，请查看控制台');
        }
    }

    // ------------------------------------------------------------------
    // 初始化
    // ------------------------------------------------------------------
    async function init() {
        try {
            const resp = await fetch('/main/options');
            options = await resp.json();
        } catch (err) {
            console.error(err);
            options = { templates: [], scenarios: [] };
        }

        resetSecondSelect();
        updateModeIndicator();

        // 第一级：切换模式时重建第二级下拉，不清空用户输入
        if (modeSelect) {
            modeSelect.addEventListener('change', function (e) {
                currentMode = e.target.value;
                if (currentMode !== 'scenario') {
                    scenarioInfo.innerHTML = '';
                    scenarioInfo.style.display = 'none';
                }
                resetSecondSelect();
                updateModeIndicator();
            });
        }

        // 第二级：只做"加载示例内容"
        if (secondSelect) {
            secondSelect.addEventListener('change', function () {
                const val = secondSelect.value;
                if (!val) return;
                if (currentMode === 'single') {
                    loadTemplateExample(val);
                } else {
                    loadScenarioExample(val);
                }
            });
        }

    // ------------------------------------------------------------------
    // 自定义下拉：单行按钮不变，点击时在按钮**下方弹出一个独立面板（10行带滑轨）
    //  - 首次点击与后续点击走同一条代码路径，样式永远一致。
    // ------------------------------------------------------------------
    let activePanel = null;

    function closeActivePanel() {
        if (activePanel && activePanel.parentNode) activePanel.parentNode.removeChild(activePanel);
        if (activePanel && activePanel._trigger) {
            activePanel._trigger.removeAttribute('aria-expanded');
            activePanel._trigger = null;
        }
        activePanel = null;
    }

    function openCustomSelectPanel(triggerEl, onChange) {
        closeActivePanel();

        const panel = document.createElement('div');
        panel.className = 'custom-select-panel';
        panel._trigger = triggerEl;

        const currentValue = String(triggerEl.value);
        for (let i = 0; i < triggerEl.options.length; i++) {
            const opt = triggerEl.options[i];
            const item = document.createElement('div');
            item.className = 'custom-select-option';
            item.textContent = opt.textContent || opt.text;
            item.dataset.value = opt.value;
            if (opt.value === currentValue) item.classList.add('is-selected');
            item.addEventListener('mousedown', function (e) {
                // 防止 blur 提前销毁节点前先处理逻辑
                e.preventDefault();
            });
            item.addEventListener('click', function () {
                triggerEl.value = opt.value;
                closeActivePanel();
                if (typeof onChange === 'function') onChange(opt.value);
                // 派发原生 change，让其他监听也正常工作
                triggerEl.dispatchEvent(new Event('change', { bubbles: true }));
            });
            panel.appendChild(item);
        }

        const wrap = triggerEl.parentNode;
        wrap.appendChild(panel);
        triggerEl.setAttribute('aria-expanded', 'true');
        activePanel = panel;

        // 键盘：聚焦面板中滚动到当前选中项
        const selected = panel.querySelector('.custom-select-option.is-selected');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    function bindCustomSelect(triggerEl, onChange) {
        if (!triggerEl) return;
        // 完全禁用原生下拉（只会走自定义面板）
        triggerEl.addEventListener('mousedown', function (e) {
            e.preventDefault();
            // 若面板已打开，则关闭后重开，保证每次点击的视觉一致
            const isOpen = activePanel && activePanel._trigger === triggerEl;
            if (isOpen) {
                closeActivePanel();
            } else {
                triggerEl.focus();
                openCustomSelectPanel(triggerEl, onChange);
            }
        });
        triggerEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const isOpen = activePanel && activePanel._trigger === triggerEl;
                if (isOpen) closeActivePanel();
                else openCustomSelectPanel(triggerEl, onChange);
            } else if (e.key === 'Escape') {
                closeActivePanel();
            }
        });
        triggerEl.addEventListener('blur', function () {
            // 让点击自定义面板自身时不要立即关的时机由 mousedown 已 preventDefault，
            // 所以这里只是兜底：若没有点到外部时关闭。
            setTimeout(function () {
                if (activePanel && activePanel._trigger === triggerEl) {
                closeActivePanel();
            }
            }, 0);
        });
    }

    // 绑定两个下拉框；second-select 的 onchange 都走自定义面板同一路径
    bindCustomSelect(modeSelect);
    bindCustomSelect(secondSelect);

    // 点击页面其他地方时关闭面板
    document.addEventListener('mousedown', function (e) {
        if (!activePanel) return;
        if (activePanel.contains(e.target)) return;      // 点在面板上
        if (activePanel._trigger === e.target) return;    // 点在按钮上（按钮自己处理
        closeActivePanel();
    });

    if (generateButton) generateButton.addEventListener('click', doGenerate);
    if (downloadButton) downloadButton.addEventListener('click', doDownload);
}

document.addEventListener('DOMContentLoaded', init);
})();
