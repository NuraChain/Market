import { pathToFileURL } from 'node:url';

import { pipeline, requestId, securityHeaders, rateLimit, logRequests, loadConfig, num, oneOf, str } from '@azerothjs/http';
import { serve, handleShutdownSignals } from '@azerothjs/http/node';
import type { PageRenderer, PageRoute } from '@azerothjs/kit';
import { createLogger } from '@azerothjs/logger';
import { fileStream } from '@azerothjs/logger/node';

import { buildApp } from './app.ts';
import { diskUploader } from './uploads.ts';
import { ChainReader, loadChainEnv } from './chain/client.ts';
import { IndexStore } from './chain/store.ts';
import { startIndexer } from './chain/indexer.ts';

try
{
    process.loadEnvFile();
}
catch
{
    // No .env file - the ambient environment is the configuration.
}

const config = loadConfig({
    port: num('PORT', { default: 3000 }),
    env: oneOf('NODE_ENV', ['development', 'production', 'test'], { default: 'development' }),
    clientDir: str('CLIENT_DIR', { default: '../application/dist' }),
    ssrEntry: str('SSR_ENTRY', { default: '../application/dist-server/entry.server.js' }),
    uploadDir: str('UPLOAD_DIR', { default: 'uploads' })
});
const isProduction = config.env === 'production';

const log = createLogger({ stream: fileStream('logs/'), fields: { service: 'auctionhouse-server' } });

// The indexer half: the chain env, the sqlite index, and the watcher that keeps it fresh.
// The RPC may come up after us (the runbook starts everything together), so the first
// contact retries instead of dying.
const chainEnv = loadChainEnv();
const chain = new ChainReader(chainEnv);
const store = new IndexStore(chainEnv.dbPath);

const treasury = await (async () =>
{
    for (let attempt = 1; ; attempt++)
    {
        try
        {
            return await chain.treasuryAddress();
        }
        catch
        {
            if (attempt === 1)
            {
                log.warn('chain unreachable, retrying', { rpc: chainEnv.rpcUrl });
                // ALSO to stdout, deliberately. This wait happens BEFORE the port is bound, so
                // to anyone at a terminal the process looks hung - and the log goes to a file
                // they have no reason to be tailing yet. A boot that blocks has to say why.
                process.stdout.write(
                    `\n  Waiting for the chain at ${ chainEnv.rpcUrl } ...\n`
                    + '  Start it with `npm run chain`, then `npm run seed` to deploy. Giving up after 2 minutes.\n\n'
                );
            }
            if (attempt >= 60)
            {
                throw new Error(`No chain at ${ chainEnv.rpcUrl } - start the node and deploy first (see RUNBOOK.md)`);
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
})();

const indexer = startIndexer(store, chain, log);

// In dev, vite serves the client and proxies /api here; in production this server serves
// the whole app - one origin, no CORS between halves. The SSR bundle is ONE self-contained
// file, so importing it gives the kit both the route table and the page renderer.
const ssr = isProduction
    ? await import(pathToFileURL(config.ssrEntry).href) as { routes: PageRoute[]; renderPage: PageRenderer }
    : undefined;

const app = buildApp({
    dev: !isProduction,
    observe: logRequests(log),
    store,
    chain,
    treasury,
    uploader: diskUploader(config.uploadDir),
    uploadDir: config.uploadDir,
    pages: ssr === undefined ? undefined : { routes: ssr.routes, clientDir: config.clientDir, renderer: ssr.renderPage }
});

const handler = pipeline(
    app,
    requestId(),
    securityHeaders(),
    rateLimit({ limit: 200, windowMs: 60_000 })
);

const served = await serve(handler, { port: config.port });
handleShutdownSignals(served);
served.server.on('close', () =>
{
    indexer.stop();
    store.close();
});

// The panel's Server tab connects here and mirrors the server's reactive graph: request roots,
// their per-request state, and long-lived stores. That is live application data, so the bridge
// attaches ONLY under NODE_ENV=development and every upgrade must present the token below from a
// loopback peer. The token is minted per boot: it is never written to disk and never committed.
// Reads the RAW variable, not `config.env`. `loadConfig` defaults an unset NODE_ENV to
// 'development' for this app's own purposes, but the bridge refuses anything that is not
// literally development - so guarding on the defaulted value would call it in a scaffold where
// nothing is set, and the boot would die on a bridge that was never going to attach.
// `azeroth dev` sets NODE_ENV=development, so `npm run dev` gets the panel.
if (process.env.NODE_ENV === 'development')
{
    const { attachDevtools } = await import('@azerothjs/devtools/server');
    const token = crypto.randomUUID();
    attachDevtools(served.server, { token });
    log.info('devtools bridge', { url: `ws://localhost:${ served.port }/__azeroth/devtools?token=${ token }` });
}

log.info('Listening', { port: served.port, env: config.env });
