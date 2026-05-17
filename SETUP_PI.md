# Zenify — Raspberry Pi Setup Guide

## Prerequisites

- Raspberry Pi with SSH access
- Tailscale already running on the Pi
- Node.js installed on the Pi

### Check Node.js

```bash
node --version
```

If not installed:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

---

## 1. Copy the project to the Pi

From your PC, use `scp` or `rsync` over Tailscale. Replace `<pi>` with your Pi's Tailscale hostname or IP:

```bash
# From your PC, in the zenify directory:
rsync -avz --exclude node_modules --exclude '*.db' . <pi>:~/zenify/
```

Or if you prefer, push to your GitHub repo and clone on the Pi:

```bash
ssh <pi>
git clone https://github.com/<you>/zenify.git ~/zenify
```

---

## 2. Install dependencies on the Pi

```bash
ssh <pi>
cd ~/zenify/backend
npm install
```

---

## 3. Pick a port

Since you already have another server running, make sure port 3000 is free:

```bash
sudo lsof -i :3000
```

If it's taken, pick another port (e.g., 3001). You'll use this port in steps 4 and 5.

---

## 4. Test it

```bash
cd ~/zenify/backend
PORT=3000 node server.js
```

From another device on Tailscale, open `http://<pi-tailscale-ip>:3000` in a browser. You should see the Zenify UI with seeded tasks.

Press `Ctrl+C` to stop once confirmed.

---

## 5. Update the frontend API URL

Edit `frontend/js/config.js` on the Pi:

```bash
nano ~/zenify/frontend/js/config.js
```

Change it to:

```js
const API_BASE = window.ZENIFY_API_BASE || 'http://<pi-tailscale-ip>:3000';
export default API_BASE;
```

Replace `<pi-tailscale-ip>` with your Pi's actual Tailscale IP (find it with `tailscale ip -4`).

---

## 6. Run as a persistent service

Use **systemd** so Zenify starts automatically and survives reboots.

Create the service file:

```bash
sudo nano /etc/systemd/system/zenify.service
```

Paste this (adjust the port if needed):

```ini
[Unit]
Description=Zenify API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/zenify/backend
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> **Note:** Change `User=pi` to your actual username if it's different. Check with `whoami`.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable zenify
sudo systemctl start zenify
```

### Useful commands

```bash
sudo systemctl status zenify    # check if running
sudo journalctl -u zenify -f    # tail logs
sudo systemctl restart zenify   # restart after changes
```

---

## 7. Verify

From your phone or PC (on Tailscale), open:

```
http://<pi-tailscale-ip>:3000
```

You should see Zenify with your seeded tasks. Complete a task on one device, refresh on another — points should sync.

---

## Updating

When you make changes on your PC, you can update the Pi using either **Git** (recommended) or **rsync**.

### Option A: Using Git (Recommended)

Since the active task database (`*.db`) and `node_modules` are ignored in `.gitignore`, you can safely use Git to update the code without touching your task history.

1. **On your PC**: Commit and push your changes to GitHub:
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```

2. **On the Pi**: Pull the updates:
   ```bash
   cd ~/zenify
   git pull
   ```

3. **On the Pi**: Restart the Zenify service to apply the updates:
   ```bash
   sudo systemctl restart zenify
   ```

---

### Option B: Using rsync

If you haven't pushed the repository to GitHub or just want to sync local files directly:

1. **From your PC** (in the `zenify` directory):
   ```bash
   rsync -avz --exclude node_modules --exclude '*.db' --exclude '.git' . puck-server:~/zenify/
   ```

2. **On the Pi**: Restart the service:
   ```bash
   sudo systemctl restart zenify
   ```

