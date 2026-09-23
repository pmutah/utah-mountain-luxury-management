import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type ToolStep } from '../lib/api';
import type { DashboardTab, ReportView, RiverView } from '../lib/bot-nav';
import { AgentToolSteps } from './AgentToolSteps';

type Destination = { tab: DashboardTab; report?: ReportView; river?: RiverView };

const COMMANDS: Array<{ label: string; test: RegExp; dest: Destination }> = [
  { label: 'Overview', test: /^(overview|home|portfolio)$/i, dest: { tab: 'portfolio' } },
  { label: 'Report', test: /^(report|p&l|pnl)$/i, dest: { tab: 'report', report: 'pnl' } },
  { label: 'Documents', test: /^documents?$/i, dest: { tab: 'report', report: 'documents' } },
  { label: 'Guests', test: /^guests?$/i, dest: { tab: 'guests' } },
  { label: 'Ranch', test: /^ranch( house)?$/i, dest: { tab: 'ranch' } },
  { label: 'Lindon', test: /^lindon( house)?$/i, dest: { tab: 'lindon' } },
  { label: 'River', test: /^river( house)?$/i, dest: { tab: 'river', river: 'rental' } },
  { label: 'Opening', test: /^(opening|launch)$/i, dest: { tab: 'river', river: 'launch' } },
  { label: 'Build costs', test: /^(build|construction)$/i, dest: { tab: 'river', river: 'build' } },
  { label: 'Our expenses', test: /^(ours|household|furnishings)$/i, dest: { tab: 'ours' } },
];

function isBuildQuestion(text: string) {
  return /\b(framing|permit|drywall|foundation|punch|todd|build cost|construction|invoice|phase)\b/i.test(text);
}

export function CommandPalette({
  month,
  activeTab,
  onNavigate,
}: {
  month: string;
  activeTab: string;
  onNavigate: (dest: Destination) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [buildSession, setBuildSession] = useState<string>();
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

  const suggestions = useMemo(
    () => COMMANDS.filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
    [query],
  );

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const command = COMMANDS.find((c) => c.test.test(trimmed));
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
      className="fixed inset-0 z-[80] bg-black/55 flex items-start justify-center px-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="uml-panel w-full max-w-xl rounded-3xl p-4 shadow-2xl"
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
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit(query);
              }
            }}
            placeholder="Ask, or go to Ranch, Build, Guests…"
            className="w-full bg-transparent outline-none font-display text-2xl placeholder:text-[var(--uml-muted)]"
          />
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
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
          <button
            type="button"
            className="uml-nav"
            onClick={() => window.dispatchEvent(new CustomEvent('uml:open-cohost'))}
          >
            Full co-host
          </button>
          <button
            type="button"
            className="uml-nav"
            onClick={() => window.dispatchEvent(new CustomEvent('uml:open-build'))}
          >
            Full build chat
          </button>
        </div>
        {(loading || reply) && (
          <div className="mt-4 border-t border-[var(--uml-line)] pt-3 text-sm leading-relaxed">
            {loading && <p className="text-[var(--uml-muted)]">Looking through the books…</p>}
            {reply && <p>{reply}</p>}
            <AgentToolSteps steps={steps} loading={loading} />
          </div>
        )}
        <p className="uml-kicker mt-4">Ctrl K or ⌘K · Build questions go to the construction manager</p>
      </div>
    </div>
  );
}
