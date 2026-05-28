import { getChunkById, MASTER_INDEX } from './master-index';
import { PLAYBOOK_CHUNKS, type PlaybookChunk } from './playbooks';

function scoreEntry(
  entry: (typeof MASTER_INDEX)[0],
  queryTokens: string[],
  currentStage?: string,
  tradeFilter?: string,
): number {
  let score = 0;
  if (tradeFilter && entry.trade === tradeFilter) score += 8;
  if (currentStage && entry.stage === currentStage) score += 6;
  for (const t of queryTokens) {
    if (t.length < 3) continue;
    for (const kw of entry.keywords) {
      if (kw.includes(t) || t.includes(kw)) score += 3;
    }
  }
  return score;
}

export function retrieveKnowledgeChunks(opts: {
  query: string;
  currentStage?: string;
  trade?: string;
  limit?: number;
}): PlaybookChunk[] {
  const limit = opts.limit ?? 8;
  const queryTokens = opts.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const scored = MASTER_INDEX.map((entry) => ({
    entry,
    score: scoreEntry(entry, queryTokens, opts.currentStage, opts.trade),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const ids = new Set<string>();
  const chunks: PlaybookChunk[] = [];

  for (const { entry } of scored) {
    if (ids.has(entry.chunkId)) continue;
    const chunk = getChunkById(entry.chunkId);
    if (chunk) {
      ids.add(entry.chunkId);
      chunks.push(chunk);
    }
    if (chunks.length >= limit) break;
  }

  if (chunks.length < 3 && opts.currentStage) {
    for (const c of PLAYBOOK_CHUNKS) {
      if (c.stage === opts.currentStage && !ids.has(c.id)) {
        chunks.push(c);
        ids.add(c.id);
      }
      if (chunks.length >= limit) break;
    }
  }

  if (chunks.length < 3) {
    for (const c of PLAYBOOK_CHUNKS.slice(0, limit)) {
      if (!ids.has(c.id)) chunks.push(c);
    }
  }

  return chunks.slice(0, limit);
}

export function formatChunksForPrompt(chunks: PlaybookChunk[]): string {
  return chunks.map((c) => `### ${c.title}\n${c.content}`).join('\n\n');
}
