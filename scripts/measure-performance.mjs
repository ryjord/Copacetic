/**
 * Measures the numbers the README publishes, so they can be checked rather than
 * believed.
 *
 * The rule this follows is the same one the rest of the project follows: a
 * number nobody can reproduce is a claim, not a measurement. So this runs the
 * real built app on a throwaway profile, reports the machine it ran on, and
 * takes several runs rather than the one that flattered it. The README prints
 * the median and says which machine produced it.
 *
 * Run it with `npm run measure` after `npm run build`. It writes nothing except
 * to stdout and its own temporary profiles, which it removes.
 *
 * One thing it does that the app never does on its own: the memory measurement
 * opens five pages on example.com, because memory with nothing loaded is not a
 * number anybody needs. Nothing else here touches the network.
 */
import { _electron as electron } from 'playwright';
import { existsSync, readFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, cpus, totalmem } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const RUNS = Number(process.env.RUNS ?? 5);
const FILTERS = path.join(process.cwd(), 'dist', 'electron', 'filters');

/**
 * The environment Electron is launched with.
 *
 * `ELECTRON_RUN_AS_NODE` is set by some editors' integrated terminals, and it
 * makes the Electron binary run as a plain Node process — no window, no app,
 * and a launch failure that says only "Process failed to launch". Inheriting it
 * means these never run from inside an editor, which is exactly where someone
 * would try them first.
 */
const launchEnvironment = () => {
  const environment = { ...process.env, NODE_ENV: 'production' };
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
};

/**
 * Launches the built app on a profile of its own and hands back the chrome
 * window, the profile path, and a way to shut both down.
 *
 * Written once rather than twice: the startup and memory measurements need the
 * same six steps, and two copies of them drift.
 */
