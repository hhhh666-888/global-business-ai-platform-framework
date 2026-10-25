import http from 'node:http';

const PORT = Number(process.env.PORT ?? '8090');
const HOST = '0.0.0.0';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok', provider: 'reference-echo', version: '0.1.0' });
  }
  if (req.method === 'POST' && url.pathname === '/invoke') {
    const input = await readJson(req);
    if (input.capability !== 'demo.echo') return send(res, 400, { error: 'unsupported_capability' });
    return send(res, 200, {
      ok: true,
      capability: input.capability,
      echo: input.payload ?? null,
      receivedContext: {
        requestId: input.context?.requestId ?? null,
        actorSubject: input.context?.actorSubject ?? null,
        environment: input.context?.environment ?? null,
        organization: input.context?.organization ?? null,
        workspace: input.context?.workspace ?? null,
      },
    });
  }
  return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => console.log(JSON.stringify({ event: 'reference-provider.started', port: PORT })));
