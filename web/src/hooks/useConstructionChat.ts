import { useCallback, useState } from 'react';
import { api, type AgentMessage, type ToolStep } from '../lib/api';

export function useConstructionChat(opts: { onError: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  const [briefing, setBriefing] = useState<string | undefined>();
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(() => {
    try {
      return sessionStorage.getItem('constructionDisclaimer') === '1';
    } catch {
      return false;
    }
  });

  const acceptDisclaimer = useCallback(() => {
    setDisclaimerAccepted(true);
    try {
      sessionStorage.setItem('constructionDisclaimer', '1');
    } catch {
      // ignore
    }
  }, []);

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
        const result = await api.constructionChat({ message: trimmed, sessionId });
        setSessionId(result.sessionId);
        setToolSteps(result.toolSteps);
        setMessages(result.messages);
        if (result.briefing) setBriefing(result.briefing);
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : 'Construction agent failed');
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
    briefing,
    sendMessage,
    disclaimerAccepted,
    acceptDisclaimer,
  };
}
