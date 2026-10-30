const fs = require('fs');
const http = require('http');

async function getAuthToken() {
  const res = await fetch('http://localhost:5254/api/Auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'learner1@jcap.com', password: 'Learner@123!' })
  });
  const data = await res.json();
  if (!data.success) throw new Error('Login failed: ' + data.message);
  return {
    token: data.data.token,
    user: JSON.stringify(data.data)
  };
}

async function run() {
  const targetUrl = process.argv[2] || 'http://localhost:5173/scenarios';
  const outputPath = process.argv[3] || 'screenshot.png';

  const auth = await getAuthToken();
  console.log('Got auth token for', JSON.parse(auth.user).email);

  // 1. Get targets from Chrome remote debugging
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  if (!pageTarget) throw new Error('No page target found on port 9222');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    callbacks.set(msgId, (msg) => {
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.onopen = r);

  await send('Page.enable');
  await send('DOM.enable');

  // Navigate to target origin first to set localStorage
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await new Promise(r => setTimeout(r, 1500));

  // Set localStorage
  const setStorageScript = `
    localStorage.setItem('jcap_token', ${JSON.stringify(auth.token)});
    localStorage.setItem('jcap_user', ${JSON.stringify(auth.user)});
    localStorage.setItem('jcap_level', 'N5');
  `;
  await send('Runtime.evaluate', { expression: setStorageScript });

  // Navigate to actual target
  console.log('Navigating to', targetUrl);
  await send('Page.navigate', { url: targetUrl });
  await new Promise(r => setTimeout(r, 4000));

  // If a clickSelector is provided as 4th arg, click it
  const clickSelector = process.argv[4];
  if (clickSelector) {
    console.log('Clicking selector:', clickSelector);
    await send('Runtime.evaluate', {
      expression: `
        const el = document.querySelector('${clickSelector}');
        if (el) { el.click(); true; } else { false; }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
  }

  // Take screenshot
  const screenshotRes = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });

  fs.writeFileSync(outputPath, Buffer.from(screenshotRes.data, 'base64'));
  console.log('Screenshot saved to', outputPath);

  ws.close();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
