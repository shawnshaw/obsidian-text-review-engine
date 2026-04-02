import { build, context } from 'esbuild';
import process from 'process';

const watch = process.argv.includes('--watch');

const shared = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2018',
  outfile: 'main.js',
  external: ['obsidian'],
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(shared);
  await ctx.watch();
  console.log('[text-review-engine] watching src/main.js');
} else {
  await build(shared);
  console.log('[text-review-engine] build complete');
}
