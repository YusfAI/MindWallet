const http = require('http');
const fs = require('fs');
const path = require('path');

const GROQ_API_KEY = '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'; // <-- paste your Groq key here

const server = http.createServer(async (req, res) => {
  console.log(req.method, req.url);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET') {
    const html = fs.readFileSync(path.join(__dirname, 'mindspend.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const incoming = JSON.parse(body);

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 1000,
            messages: [
              { role: 'system', content: incoming.system || '' },
              ...incoming.messages
            ]
          })
        });

        const data = await groqRes.json();
        console.log('Status:', groqRes.status);
        console.log('Response:', JSON.stringify(data).slice(0, 300));

        if (data.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: { message: data.error.message } }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          content: [{ type: 'text', text: data.choices[0].message.content }]
        }));

      } catch (e) {
        console.error('Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
    return;
  }
});

server.listen(3000, () => {
  console.log('✅ MindSpend running at http://localhost:3000');
});