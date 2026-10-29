import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const temp = mkdtempSync(join(tmpdir(), 'deva-pack-'));
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 120_000, ...options,
});
try {
  run('npm', ['pack', '--pack-destination', temp]);
  const tarballs = readdirSync(temp).filter(name => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1);
  const [filename] = tarballs;
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, filename)], { cwd: temp });
  // Import the real package entry point (a stdio CLI), then exercise MCP initialization.
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'pack-smoke', version: '1.0.0' } } },
  ];
  const output = run(process.execPath, ['--input-type=module', '-e', "await import('@deva-me/mcp-server')"], {
    cwd: temp,
    input: requests.map(request => JSON.stringify(request)).join('\n') + '\n',
    env: { ...process.env, DEVA_MCP_CONFIG_PATH: join(temp, 'config.json'), DEVA_API_BASE: 'http://127.0.0.1:1', DEVA_API_KEY: 'pack-smoke', DEVA_MCP_LOG_LEVEL: 'error' },
  });
  const response = output.trim().split('\n').map(line => JSON.parse(line)).find(message => message.id === 1);
  assert.equal(response?.result?.serverInfo?.name, '@deva-me/mcp-server');
  console.log('Packed package smoke test passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
