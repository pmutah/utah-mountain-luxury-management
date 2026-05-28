import {
  loadConstructionProject,
  loadConstructionDocuments,
  loadConstructionRecommendations,
  sumInvoicedAmount,
} from '../../construction/construction-store';
import { formatChunksForPrompt, retrieveKnowledgeChunks } from '../../construction/knowledge/knowledge-retrieval';
import type { ConstructionEnv } from '../../construction/types';

export const CONSTRUCTION_PERSONA = `You are the Construction Manager — a genius-level superintendent with deep fluency in architecture, structural/MEP engineering concepts, general contracting, and every major subcontractor trade.

Answer structure for technical questions:
1) Recommendation
2) Steps / sequence
3) Standards or code references (cite IRC/NEC/IPC section IDs when from knowledge library — say "verify with AHJ")
4) Risks and common mistakes
5) When to confirm with licensed architect, engineer, or inspector

Rules:
- Prefer project documents and retrieved knowledge over free recall for code claims.
- Never invent bid amounts or structural capacities not in documents.
- For scope changes, analyze cross-trade impacts.
- Product advice: good/better/best with selection criteria, not fake SKUs.
- You cannot stamp plans, pull permits, or sign contracts — remind user when stakes are high.`;

export async function buildConstructionContext(
  env: ConstructionEnv,
  userMessage?: string,
): Promise<{ context: string; briefing: string }> {
  const project = await loadConstructionProject(env);
  const docs = await loadConstructionDocuments(env);
  const recs = (await loadConstructionRecommendations(env)).filter((r) => !r.dismissed);
  const spent = sumInvoicedAmount(docs);
  const bids = docs.filter((d) => d.type === 'bid' || d.type === 'estimate');

  const chunks = retrieveKnowledgeChunks({
    query: userMessage ?? project.currentStage,
    currentStage: project.currentStage,
    limit: 8,
  });
  const knowledgeBlock = formatChunksForPrompt(chunks);

  const recentDocs = docs
    .slice(-8)
    .map(
      (d) =>
        `- [${d.type}] ${d.title}${d.amount ? ` $${d.amount}` : ''}: ${d.extractedSummary.slice(0, 400)}`,
    )
    .join('\n');

  const briefing = [
    `Stage: ${project.currentStage}`,
    `Budget target: $${project.budgetTarget.toLocaleString()} | Invoiced to date: $${spent.toLocaleString()}`,
    bids.length ? `${bids.length} bid(s)/estimate(s) on file — compare before committing.` : '',
    recs[0] ? `Top recommendation: ${recs[0]!.title}` : 'No open foreman recommendations.',
  ]
    .filter(Boolean)
    .join(' ');

  const context = [
    `Project: ${project.name} — ${project.address}`,
    `Jurisdiction: ${project.jurisdiction}`,
    `Type: ${project.projectType ?? 'SFH'} | Stage: ${project.currentStage}`,
    project.scopeNotes ? `Scope notes: ${project.scopeNotes}` : '',
    `Budget: target $${project.budgetTarget} | invoiced $${spent}`,
    `Documents: ${docs.length} total`,
    recentDocs ? `Recent documents:\n${recentDocs}` : 'No documents uploaded yet.',
    recs.length
      ? `Open recommendations:\n${recs
          .slice(0, 5)
          .map((r) => `- [${r.priority}] ${r.title}: ${r.body.slice(0, 200)}`)
          .join('\n')}`
      : '',
    `--- Knowledge library (use for code/method claims) ---\n${knowledgeBlock}`,
    briefing,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { context, briefing };
}
