#!/bin/bash
set -e

echo "=== TS3 UDP Proxy - Instalacja ==="
echo ""

if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 16 ]]; then
    echo "Instaluje Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "Node.js: $(node -v)"

mkdir -p /opt/ts3proxy
cd /opt/ts3proxy

PROXY_SECRET=$(head -c 16 /dev/urandom | xxd -p)

echo "Pobieranie proxy.js..."
if [ -f "$(dirname "$0")/ts3-udp-proxy.js" ]; then
    cp "$(dirname "$0")/ts3-udp-proxy.js" /opt/ts3proxy/proxy.js
    echo "Skopiowano z lokalnego pliku."
else
    echo "UWAGA: Nie znaleziono ts3-udp-proxy.js obok setup.sh"
    echo "Skopiuj recznie plik proxy/ts3-udp-proxy.js jako /opt/ts3proxy/proxy.js"
    echo "Nastepnie uruchom ponownie: bash setup.sh"
    exit 1
fi

cat > /etc/systemd/system/ts3proxy.service << EOF
[Unit]
Description=TS3 UDP Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ts3proxy
ExecStart=/usr/bin/node /opt/ts3proxy/proxy.js
Environment=PROXY_PORT=9988
Environment=PROXY_SECRET=${PROXY_SECRET}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ts3proxy
systemctl start ts3proxy

sleep 1

IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=== GOTOWE ==="
echo ""
echo "Proxy uruchomione jako serwis systemowy."
echo ""
echo "Wpisz te dane w panelu bota:"
echo "  Adres proxy: ws://${IP}:9988"
echo "  Token proxy: ${PROXY_SECRET}"
echo ""
echo "Komendy:"
echo "  systemctl status ts3proxy   - sprawdz status"
echo "  systemctl restart ts3proxy  - restart"
echo "  journalctl -u ts3proxy -f   - logi na zywo"
echo ""
