'use client';

// Libs
import { useEffect, useState, type ReactNode } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';

// Icons
import { ChevronDown } from 'lucide-react';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { VaultFacts } from '@shared/types';
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

const NO_FACTS: VaultFacts = {
  filePath: '',
  hasKeychain: false,
  keychainName: '',
  keychainProblem: '',
  canAskWhoYouAre: false,
  isSigned: false,
  entryCount: 0,
};

/**
 * Everything Copacetic sends and keeps, in one place.
 *
 * Settings rows say one line each; the reasons live here, where length is
 * fine. Every fact that can be read from the code is read, not written out.
 */
export function TransparencyPane({ info }: Pick<SettingsPaneProps, 'info'>) {
  const [facts, setFacts] = useState<VaultFacts>(NO_FACTS);

  useEffect(() => {
    void ask((api) => api.vault.facts(), NO_FACTS).then(setFacts);
  }, []);

  const domains = info
    ? t('settings.transparency.blocking.what.domains', { count: info.blockerRuleCount })
    : t('settings.transparency.blocking.what.domainsFallback');

  return (
    <div className="flex max-w-[62ch] flex-col gap-8">
      <Topic title={t('settings.transparency.leaves.title')}>
        <Answer question={t('settings.transparency.leaves.track.question')}>
          {t('settings.transparency.leaves.track.answer')}
        </Answer>
        <Answer question={t('settings.transparency.leaves.contact.question')}>
          {t('settings.transparency.leaves.contact.answer')}
        </Answer>
        <Answer question={t('settings.transparency.leaves.addressBar.question')}>
          {t('settings.transparency.leaves.addressBar.answer')}
        </Answer>
      </Topic>

      <Topic title={t('settings.transparency.kept.title')}>
        <Answer question={t('settings.transparency.kept.where.question')}>
          {t('settings.transparency.kept.where.answer')}
        </Answer>
        <Answer question={t('settings.transparency.kept.log.question')}>
          {t('settings.transparency.kept.log.answer')}
          <div className="mt-2">
            <Button size="sm" onClick={() => send((api) => api.app.revealDiagnostics())}>
              {t('settings.transparency.kept.log.action')}
            </Button>
          </div>
        </Answer>
        <Answer question={t('settings.transparency.kept.hush.question')}>
          {t('settings.transparency.kept.hush.answer')}
        </Answer>
      </Topic>

      <Topic title={t('settings.transparency.passwords.title')}>
        <Answer question={t('settings.transparency.passwords.where.question')}>
          {t('settings.transparency.passwords.where.before')}{' '}
          <span className="break-all font-mono text-body-sm text-ink select-text">
            {facts.filePath || t('settings.transparency.passwords.where.fallbackPath')}
          </span>
          {t('settings.transparency.passwords.where.after')}
        </Answer>
        <Answer question={t('settings.transparency.passwords.protect.question')}>
          {facts.hasKeychain
            ? t('settings.transparency.passwords.protect.withKeychain', { keychain: facts.keychainName })
            : facts.keychainProblem || t('settings.transparency.passwords.protect.withoutKeychain')}
        </Answer>
        <Answer question={t('settings.transparency.passwords.locking.question')}>
          {facts.canAskWhoYouAre
            ? t('settings.transparency.passwords.locking.canAsk')
            : t('settings.transparency.passwords.locking.cannotAsk')}
        </Answer>
        {!facts.isSigned && (
          <Answer question={t('settings.transparency.passwords.update.question')}>
            {t('settings.transparency.passwords.update.answer')}
          </Answer>
        )}
        <Answer question={t('settings.transparency.passwords.fill.question')}>
          {t('settings.transparency.passwords.fill.answer')}
        </Answer>
        <Answer question={t('settings.transparency.passwords.offer.question')}>
          {t('settings.transparency.passwords.offer.answer')}
        </Answer>
      </Topic>

      <Topic title={t('settings.transparency.scripts.title')}>
        <Answer question={t('settings.transparency.scripts.run.question')}>
          {t('settings.transparency.scripts.run.before')} <code className="font-mono">window.chrome</code>{' '}
          {t('settings.transparency.scripts.run.after')}
        </Answer>
      </Topic>

      <Topic title={t('settings.transparency.blocking.title')}>
        <Answer question={t('settings.transparency.blocking.what.question')}>
          {t('settings.transparency.blocking.what.answer', { domains })}
        </Answer>
        <Answer question={t('settings.transparency.blocking.thirdPartyCookies.question')}>
          {t('settings.transparency.blocking.thirdPartyCookies.answer')}
        </Answer>
        <Answer question={t('settings.transparency.blocking.cannot.question')}>
          {t('settings.transparency.blocking.cannot.answer')}
        </Answer>
        <Answer question={t('settings.transparency.blocking.lists.question')}>
          {t('settings.transparency.blocking.lists.answer')}
        </Answer>
      </Topic>

      <Topic title={t('settings.transparency.limits.title')}>
        <Answer question={t('settings.transparency.limits.audit.question')}>
          {t('settings.transparency.limits.audit.answer')}
        </Answer>
        <Answer question={t('settings.transparency.limits.signed.question')}>
          {t('settings.transparency.limits.signed.answer')}
        </Answer>
        <Answer question={t('settings.transparency.limits.unsupported.question')}>
          {t('settings.transparency.limits.unsupported.answer')}
        </Answer>
        <Answer question={t('settings.transparency.limits.report.question')}>
          {t('settings.transparency.limits.report.answer')}
        </Answer>
      </Topic>
    </div>
  );
}

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-title font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** A question that opens to its answer, so the page reads as a list of questions rather than an essay. */
function Answer({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-md bg-inset px-4 py-3">
      <summary className="flex cursor-default list-none items-center justify-between gap-4 text-reading font-medium text-ink">
        <h4 className="m-0 text-reading font-medium">{question}</h4>
        <ChevronDown
          size={14}
          className="shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-2 text-body text-ink-dim">{children}</div>
    </details>
  );
}
