// Libs
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';

export interface LocalSite {
  /** `http://127.0.0.1:<port>`, with no trailing slash. */
  origin: string;
  close(): Promise<void>;
}

const PLAIN_PAGE = '<!doctype html><title>Local</title><p>Local page</p>';

/**
 * A site on this machine for a smoke test to load, so a run never waits on the
 * public internet: example.com timing out failed tests that had nothing to say
 * about the network. Every path gets a plain page unless `respond` says otherwise.
 */
export async function startLocalSite(
  respond: (request: IncomingMessage, response: ServerResponse) => void = (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' }).end(PLAIN_PAGE);
  },
): Promise<LocalSite> {
  const server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        // Chromium keeps its connections alive, and close waits for every one of them.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
