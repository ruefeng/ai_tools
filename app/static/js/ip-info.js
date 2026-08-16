/**
 * 公网IP信息页面脚本：
 *   - 页面加载时 GET /main/api/my-ip 拉取信息渲染
 *   - 刷新按钮重新拉取
 *   - 复制 IP / 复制 JSON
 */
(function () {
    function setText(id, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = (text === null || text === undefined || text === '') ? '—' : String(text);
    }

    function setMsg(text, isError) {
        const el = document.getElementById('ip-info-message');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function updateBadgeType(type) {
        const t = type || 'unknown';
        const label = {
            public: '公网',
            private: '私网',
            loopback: '本地回环',
            link_local: '链路本地',
            multicast: '组播',
            unknown: '未知',
        }[t] || t;
        const chip = document.getElementById('ip-type');
        if (chip) {
            chip.textContent = label;
            chip.classList.add('chip--t-' + t);
        }
    }

    function copyText(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* ignore */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (e) {
            return false;
        }
    }

    async function loadInfo() {
        setText('ip-value', '查询中…');
        setMsg('');
        try {
            const resp = await fetch('/main/api/my-ip', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
            });
            if (!resp.ok) {
                throw new Error('HTTP ' + resp.status);
            }
            const data = await resp.json();
            render(data);
        } catch (err) {
            setText('ip-value', '查询失败');
            setMsg('获取IP信息失败：' + (err && err.message ? err.message : String(err)), true);
        }
    }

    function render(data) {
        const geo = (data && data.geo) || {};
        setText('ip-value', (data && data.ip) || '—');
        updateBadgeType(data && data.type);
        setText('ip-provider', 'provider: ' + ((data && data.provider) || '—'));

        setText('kv-asn', geo.asn !== undefined ? 'AS' + geo.asn : geo.asn_raw || '—');
        setText('kv-isp', geo.isp || '—');
        setText('kv-org', geo.org || '—');
        setText('kv-asdesc', geo.asn_description || '—');

        setText('kv-country', geo.country || '—');
        setText('kv-cc', geo.country_code || '—');
        setText('kv-region', geo.region || '—');
        setText('kv-city', geo.city || '—');
        setText('kv-postal', geo.postal || '—');
        setText('kv-tz', geo.timezone || '—');

        setText('kv-lat', geo.latitude !== undefined && geo.latitude !== null ? geo.latitude : '—');
        setText('kv-lon', geo.longitude !== undefined && geo.longitude !== null ? geo.longitude : '—');

        const jsonEl = document.getElementById('ip-json-text');
        if (jsonEl) {
            try {
                jsonEl.value = JSON.stringify(data, null, 2);
            } catch (e) {
                jsonEl.value = String(data);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        loadInfo();

        const btn = document.getElementById('ip-info-refresh');
        if (btn) btn.addEventListener('click', loadInfo);

        const cp = document.getElementById('ip-copy');
        if (cp) {
            cp.addEventListener('click', function () {
                const ip = (document.getElementById('ip-value') || {}).textContent;
                if (!ip || ip.indexOf('—') === 0 || ip.indexOf('查询') === 0) {
                    setMsg('IP还没查询到', true);
                    return;
                }
                const ok = copyText(ip);
                setMsg(ok ? '已复制 IP：' + ip : '复制失败', !ok && true);
            });
        }

        const jcp = document.getElementById('ip-json-copy');
        const jsonEl = document.getElementById('ip-json-text');
        if (jcp && jsonEl) {
            jcp.addEventListener('click', function () {
                const ok = copyText(jsonEl.value);
                setMsg(ok ? '已复制 JSON' : '复制失败', !ok && true);
            });
        }
    });
})();