async function launch() {
  const profile = realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-measure-')));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: launchEnvironment(),
  });

  const deadline = Date.now() + 30_000;
  let chrome = null;
  while (!chrome && Date.now() < deadline) {
    // The overlay is a window too; the chrome is the one that is not it.
    chrome = app.windows().find((candidate) => !candidate.url().includes('/overlay')) ?? null;
    if (!chrome) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  if (!chrome) {
    await app.close();
    rmSync(profile, { recursive: true, force: true });
    throw new Error('the app never opened a chrome window');
  }

  return {
    app,
    chrome,
    // Listening, not merely painted: the tab strip exists only once the
    // renderer has hydrated.
    async waitUntilListening() {
      while (!(await chrome.evaluate(() => Boolean(document.querySelector('[role="tablist"]'))))) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    async waitUntilVisible() {
      while (!(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() === true))) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    async done() {
      await app.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const ms = (value) => `${Math.round(value)}ms`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const gb = (bytes) => `${(bytes / 1024 / 1024 / 1024).toFixed(0)}GB`;

/**
 * Start to a window you can see, and start to a window that answers.
 *
 * Two numbers rather than one because they are two different experiences and
 * the gap between them is the thing that has caused real bugs here: the window
 * paints, and for about another second nothing in it is listening.
 */
async function measureStartup() {
  const visible = [];
  const ready = [];

  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    const running = await launch();
    try {
      await running.waitUntilVisible();
      visible.push(performance.now() - startedAt);
      await running.waitUntilListening();
      ready.push(performance.now() - startedAt);
    } finally {
      // A throw here would otherwise leave an Electron process running and a
      // temporary profile on disk, once per failed run.
      await running.done();
    }
  }

  return { visible: median(visible), ready: median(ready), visibleAll: visible, readyAll: ready };
}

/**
 * What the blocker costs to start.
 *
 * Both numbers matter, and only one of them is paid at startup: the engine is
 * built at package time and deserialised on launch. Parsing the raw lists is
 * what the app would do if it did not ship the prebuilt one, and is measured
 * here so the difference is a number rather than an assertion.
 */
async function measureBlocker() {
  const { FiltersEngine } = await import('@ghostery/adblocker');
  if (!existsSync(path.join(FILTERS, 'engine.bin'))) {
    throw new Error(
      'No built engine to measure. Run `npm run build` first — `build:main` clears dist/ on its way through.',
    );
  }
  const blob = readFileSync(path.join(FILTERS, 'engine.bin'));
  const manifest = JSON.parse(readFileSync(path.join(FILTERS, 'manifest.json'), 'utf8'));
  const rules = manifest.lists.reduce((total, list) => total + list.rules, 0);

  const deserialise = [];
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    FiltersEngine.deserialize(blob);
    deserialise.push(performance.now() - startedAt);
  }

  // Parsing is measured once. It is slow by a wide enough margin that a median
  // of five would say nothing a single run does not, and it costs seconds.
  const rawLists = manifest.lists.map((list) => list.name);
  let parse = null;
  const sources = path.join(process.cwd(), 'electron', 'main', 'security', 'filters');
  try {
    const text = rawLists.map((name) => readFileSync(path.join(sources, `${name}.txt`), 'utf8')).join('\n');
    const startedAt = performance.now();
    FiltersEngine.parse(text);
    parse = performance.now() - startedAt;
  } catch {
    // A checkout without the lists still builds and still runs; it just cannot
    // measure this one. Nothing is fetched to make it possible.
    parse = null;
  }

  return { deserialise: median(deserialise), parse, rules, bytes: blob.byteLength };
}

/**
 * What the browser costs to hold open, with nothing in it and with tabs in it.
 *
 * Reported as the sum across every process the app is running, because that is
 * what the machine actually gives up — a per-process figure for a browser with
 * a process per tab is the number that flatters.
 */
async function measureMemory() {
  const running = await launch();
  try {
    await running.waitUntilListening();

    // Every process the app is running, added together, because that is what
    // the machine actually gives up. A per-process figure for a browser with a
    // process per tab is the number that flatters.
    const total = () =>
      running.app.evaluate(({ app: electronApp }) =>
        // Electron reports workingSetSize in kilobytes.
        electronApp.getAppMetrics().reduce((sum, metric) => sum + (metric.memory?.workingSetSize ?? 0) * 1024, 0),
      );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const atRest = await total();

    const TABS = 5;
    for (let i = 0; i < TABS; i += 1) {
      await running.chrome.evaluate((n) => window.copacetic.tabs.create(`https://example.com/?measure=${n}`), i);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const withTabs = await total();

    return { atRest, withTabs, tabs: TABS, perTab: (withTabs - atRest) / TABS };
  } finally {
    await running.done();
  }
}

const machine = () => {
  const cpu = cpus()[0]?.model ?? 'unknown';
  const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;
  return `${cpu}, ${cpus().length} cores, ${gb(totalmem())} RAM · Electron ${electronVersion} · ${process.platform} ${process.arch}`;
};

const startup = await measureStartup();
const blocker = await measureBlocker();
const memory = await measureMemory();

console.log('');
console.log(`Machine   ${machine()}`);
console.log(`Runs      ${RUNS} (median reported)`);
console.log('');
console.log(`Start to a visible window          ${ms(startup.visible)}`);
console.log(`Start to a window that responds    ${ms(startup.ready)}`);
console.log(
  `Blocking engine, loaded on launch  ${ms(blocker.deserialise)}  (${blocker.rules.toLocaleString()} rules, ${mb(blocker.bytes)})`,
);
console.log(
  `Blocking engine, built from source ${blocker.parse === null ? 'not measured (raw lists not present)' : ms(blocker.parse)}`,
);
console.log(`Memory, just the start page        ${mb(memory.atRest)}`);
console.log(`Memory, ${memory.tabs} pages open              ${mb(memory.withTabs)}  (${mb(memory.perTab)} per page)`);
console.log('');
console.log(`raw: visible ${startup.visibleAll.map((v) => Math.round(v)).join(' ')}`);
console.log(`raw: ready   ${startup.readyAll.map((v) => Math.round(v)).join(' ')}`);
