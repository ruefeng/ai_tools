/**
 * IP段扫描页面交互逻辑。
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', init);

    var scanData = null;

    function init() {
        var input = document.getElementById('scan-input');
        var btn = document.getElementById('scan-btn');
        var status = document.getElementById('scan-status');
        var segmentList = document.querySelector('.ip-scan-segment-list');
        var ipList = document.querySelector('.ip-scan-ip-list');
        var template = document.getElementById('segment-item-template');

        if (!input || !btn) {
            console.error('页面元素未找到');
            return;
        }

        btn.addEventListener('click', function () {
            handleScan(input, btn, status, segmentList, ipList, template);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                btn.click();
            }
        });
    }

    function handleScan(input, btn, status, segmentList, ipList, template) {
        var cidr = input.value.trim();
        if (!cidr) {
            showStatus(status, '请输入IP地址段', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = '扫描中...';
        showStatus(status, '正在扫描，请稍候...', 'info');

        document.getElementById('summary-subnet-count').textContent = '0';
        document.getElementById('summary-alive-count').textContent = '0';

        segmentList.innerHTML = '<div class="ip-scan-empty">正在扫描中...</div>';
        ipList.innerHTML = '<div class="ip-scan-empty">扫描完成后点击网段查看</div>';

        var controller = new AbortController();
        var timeoutId = setTimeout(function () {
            controller.abort();
        }, 120000);

        fetch('/main/scan-ip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ cidr: cidr }),
            signal: controller.signal,
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                clearTimeout(timeoutId);
                if (data.error) {
                    showStatus(status, data.error, 'error');
                    segmentList.innerHTML = '<div class="ip-scan-empty">扫描失败</div>';
                    ipList.innerHTML = '<div class="ip-scan-empty">扫描失败</div>';
                    return;
                }
                scanData = data;
                showResult(data, segmentList, ipList, template);
                showStatus(status, '扫描完成，共发现 ' + data.total_alive_count + ' 个存活IP', 'success');
            })
            .catch(function (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    showStatus(status, '扫描超时（超过120秒），请尝试更小的网段', 'error');
                } else {
                    showStatus(status, '扫描失败：' + err.message, 'error');
                }
                segmentList.innerHTML = '<div class="ip-scan-empty">扫描失败</div>';
                ipList.innerHTML = '<div class="ip-scan-empty">扫描失败</div>';
            })
            .finally(function () {
                btn.disabled = false;
                btn.textContent = '开始扫描';
            });
    }

    function showStatus(statusEl, msg, type) {
        statusEl.textContent = msg;
        statusEl.className = 'scan-status scan-status-' + type;
    }

    function showResult(data, segmentList, ipList, template) {
        document.getElementById('summary-subnet-count').textContent = data.subnet_count || '0';
        document.getElementById('summary-alive-count').textContent = data.total_alive_count || '0';

        segmentList.innerHTML = '';
        ipList.innerHTML = '<div class="ip-scan-empty">点击左侧网段查看存活IP</div>';

        var subnets = data.subnets || [];
        for (var i = 0; i < subnets.length; i++) {
            var item = createSegmentItem(subnets[i], template, ipList);
            if (item) segmentList.appendChild(item);
        }

        if (subnets.length === 0) {
            segmentList.innerHTML = '<div class="ip-scan-empty">未找到任何网段</div>';
        }
    }

    function createSegmentItem(subnet, template, ipList) {
        if (!template) return null;
        var clone = template.content.cloneNode(true);
        var item = clone.querySelector('.segment-item');
        if (!item) return null;

        item.dataset.subnet = subnet.subnet;

        var nameEl = clone.querySelector('.segment-item-name');
        var countEl = clone.querySelector('.segment-item-count');

        if (nameEl) nameEl.textContent = subnet.subnet;
        if (countEl) countEl.textContent = subnet.alive_count;

        item.addEventListener('click', function () {
            selectSegment(item, subnet, ipList);
        });

        return item;
    }

    function selectSegment(item, subnet, ipList) {
        var allItems = document.querySelectorAll('.segment-item');
        allItems.forEach(function (el) {
            el.classList.remove('is-selected');
        });
        item.classList.add('is-selected');

        ipList.innerHTML = '';

        var aliveIps = subnet.alive_ips || [];
        if (aliveIps.length > 0) {
            for (var i = 0; i < aliveIps.length; i++) {
                var ip = aliveIps[i];
                var ipItem = document.createElement('div');
                ipItem.className = 'ip-list-item';
                ipItem.textContent = ip;
                ipItem.title = ip + '（点击复制）';
                ipItem.addEventListener('click', function (e) {
                    e.stopPropagation();
                    navigator.clipboard.writeText(this.textContent);
                });
                ipList.appendChild(ipItem);
            }
        } else {
            var emptyTip = document.createElement('div');
            emptyTip.className = 'ip-scan-empty';
            emptyTip.textContent = '未发现存活IP';
            ipList.appendChild(emptyTip);
        }
    }
})();
