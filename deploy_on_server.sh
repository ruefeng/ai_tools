#!/bin/bash
# ai_tools 云主机部署脚本（在云主机上以 ubuntu 用户执行）
# 用法: bash deploy_on_server.sh
set -e

LOG_PREFIX="[DEPLOY]"
log() { echo "$LOG_PREFIX $*"; }

# ─────────────────────────────────────────────
# Step 1: 系统信息
# ─────────────────────────────────────────────
log "========== Step 1: 系统信息 =========="
echo "主机名: $(hostname)"
echo "系统: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"')"
echo "内核: $(uname -r)"
echo "Python: $(python3 --version 2>&1 || echo '未安装')"
echo "当前用户: $(whoami)"
echo ""

# ─────────────────────────────────────────────
# Step 2: 安装系统依赖
# ─────────────────────────────────────────────
log "========== Step 2: 安装系统依赖 =========="
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 python3-venv python3-pip python3-dev \
    nginx curl git iputils-ping build-essential
log "系统依赖安装完成"
echo "Python3: $(python3 --version)"
echo "pip3: $(pip3 --version 2>&1 | head -1)"
echo "Nginx: $(nginx -v 2>&1)"
echo "Git: $(git --version)"
echo "ping: $(ping -V 2>&1 | head -1 || which ping)"
echo ""

# ─────────────────────────────────────────────
# Step 3: 克隆/更新代码
# ─────────────────────────────────────────────
log "========== Step 3: 克隆/更新代码 =========="
APP_DIR="/opt/ai_tools"
REPO_URL="https://github.com/ruefeng/ai_tools.git"

if [ -d "$APP_DIR/.git" ]; then
    log "目录已存在，执行 git pull..."
    sudo chown -R ubuntu:ubuntu "$APP_DIR"
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/main
    log "代码已更新到最新"
else
    log "克隆代码到 $APP_DIR ..."
    sudo rm -rf "$APP_DIR"
    sudo git clone "$REPO_URL" "$APP_DIR"
    sudo chown -R ubuntu:ubuntu "$APP_DIR"
    cd "$APP_DIR"
    log "代码克隆完成"
fi
echo "当前 commit: $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"
echo ""

# ─────────────────────────────────────────────
# Step 4: 创建虚拟环境 + 安装依赖
# ─────────────────────────────────────────────
log "========== Step 4: 创建 venv + 安装依赖 =========="
cd "$APP_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
log "Python 依赖安装完成"
pip list 2>/dev/null | grep -iE "flask|jinja|pyyaml|gunicorn"
echo ""

# ─────────────────────────────────────────────
# Step 5: 配置 instance/config.py
# ─────────────────────────────────────────────
log "========== Step 5: 配置 instance/config.py =========="
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
cat > "$APP_DIR/instance/config.py" <<EOF
import os
import secrets

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    DEBUG = False
    JSON_AS_ASCII = False
    TRUSTED_PROXY_HOPS = 1
    MAX_CONTENT_LENGTH = 20 * 1024 * 1024
EOF
log "config.py 已生成 (SECRET_KEY 长度: ${#SECRET_KEY})"
echo ""

# ─────────────────────────────────────────────
# Step 6: 冒烟测试（直接用 Flask test client）
# ─────────────────────────────────────────────
log "========== Step 6: 代码冒烟测试 =========="
cd "$APP_DIR"
source .venv/bin/activate
python3 -c "
from wsgi import app
with app.test_client() as c:
    routes = ['/', '/main/', '/main/calc', '/main/text-to-yaml',
              '/main/yaml-merge', '/main/ip-scan', '/main/topology',
              '/main/ip-info', '/main/options', '/main/api/my-ip/plain']
    ok = 0
    for path in routes:
        r = c.get(path)
        status = 'OK' if r.status_code == 200 else 'FAIL'
        print(f'  [{status}] GET {path} -> {r.status_code}')
        if r.status_code == 200:
            ok += 1
    print(f'\n  结果: {ok}/{len(routes)} 条路由返回 200')
    if ok != len(routes):
        print('  ERROR: 有路由未返回 200！')
        exit(1)
