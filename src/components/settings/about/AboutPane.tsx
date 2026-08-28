// Components
import { Answer, InfoRow, OutlineButton, Section } from '@/components/settings/shared/controls';

// Utils
import { send } from '@/lib/bridge';

// Types
import type { SettingsPaneProps } from '@/components/settings/shared/types';

export function AboutPane({ info }: SettingsPaneProps) {
  return (
    <>
      {info && (
        <Section title="About">
          <dl className="space-y-1.5 font-mono text-[11.5px]">
            <InfoRow label="Copacetic" value={info.version} />
            <InfoRow label="Electron" value={info.electronVersion} />
            <InfoRow label="Chromium" value={info.chromeVersion} />
            <InfoRow label="Platform" value={info.platform} />
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
            Copacetic renders pages with Chromium. It is a browser interface, not a browser engine — the rendering,
            networking and sandboxing are Chromium&apos;s.
          </p>
        </Section>
      )}

      <Section title="What Copacetic sends">
        <dl className="space-y-3">
          <Answer question="Does Copacetic track me?">
            No. There is no analytics, no telemetry, no crash reporting and no account. Nothing about how you use the
            browser is recorded anywhere but on this machine.
          </Answer>
          <Answer question="Then what is the diagnostics log?">
            A file on this machine that records what Copacetic itself did — that it started, that a setting would not
            save, that something failed. It never records a page you visited: an address is reduced to its scheme
            before anything is written, so the log can say a page failed to load without saying which one. Nothing
            sends it anywhere. It is there so that if Copacetic misbehaves you have something to read, and something
            to pass on if you choose to.
          </Answer>
          <div className="pt-1">
            <OutlineButton onClick={() => send((api) => api.app.revealDiagnostics())}>Show the log</OutlineButton>
          </div>
          <Answer question="Does it phone home?">
            Once, if you let it: the update check asks GitHub for the latest version number. It sends a version and
            nothing else, and you can turn it off in Updates. That is the only request Copacetic makes on its own
            behalf — everything else on the network is a page you asked for.
          </Answer>
          <Answer question="What about the address bar?">
            Suggestions come from your own history and bookmarks, ranked in the main process on this machine. No
            keystroke is sent anywhere as you type. Pressing Enter on something that is not an address sends it to
            your chosen search engine, and nothing before that.
          </Answer>
          <Answer question="Where is my data?">
            Plain JSON files in Copacetic&apos;s folder in your user profile, which you can read in any text editor.
            History older than 90 days is dropped on launch. Your data can be exported from this panel, and clearing
            it here removes it for real.
          </Answer>
        </dl>
      </Section>

      <Section title="What it does not do">
        <dl className="space-y-3">
          <Answer question="Why do some sites look broken?">
            {/* Counted from the list itself: a number written out here goes stale silently. */}
            Copacetic blocks {info ? `${info.blockerRuleCount} domains` : 'a list of domains'} that exist only to
            follow people between sites. Occasionally one of them is load-bearing for a login or an embed. The
            connection panel shows exactly what was blocked on the page, and lets you allow it on that site alone
            rather than everywhere.
          </Answer>
          <Answer question="Why will Netflix not play?">
            DRM is not bundled. Playing protected video needs Widevine, which is a closed component under a separate
            licence, and shipping it would sit badly with a browser whose argument is that you can see what it does.
          </Answer>
          <Answer question="Can I install extensions?">
            No. Extensions need an API that reaches into pages and the browser itself, which is the opposite of the
            sandboxing Copacetic relies on. It is a deliberate no rather than a missing feature.
          </Answer>
          <Answer question="Does it remember passwords?">
            It can keep them, in Passwords, encrypted with a key your operating system holds. It does not yet offer to
            save what you type or fill anything in — that is deliberate, and comes next.
          </Answer>
        </dl>
      </Section>

      <Section title="Honestly">
        <div className="space-y-2.5 text-[12px] leading-relaxed text-ink-dim">
          <p>
            Copacetic renders pages with Chromium. The rendering, networking, sandboxing and certificate validation
            are Chromium&apos;s work, not Copacetic&apos;s — what Copacetic adds is the interface around them and a
            set of decisions about what a browser should do on your behalf.
          </p>
          <p>
            <span className="text-ink">It has not been security audited.</span> It is a personal project built to a
            high standard, which is not the same thing as one that has been through review. The security model is
            described in full in the project&apos;s README, including the parts that are weaker than you might hope.
          </p>
          <p>
            <span className="text-ink">The builds are not code-signed.</span> That means your operating system will
            warn about them, and on macOS Copacetic cannot install its own updates. Signing costs money that has not
            been spent yet; it is a decision rather than an oversight.
          </p>
          <p>
            It comes with no warranty. If something here matters to you and it turns out to be wrong, the code is open
            and the issue tracker is the right place to say so.
          </p>
        </div>
      </Section>
    </>
  );
}
