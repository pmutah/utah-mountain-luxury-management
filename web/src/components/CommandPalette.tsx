import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Expense, type Reservation, type ToolStep } from '../lib/api';
import type { DashboardTab, ReportView, RiverView } from '../lib/bot-nav';
import { omnibarHits, type SearchHit } from '../lib/omnibar-search';
import { AgentToolSteps } from './AgentToolSteps';

type Destination = { tab: DashboardTab; report?: ReportView; river?: RiverView };

const COMMANDS: Array<{ label: string; test: RegExp; dest: Destination; adminOnly?: boolean }> = [
  { label: 'Overview', test: /^(overview|home|portfolio)$/i, dest: { tab: 'portfolio' } },
  { label: 'Calendar', test: /^(calendar|tape)$/i, dest: { tab: 'calendar' } },
  { label: 'Market', test: /^(market|comps|pricing)$/i, dest: { tab: 'market' } },
  { label: 'Agents', test: /^(agents|ai|hub)$/i, dest: { tab: 'agents' } },
  { label: 'Report', test: /^(report|p&l|pnl)$/i, dest: { tab: 'report', report: 'pnl' } },
  { label: 'Owner statement', test: /^(owner|statement)$/i, dest: { tab: 'owner' } },
  { label: 'Tax & CPA', test: /^(tax|taxes|cpa|schedule e|469)$/i, dest: { tab: 'tax' }, adminOnly: true },
  { label: 'Clean', test: /^(clean|turnover|housekeeping)$/i, dest: { tab: 'clean' } },
  { label: 'Documents', test: /^documents?$/i, dest: { tab: 'report', report: 'documents' } },
  { label: 'Guests', test: /^guests?$/i, dest: { tab: 'guests' } },
  { label: 'Ranch', test: /^ranch( house)?$/i, dest: { tab: 'ranch' } },
  { label: 'Lindon', test: /^lindon( house)?$/i, dest: { tab: 'lindon' }, adminOnly: true },
  { label: 'River', test: /^river( house)?$/i, dest: { tab: 'river', river: 'rental' } },
  { label: 'Opening', test: /^(opening|launch)$/i, dest: { tab: 'river', river: 'launch' } },
  { label: 'Build costs', test: /^(build|construction)$/i, dest: { tab: 'river', river: 'build' } },
  { label: 'Our expenses', test: /^(ours|household|furnishings)$/i, dest: { tab: 'ours' }, adminOnly: true },
];

function isBuildQuestion(text: string) {
  return /\b(framing|permit|drywall|foundation|punch|todd|build cost|construction|invoice|phase)\b/i.test(text);
}

