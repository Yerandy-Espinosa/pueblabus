import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('despliegue independiente de la disponibilidad de CTAN', () => {
  const options = {
    cwd: process.cwd(),
    env: { ...process.env, CTAN_GTFS_URL: 'http://example.invalid/gtfs.zip' },
    encoding: 'utf8' as const,
    timeout: 15_000,
  };
  it('mantiene el fallo de la actualización manual cuando la fuente es inválida', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/sync-ctan.ts'], options);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('La fuente de horarios debe ser la API HTTPS oficial');
  });
  it('permite compilar la web si la importación opcional no puede completarse', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/sync-ctan.ts', '--optional'], options);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('no se generará una demo');
  });
});
