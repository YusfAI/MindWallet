// MindWallet: tiny Node.js server (no dependencies).
// Serves the web app and proxies AI requests to Groq so the API key never
// reaches the browser.
//
//   GROQ_API_KEY=gsk_... node server.js      (or put it in a .env file)

const http = require('http');
const fs = require('fs');
const path = require('path');

loadDotEnv(path.join(__dirname, '.env'));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_BODY_BYTES = 20_000;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is not set. Copy .env.example to .env and add your key (https://console.groq.com/keys).');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'mindspend.html')).pipe(res);
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    return handleChat(req, res);
  }

  sendJson(res, 404, { error: { message: 'Not found' } });
});

function handleChat(req, res) {
  let body = '';
  let tooLarge = false;

  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      req.destroy();
    }
  });

  req.on('end', async () => {
    if (tooLarge) return sendJson(res, 413, { error: { message: 'Request too large' } });

    let incoming;
    try {
      incoming = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: { message: 'Invalid JSON' } });
    }

    const messages = Array.isArray(incoming.messages)
      ? incoming.messages
          .filter(m => m && m.role === 'user' && typeof m.content === 'string')
          .map(m => ({ role: 'user', content: m.content }))
      : [];
    if (!messages.length) return sendJson(res, 400, { error: { message: 'No message to send' } });

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1000,
          temperature: 0.4,
          // Ask for a JSON object: the front end parses the answer
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: String(incoming.system || '') }, ...messages],
        }),
      });

      const data = await groqRes.json();
      if (!groqRes.ok || data.error) {
        console.error('Groq error:', groqRes.status, data.error?.message);
        return sendJson(res, 502, { error: { message: data.error?.message || 'AI service error' } });
      }

      sendJson(res, 200, { content: [{ type: 'text', text: data.choices[0].message.content }] });
    } catch (e) {
      console.error('Error:', e.message);
      sendJson(res, 500, { error: { message: 'Could not reach the AI service' } });
    }
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

// Minimal .env loader (KEY=value per line) so the app needs no npm packages.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

if (require.main === module) {
  server.listen(PORT, () => console.log(`✅ MindWallet running at http://localhost:${PORT}`));
}

module.exports = { server };
