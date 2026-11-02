import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const commit = process.env.COMMIT_REF || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('Invalid build commit');
await writeFile('dist/version.json', JSON.stringify({ commit, builtAt: new Date().toISOString() }) + '\n');
console.log(`Build version: ${commit}`);
