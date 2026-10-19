'use client';

// Libs
import { useEffect, useState, type ReactNode } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';

// Utils
import { ask, send } from '@/lib/bridge';

// Types
import type { VaultFacts } from '@shared/types';
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

const NO_FACTS: VaultFacts = {
  filePath: '',
  hasKeychain: false,
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

  const domains = info ? `${info.blockerRuleCount} domains` : 'a list of domains';

  return (
    <div className="flex max-w-[62ch] flex-col gap-8">
      <Topic title="What leaves this machine">
        <Answer question="Does Copacetic track me?">
          No. There is no analytics, no telemetry, no crash reporting and no account. Nothing about how you use the
          browser is recorded anywhere but here.
        </Answer>
        <Answer question="What does it contact on its own?">
          Only the update check, which asks GitHub for the latest version number and sends nothing about you. You can
          turn it off in Updates. The filter lists are fetched only when you press Check now. A page&apos;s icon is
          fetched in that page&apos;s own session, because the page asked for it. On Windows and Linux, checking
          spelling in a language downloads its dictionary from Google once; nothing you type is sent. macOS uses its
          own spelling checker.
        </Answer>
        <Answer question="Does the address bar send what I type?">
          No. Suggestions come from your own history and bookmarks, worked out on this machine. Only pressing Enter on
          something that is not an address sends it, to your search engine.
        </Answer>
      </Topic>

      <Topic title="What is kept on this machine">
        <Answer question="Where is my data?">
          In Copacetic&apos;s folder in your user profile: a SQLite database for history, bookmarks, downloads and
          what you decided about each site, and a settings file you can read in any text editor. History is removed
          after 90 days. You can export or clear it in Your data.
        </Answer>
        <Answer question="What is the diagnostics log?">
          A file that records what Copacetic did: that it started, that a setting would not save, that something
          failed. Addresses are reduced to their scheme before they are written, so it never names a page you visited.
          Nothing sends it anywhere.
          <div className="mt-2">
            <Button size="sm" onClick={() => send((api) => api.app.revealDiagnostics())}>
              Show the log
            </Button>
          </div>
        </Answer>
        <Answer question="What does a Hush tab keep?">
          Nothing on disk: no history, cookies, cache, icons or reopen list. It does not hide you. The sites you open,
          your network and your internet provider see a Hush tab like any other.
        </Answer>
      </Topic>

      <Topic title="Passwords">
        <Answer question="Where are they?">
          Encrypted one at a time in{' '}
          <span className="break-all font-mono text-body-sm text-ink select-text">
            {facts.filePath || 'your profile'}
          </span>
          . The sites and usernames in it are readable; the passwords are not.
        </Answer>
        <Answer question="What protects them?">
          {facts.hasKeychain
            ? 'A key your operating system keeps. It stops someone reading the file, but not software running as you, which can ask for the same key.'
            : 'This machine has no keychain Copacetic can use, so passwords cannot be saved here.'}
        </Answer>
        <Answer question="Does locking help?">
          {facts.canAskWhoYouAre
            ? 'It stops someone at your screen, once macOS has confirmed it is you. It does not protect the file.'
            : 'This machine cannot check who you are, so unlocking is one click. It stops someone glancing at your screen.'}
        </Answer>
        {!facts.isSigned && (
          <Answer question="Could an update lose them?">
            On macOS, possibly. These builds are not code-signed, so macOS can treat an updated Copacetic as a
            different app and refuse it the keychain key. Nothing is deleted, but the passwords would be unreadable
            until you import a copy. Keep an export somewhere safe.
          </Answer>
        )}
        <Answer question="Does it fill passwords in?">
          When you ask. Right-click a password box and choose Fill password: one short script runs in that page, once,
          and leaves nothing behind. It only appears on sites you have a password saved for.
        </Answer>
        <Answer question="Does it offer to save passwords?">
          No. Copacetic never offers to save what you type, because noticing it would mean code running in every page
          all the time. You add passwords in Settings yourself.
        </Answer>
      </Topic>

      <Topic title="Scripts in pages">
        <Answer question="Does Copacetic run code in the pages I visit?">
          Two small things. Every page gets a placeholder for the <code className="font-mono">window.chrome</code>{' '}
          object that real Chrome has and Electron leaves empty, because some sign-in pages refuse a browser without
          it. It holds three empty members and nothing of the browser&apos;s. The other is Fill password, which runs
          once when you choose it.
        </Answer>
      </Topic>

      <Topic title="Tracker blocking">
        <Answer question="What is blocked?">
          Copacetic blocks {domains} that exist only to follow people between sites, plus the EasyList and EasyPrivacy
          rules. The count in the address bar is the real number blocked on that page.
        </Answer>
        <Answer question="What can it not block?">
          Ads served from a site&apos;s own domain, ads the server writes into the page, and sponsored posts in a
          feed. The space a blocked ad leaves inside a frame is not collapsed, because that would mean running a
          script in the frame.
        </Answer>
        <Answer question="Whose are the lists?">
          The EasyList project&apos;s, shipped whole and unmodified under the GPLv3 or CC BY-SA 3.0. The NOTICE file
          says so in the terms those licences ask for.
        </Answer>
      </Topic>

      <Topic title="Known limitations">
        <Answer question="Has it been audited?">
          It has not been security audited. It is a personal project built to a high standard, which is not the same
          as one that has been reviewed.
        </Answer>
        <Answer question="Is it signed?">
          The builds are not code-signed. Your system may warn the first time you open Copacetic, and on macOS updates
          are installed by hand.
        </Answer>
        <Answer question="What does it not support?">
          Extensions, by design: they need access to pages that the sandbox does not allow. Protected video such as
          Netflix, because the Widevine component is not included.
        </Answer>
        <Answer question="Where do I report a problem?">
          On the project&apos;s issue tracker. Copacetic comes with no warranty.
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

function Answer({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-body font-medium text-ink">{question}</h4>
      <div className="mt-1 text-body text-ink-dim">{children}</div>
    </div>
  );
}