export function CommandPalette({
  month,
  activeTab,
  onNavigate,
  reservations = [],
  expenses = [],
  hideLindon = false,
}: {
  month: string;
  activeTab: string;
  onNavigate: (dest: Destination) => void;
  reservations?: Reservation[];
  expenses?: Expense[];
  hideLindon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [buildSession, setBuildSession] = useState<string>();
  const [cursor, setCursor] = useState(0);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt ?? '';
      setQuery(prompt);
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('uml:command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('uml:command', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, query]);

  const availableCommands = useMemo(
    () => COMMANDS.filter((c) => !(hideLindon && c.adminOnly)),
    [hideLindon],
  );

  const hits = useMemo(
    () => omnibarHits({ query, reservations, expenses, hideLindon }),
    [query, reservations, expenses, hideLindon],
  );
  const suggestions = useMemo(
    () =>
      availableCommands
        .filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase()) || c.test.test(query))
        .slice(0, 8),
    [availableCommands, query],
  );

  function openHit(hit: SearchHit) {
    if (hit.stayId) window.dispatchEvent(new CustomEvent('uml:focus-guest', { detail: { id: hit.stayId } }));
    if (hit.tab) {
      onNavigate({
        tab: hit.tab as DashboardTab,
        report: hit.report,
        river: hit.river,
      });
    }
    setOpen(false);
    setQuery('');
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const command = availableCommands.find((c) => c.test.test(trimmed));
    if (command) {
      onNavigate(command.dest);
      setOpen(false);
      setQuery('');
      return;
    }
    setLoading(true);
    setReply('');
    setSteps([]);
    try {
      if (isBuildQuestion(trimmed)) {
        const result = await api.constructionChat({ message: trimmed, sessionId: buildSession });
        setBuildSession(result.sessionId);
        setReply(result.reply);
        setSteps(result.toolSteps ?? []);
      } else {
        const result = await api.agentChat({
          message: trimmed,
          sessionId,
          context: { month, activeTab },
        });
        setSessionId(result.sessionId);
        setReply(result.reply);
        setSteps(result.toolSteps ?? []);
      }
    } catch (e) {
      setReply(e instanceof Error ? e.message : 'Co-host could not answer.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-xs flex items-start justify-center px-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="uml-panel w-full max-w-xl rounded-3xl p-4 sm:p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ask Utah Mountain Luxury"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(query);
          }}
        >
          <input
            ref={inputRef}
            data-bot="command-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((value) => Math.min(hits.length - 1, value + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((value) => Math.max(0, value - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const command = availableCommands.find((item) => item.test.test(query.trim()));
                if (command) {
                  onNavigate(command.dest);
                  setOpen(false);
                  setQuery('');
                  return;
                }
                const hit = hits[cursor];
                if (hit && query.trim()) {
                  openHit(hit);
                  return;
                }
                void submit(query);
              }
            }}
            placeholder="Ask AI, search guests & bills, or jump to Tax, Ranch, Build…"
            className="w-full bg-transparent outline-none font-display text-2xl placeholder:text-[var(--uml-muted)]"
          />
        </form>

        {hits.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="uml-kicker px-2">Matching Stays &amp; Bills</p>
            {hits.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${index === cursor ? 'bg-[var(--uml-surface-2)]' : ''}`}
                onClick={() => openHit(hit)}
              >
                <span>{hit.label}</span>
                <span className="ml-2 text-[var(--uml-muted)]">{hit.detail}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-3">
          <p className="uml-kicker mb-1.5">Screens</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((item) => (
              <button
                key={item.label}
                type="button"
                className="uml-nav"
                onClick={() => {
                  onNavigate(item.dest);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 border-t border-[var(--uml-line)]/60 pt-3">
          <p className="uml-kicker mb-1.5">Quick Actions</p>
          <div className="flex flex-wrap gap-1.5">
            {!hideLindon && (
              <button
                type="button"
                className="uml-nav"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('uml:quick-capture'));
                }}
              >
                + Log bill or note
              </button>
            )}
            <a
              href="/houses/"
              target="_blank"
              rel="noreferrer"
              className="uml-nav inline-flex items-center"
              onClick={() => setOpen(false)}
            >
              Guest booking site ↗
            </a>
            <button
              type="button"
              className="uml-nav"
              onClick={() => {
                const url = `${window.location.origin}/houses/`;
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopiedDirect(true);
                  window.setTimeout(() => setCopiedDirect(false), 1800);
                });
              }}
            >
              {copiedDirect ? 'Copied /houses/ URL' : 'Copy direct link'}
            </button>
            <button
              type="button"
              className="uml-nav"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent('uml:open-cohost'));
              }}
            >
              Full co-host
            </button>
            <button
              type="button"
              className="uml-nav"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent('uml:open-build'));
              }}
            >
              Full build chat
            </button>
          </div>
        </div>

        {(loading || reply) && (
          <div className="mt-4 border-t border-[var(--uml-line)] pt-3 text-sm leading-relaxed">
            {loading && <p className="text-[var(--uml-muted)]">Looking through the books…</p>}
            {reply && <p>{reply}</p>}
            <AgentToolSteps steps={steps} loading={loading} />
          </div>
        )}
        <p className="uml-kicker mt-4">Ctrl K or ⌘K · [ and ] step months · Build questions go to the construction manager</p>
      </div>
    </div>
  );
}
