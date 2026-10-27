/**
 * Cross-platform helper: kill process listening on a port (Windows + Unix).
 * Usage: node scripts/kill-port.cjs 3002
 */
const targetPort = parseInt(process.argv[2] || '3002', 10);
const targetPorts = Array.from(new Set([targetPort, 24678]));
const { execSync } = require('child_process');

for (const port of targetPorts) {
  if (process.platform === 'win32') {
    try {
      const psCmd = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
      const out = execSync(psCmd, { encoding: 'utf8' }).trim();
      const pids = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s) && s !== '0');
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`Freed port ${port} (PID ${pid})`);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  } else {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore', shell: true });
    } catch {
      /* ignore */
    }
  }
}
console.log(`Port check complete.`);
