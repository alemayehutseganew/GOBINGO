const net = require('net');
const { spawn } = require('child_process');

const PG_CTL = process.env.PG_CTL || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe';
const PG_DATA = process.env.PG_DATA || 'C:\\Program Files\\PostgreSQL\\18\\data';
const PG_LOG = process.env.PG_LOG || 'C:\\Users\\alexo\\Desktop\\pg.log';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 5432);

function portOpen(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function waitForPort(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(DB_HOST, DB_PORT)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function ensurePostgres() {
  return (async () => {
    if (await portOpen(DB_HOST, DB_PORT)) {
      console.log(`[ensurePostgres] PostgreSQL already running on ${DB_HOST}:${DB_PORT}`);
      return;
    }
    console.log('[ensurePostgres] PostgreSQL not running; starting...');
    await new Promise((resolve, reject) => {
      const child = spawn(PG_CTL, ['start', '-D', PG_DATA, '-l', PG_LOG, '-w', '-t', '30'], {
        stdio: 'inherit',
        shell: false,
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_ctl exited with code ${code}`))));
      child.on('error', reject);
    });
    if (!(await waitForPort(30000))) {
      throw new Error(`PostgreSQL did not become available on ${DB_HOST}:${DB_PORT}`);
    }
    console.log('[ensurePostgres] PostgreSQL started successfully');
  })();
}

if (require.main === module) {
  ensurePostgres()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[ensurePostgres] Failed:', err.message);
      process.exit(1);
    });
}

module.exports = { ensurePostgres, portOpen, waitForPort };