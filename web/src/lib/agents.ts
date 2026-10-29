export type AgentCard = {
  id: 'co-host' | 'build' | 'nora' | 'muse' | 'amanda';
  name: string;
  role: string;
  summary: string;
  /** Browser event that opens an in-dashboard chat. Null means this agent lives outside the dashboard. */
  opens: 'uml:open-cohost' | 'uml:open-build' | null;
};

export const AGENT_ROSTER: AgentCard[] = [
  {
    id: 'co-host',
    name: 'Co-host',
    role: 'Dashboard',
    summary: 'Guests, bills, the calendar, and pricing questions. Opens in the corner chat.',
    opens: 'uml:open-cohost',
  },
  {
    id: 'build',
    name: 'Build',
    role: 'Construction',
    summary: 'River build costs, phases, and partner spend. Opens in the build chat.',
    opens: 'uml:open-build',
  },
  {
    id: 'nora',
    name: 'Nora',
    role: 'Guest stay',
    summary: 'Answers the guest on their stay link. She does not see expenses, payouts, or the owner statement.',
    opens: null,
  },
  {
    id: 'muse',
    name: 'Muse',
    role: 'Meta',
    summary: 'Runs the same tools as the dashboard, including the shared job list.',
    opens: null,
  },
  {
    id: 'amanda',
    name: 'Amanda',
    role: 'Grok',
    summary: 'Same tools as Muse. She claims yield jobs on the shared desk so two agents do not repeat them.',
    opens: null,
  },
];
