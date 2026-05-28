import { PLAYBOOK_CHUNKS, type PlaybookChunk } from './playbooks';

export type IndexEntry = {
  chunkId: string;
  trade?: string;
  stage?: string;
  keywords: string[];
};

/** Keyword index built from playbook metadata */
export const MASTER_INDEX: IndexEntry[] = PLAYBOOK_CHUNKS.map((c) => ({
  chunkId: c.id,
  trade: c.trade,
  stage: c.stage,
  keywords: [...c.topics, c.title.toLowerCase(), ...(c.trade ? [c.trade] : [])],
}));

export function getChunkById(id: string): PlaybookChunk | undefined {
  return PLAYBOOK_CHUNKS.find((c) => c.id === id);
}
