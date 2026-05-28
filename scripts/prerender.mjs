import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { render } from 'svelte/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const tmpDir = path.join(root, '.prerender-tmp');

const routes = [
  {
    url: '/writing/byron',
    componentPath: 'src/writing/ByronWalkthrough.svelte',
    exportName: 'Byron',
    outFile: 'writing/byron/index.html'
  },
  {
    url: '/writing/ghostly',
    componentPath: 'src/writing/GhostlyRunsWalkthrough.svelte',
    exportName: 'Ghostly',
    outFile: 'writing/ghostly/index.html'
  },
  {
    url: '/writing/softcore',
    componentPath: 'src/writing/SoftCoreWalkthrough.svelte',
    exportName: 'SoftCore',
    outFile: 'writing/softcore/index.html'
  }
];

async function main() {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  const ssrEntryPath = path.join(tmpDir, 'ssr-entry.js');
  const entrySource = routes
    .map(
      (r) =>
        `export { default as ${r.exportName} } from ${JSON.stringify(path.join(root, r.componentPath))};`
    )
    .join('\n');
  await fs.writeFile(ssrEntryPath, entrySource);

  await build({
    root,
    configFile: false,
    plugins: [svelte()],
    logLevel: 'warn',
    build: {
      ssr: ssrEntryPath,
      outDir: path.join(tmpDir, 'build'),
      emptyOutDir: true,
      ssrEmitAssets: false,
      copyPublicDir: false,
      target: 'node18',
      rollupOptions: {
        output: {
          format: 'esm',
          entryFileNames: 'ssr-bundle.mjs'
        }
      }
    }
  });

  const bundleUrl = pathToFileURL(path.join(tmpDir, 'build/ssr-bundle.mjs')).href;
  const bundle = await import(bundleUrl);

  const template = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');

  for (const route of routes) {
    const Component = bundle[route.exportName];
    if (!Component) {
      throw new Error(`SSR bundle missing export ${route.exportName}`);
    }
    const { head, body } = render(Component);

    const titleMatch = head.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : 'Mikey Almeida · arvaer';
    const headWithoutTitle = head.replace(/<title>[\s\S]*?<\/title>/i, '').trim();

    const canonicalUrl = route.url.endsWith('/') ? route.url : `${route.url}/`;
    const canonical = `<link rel="canonical" href="https://arvaer.com${canonicalUrl}" />`;

    let html = template
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
      .replace(
        /<\/head>/i,
        `    ${canonical}\n    ${headWithoutTitle}\n  </head>`
      )
      .replace(/<div id="app">[\s\S]*?<\/div>/, `<div id="app">${body}</div>`);

    const outPath = path.join(distDir, route.outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html);
    console.log(`prerendered ${route.url} → ${path.relative(root, outPath)}`);
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
