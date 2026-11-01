// Libs
import path from 'node:path';

// Utils
import { type EngineUtilityProcess, forkUtilityProcess } from '../engine/system';
import { t } from '../../shared/i18n/translate';

// Types
import type { LanguagePair } from '../../shared/translation/languages';
import type { ModelBuffers } from './translation-models';

interface WorkerReply {
  id: number;
  result?: unknown;
  error?: { message?: string };
}

/**
 * Bergamot, running in a utility process of its own. Not a worker thread: the
 * main process changes V8's flags as it runs, for the extension rules, and a
 * worker started after that takes the whole app down.
 *
 * The worker only ever sees text and model buffers handed to it here: it has
 * no network of its own, and the models it runs were checked before it got them.
 */
export class TranslationEngine {
  private worker: EngineUtilityProcess | null = null;
  private ready: Promise<unknown> | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly loaded = new Set<string>();

  constructor(private readonly engineDirectory: string) {}

  async load(pair: LanguagePair, buffers: ModelBuffers): Promise<void> {
    const key = `${pair.from}-${pair.to}`;
    if (this.loaded.has(key)) {
      return;
    }
    await this.started();
    await this.call('loadTranslationModel', [pair, buffers]);
    this.loaded.add(key);
  }

  isLoaded(pair: LanguagePair): boolean {
    return this.loaded.has(`${pair.from}-${pair.to}`);
  }

  async translate(route: readonly LanguagePair[], texts: readonly string[]): Promise<string[]> {
    await this.started();
    const result = await this.call('translate', [
      { models: route, texts: texts.map((text) => ({ text, html: true, qualityScores: false })) },
    ]);
    return Array.isArray(result)
      ? result.map((entry: unknown) => {
          const target = typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'target') : null;
          const text = typeof target === 'object' && target !== null ? Reflect.get(target, 'text') : null;
          return typeof text === 'string' ? text : '';
        })
      : [];
  }

  dispose(): void {
    this.worker?.kill();
    this.worker = null;
    this.ready = null;
    this.loaded.clear();
    this.waiting.forEach(({ reject }) => reject(new Error(t('main.translation.engineStopped'))));
    this.waiting.clear();
  }

  private started(): Promise<unknown> {
    if (!this.ready) {
      const worker = forkUtilityProcess(
        path.join(this.engineDirectory, 'translator-worker.js'),
        'Copacetic translation',
      );
      worker.on('message', (reply: WorkerReply) => {
        const pending = this.waiting.get(reply.id);
        this.waiting.delete(reply.id);
        if (reply.error) {
          pending?.reject(new Error(reply.error.message ?? t('main.translation.engineFailed')));
        } else {
          pending?.resolve(reply.result);
        }
      });
      // A process that dies takes its models with it, so the next translation starts a fresh one.
      worker.on('exit', () => {
        if (this.worker === worker) {
          this.dispose();
        }
      });
      this.worker = worker;
      this.ready = this.call('initialize', [{}]);
    }
    return this.ready;
  }

  private call(name: string, args: readonly unknown[]): Promise<unknown> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error(t('main.translation.engineNotRunning')));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      worker.postMessage({ id, name, args });
    });
  }
}