"
echo ""

# ─────────────────────────────────────────────
# Step 7: 创建 systemd service
# ─────────────────────────────────────────────
log "========== Step 7: 创建 systemd service =========="
sudo mkdir -p /var/log/ai_tools
sudo chown ubuntu:ubuntu /var/log/ai_tools

sudo tee /etc/systemd/system/ai_tools.service > /dev/null <<'UNIT'
[Unit]
Description=ai_tools Flask app (gunicorn)
After=network.target nginx.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/ai_tools
Environment="PATH=/opt/ai_tools/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONUNBUFFERED=1"
ExecStart=/opt/ai_tools/.venv/bin/gunicorn \
    --workers 4 \
    --threads 4 \
    --timeout 120 \
    --graceful-timeout 60 \
    --bind 127.0.0.1:8000 \
    --access-logfile /var/log/ai_tools/access.log \
    --error-logfile  /var/log/ai_tools/error.log  \
    --log-level info \
    wsgi:app
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable ai_tools
sudo systemctl restart ai_tools
sleep 2
log "systemd 服务状态:"
sudo systemctl status ai_tools --no-pager -l | head -15
echo ""

# 验证 gunicorn 本地端口
log "验证 gunicorn 本地端口 127.0.0.1:8000:"
curl -sS -o /dev/null -w "  HTTP %{http_code}\n" http://127.0.0.1:8000/
echo "  my-ip/plain: $(curl -sS http://127.0.0.1:8000/main/api/my-ip/plain)"
echo ""

# ─────────────────────────────────────────────
# Step 8: 配置 Nginx
# ─────────────────────────────────────────────
log "========== Step 8: 配置 Nginx =========="
sudo tee /etc/nginx/sites-available/ai_tools > /dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    client_max_body_size 20M;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml+rss application/xml image/svg+xml font/woff2;

    access_log /var/log/nginx/ai_tools.access.log;
    error_log  /var/log/nginx/ai_tools.error.log;

    location /static/ {
        alias /opt/ai_tools/app/static/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_connect_timeout  30s;
        proxy_send_timeout    180s;
        proxy_read_timeout    180s;
        send_timeout          180s;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Port  $server_port;

        proxy_redirect off;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/ai_tools /etc/nginx/sites-enabled/ai_tools
sudo rm -f /etc/nginx/sites-enabled/default

log "Nginx 配置检查:"
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx 2>/dev/null || true
log "Nginx 已重启"
echo ""

# ─────────────────────────────────────────────
# Step 9: 最终验证
# ─────────────────────────────────────────────
log "========== Step 9: 最终验证 =========="
SERVER_IP=$(curl -sS http://127.0.0.1:8000/main/api/my-ip/plain 2>/dev/null || echo "127.0.0.1")
echo "  公网 IP: $SERVER_IP"
echo ""

log "通过 Nginx (127.0.0.1:80) 访问所有页面:"
for path in "/" "/main/" "/main/calc" "/main/text-to-yaml" "/main/yaml-merge" "/main/ip-scan" "/main/topology" "/main/ip-info" "/main/options" "/main/api/my-ip/plain"; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1$path")
    if [ "$code" = "200" ]; then
        echo "  [OK]   GET $path -> $code"
    else
        echo "  [FAIL] GET $path -> $code"
    fi
done
echo ""

log "========== 部署完成! =========="
echo ""
echo "  访问地址: http://150.158.139.193/"
echo "  公网IP API: http://150.158.139.193/main/api/my-ip/plain"
echo "  公网IP 页面: http://150.158.139.193/main/ip-info"
echo ""
echo "  常用命令:"
echo "    sudo systemctl status ai_tools"
echo "    sudo systemctl restart ai_tools"
echo "    sudo journalctl -u ai_tools -f"
echo "    tail -f /var/log/ai_tools/error.log"
echo "    sudo nginx -t && sudo systemctl reload nginx"
