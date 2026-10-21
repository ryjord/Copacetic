'use client';

// Components
import { Button } from '@/components/ui/Button/Button';

// Icons
import { KeyRound } from 'lucide-react';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { PasswordOffer, PasswordOfferAnswer } from '@shared/types';

/**
 * The offer to keep a password just signed in with. Like the permission card it
 * never takes the keyboard: Enter on the page that follows must not answer it.
 */
export function SavePasswordCard({ offer }: { offer: PasswordOffer }) {
  const answer = (choice: PasswordOfferAnswer) => send((api) => api.vault.answerSaveOffer(offer.id, choice));
  const isUpdate = offer.kind === 'update';
  return (
    <section
      aria-label={t('shell.overlay.saveCard.label')}
      className="animate-pop flex w-90 flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-popover"
    >
      <div className="flex items-start gap-3">
        <KeyRound size={18} strokeWidth={1.75} className="mt-px shrink-0 text-ink-dim" aria-hidden />
        <div className="min-w-0">
          <p className="text-body text-ink">
            {t(isUpdate ? 'shell.overlay.saveCard.updateTitle' : 'shell.overlay.saveCard.saveTitle', {
              site: offer.site,
            })}
          </p>
          <p className="truncate text-body-sm text-ink-dim">
            {offer.username || t('shell.overlay.saveCard.noUsername')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => answer('never')}>
          {t('shell.overlay.saveCard.never')}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => answer('dismiss')}>
            {t('shell.overlay.saveCard.dismiss')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => answer('save')}>
            {t(isUpdate ? 'shell.overlay.saveCard.update' : 'shell.overlay.saveCard.save')}
          </Button>
        </div>
      </div>
    </section>
  );
}
