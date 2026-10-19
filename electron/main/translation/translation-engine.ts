// Libs
import { Worker } from 'node:worker_threads';
import path from 'node:path';

// Types
import type { LanguagePair } from '../../shared/translation/languages';
import type { ModelBuffers } from './translation-models';

interface WorkerReply {
  id: number;
  result?: unknown;
  error?: { message?: string };
}

/**
 * Bergamot, running in a worker thread of the main process.
 *
 * The worker only ever sees text and model buffers handed to it here: it has
 * no network of its own, and the models it runs were checked before it got them.
 */
export class TranslationEngine {
  private worker: Worker | null = null;
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
    void this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.loaded.clear();
    this.waiting.forEach(({ reject }) => reject(new Error('The translation engine stopped.')));
    this.waiting.clear();
  }

  private started(): Promise<unknown> {
    if (!this.ready) {
      const worker = new Worker(path.join(this.engineDirectory, 'translator-worker.js'));
      worker.on('message', (reply: WorkerReply) => {
        const pending = this.waiting.get(reply.id);
        this.waiting.delete(reply.id);
        if (reply.error) {
          pending?.reject(new Error(reply.error.message ?? 'The translation engine failed.'));
        } else {
          pending?.resolve(reply.result);
        }
      });
      // A worker that dies takes its models with it, so the next translation starts a fresh one.
      worker.on('error', () => this.dispose());
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
      return Promise.reject(new Error('The translation engine is not running.'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      worker.postMessage({ id, name, args });
    });
  }
}
