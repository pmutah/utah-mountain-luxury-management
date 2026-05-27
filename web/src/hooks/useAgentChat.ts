import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import type { AgentMessage, ToolStep } from '../lib/agent-types';

export function useAgentChat(opts: {
  month: string;
  activeTab: string;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setLoading(true);
      setToolSteps([]);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: trimmed, timestamp: new Date().toISOString() },
      ]);

      try {
        const result = await api.agentChat({
          message: trimmed,
          sessionId,
          context: { month: opts.month, activeTab: opts.activeTab },
        });
        setSessionId(result.sessionId);
        setToolSteps(result.toolSteps);
        setMessages(result.messages);
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : 'Agent request failed');
      } finally {
        setLoading(false);
      }
    },
    [loading, sessionId, opts],
  );

  return {
    open,
    setOpen,
    messages,
    loading,
    toolSteps,
    sendMessage,
  };
}
