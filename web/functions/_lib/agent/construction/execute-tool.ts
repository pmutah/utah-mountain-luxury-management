import {
  loadConstructionProject,
  saveConstructionProject,
  loadConstructionDocuments,
  getConstructionDocument,
  addConstructionDecision,
  addConstructionRecommendation,
  dismissConstructionRecommendation,
  sumInvoicedAmount,
} from '../../construction/construction-store';
import { searchConstructionDocuments } from '../../construction/document-catalog';
import {
  formatChunksForPrompt,
  retrieveKnowledgeChunks,
} from '../../construction/knowledge/knowledge-retrieval';
import type { ConstructionEnv, ConstructionToolStep } from '../../construction/types';

export async function executeConstructionTool(
  env: ConstructionEnv,
  name: string,
  args: Record<string, unknown>,
  lastUserMessage?: string,
): Promise<{ result: Record<string, unknown>; step: ConstructionToolStep }> {
  const action = String(args.action ?? '');
  switch (name) {
    case 'manage_construction':
      return {
        result: await handleManage(env, action, args),
        step: step(name, action),
      };
    case 'construction_advisor':
      return {
        result: await handleAdvisor(env, action, args, lastUserMessage),
        step: step(name, action),
      };
    default:
      return {
        result: { error: `Unknown tool: ${name}` },
        step: { tool: name, action, summary: 'Unknown' },
      };
  }
}

function step(tool: string, action: string): ConstructionToolStep {
  const labels: Record<string, string> = {
    get_project_summary: 'Project summary',
    update_project: 'Updating project',
    list_documents: 'Listing documents',
    search_documents: 'Searching documents',
    get_document: 'Loading document',
    compare_bids: 'Comparing bids',
    spend_summary: 'Spend summary',
    log_decision: 'Logging decision',
    recommend_next_steps: 'Next steps',
    advise_on_task: 'Method advice',
    code_guidance: 'Code guidance',
    value_engineering: 'Value engineering',
    product_recommendation: 'Product tiers',
    stage_review: 'Stage review',
    cross_trade_coordination: 'Cross-trade impacts',
    plan_discipline_review: 'Plan review',
    lookup_knowledge: 'Knowledge lookup',
    dismiss_recommendation: 'Dismiss recommendation',
  };
  return { tool, action, summary: labels[action] ?? `${tool}.${action}` };
}

async function handleManage(
  env: ConstructionEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const project = await loadConstructionProject(env);
  const docs = await loadConstructionDocuments(env);

  if (action === 'get_project_summary') {
    const spent = sumInvoicedAmount(docs);
    return {
      project,
      documentCount: docs.length,
      invoicedTotal: spent,
      budgetRemaining: project.budgetTarget - spent,
      bids: docs.filter((d) => d.type === 'bid' || d.type === 'estimate').length,
    };
  }

  if (action === 'update_project') {
    const updated = await saveConstructionProject(env, {
      ...project,
      name: args.name ? String(args.name) : project.name,
      address: args.address ? String(args.address) : project.address,
      currentStage: args.currentStage ? String(args.currentStage) : project.currentStage,
      budgetTarget:
        args.budgetTarget !== undefined ? Number(args.budgetTarget) : project.budgetTarget,
      scopeNotes: args.scopeNotes !== undefined ? String(args.scopeNotes) : project.scopeNotes,
      projectType: args.projectType ? String(args.projectType) : project.projectType,
    });
    return { ok: true, project: updated };
  }

  if (action === 'list_documents') {
    let list = docs;
    if (args.docType) list = list.filter((d) => d.type === args.docType);
    return {
      documents: list.slice(0, 30).map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        vendor: d.vendor,
        amount: d.amount,
        documentDate: d.documentDate,
        trade: d.trade,
        hasFile: Boolean(d.storagePath),
        summaryPreview: d.extractedSummary.slice(0, 200),
      })),
      count: list.length,
    };
  }

  if (action === 'search_documents') {
    const query = String(args.query ?? '');
    const matches = searchConstructionDocuments(docs, query, 20);
    return {
      query,
      count: matches.length,
      documents: matches.map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        vendor: d.vendor,
        amount: d.amount,
        summaryPreview: d.extractedSummary.slice(0, 300),
      })),
    };
  }

  if (action === 'get_document') {
    const doc = await getConstructionDocument(env, String(args.docId ?? ''));
    if (!doc) return { error: 'Not found' };
    const includeLineItems = args.includeLineItems !== false;
    return {
      document: {
        ...doc,
        extractedFields: includeLineItems
          ? doc.extractedFields
          : { ...doc.extractedFields, lineItems: undefined },
      },
    };
  }

  if (action === 'compare_bids') {
    const bids = docs.filter((d) => d.type === 'bid' || d.type === 'estimate');
    const ranked = bids
      .map((d) => ({
        id: d.id,
        title: d.title,
        vendor: d.vendor,
        amount: d.amount ?? 0,
        trade: d.trade,
        exclusions: d.extractedFields.exclusions ?? [],
        summary: d.extractedSummary.slice(0, 500),
      }))
      .sort((a, b) => a.amount - b.amount);
    return { bids: ranked, lowest: ranked[0] ?? null, highest: ranked[ranked.length - 1] ?? null };
  }

  if (action === 'spend_summary') {
    const invoices = docs.filter((d) => d.type === 'invoice');
    const byVendor: Record<string, number> = {};
    for (const inv of invoices) {
      const v = inv.vendor ?? 'Unknown';
      byVendor[v] = (byVendor[v] ?? 0) + (inv.amount ?? 0);
    }
    return { total: sumInvoicedAmount(docs), byVendor, invoiceCount: invoices.length };
  }

  if (action === 'log_decision') {
    const item = await addConstructionDecision(env, {
      date: new Date().toISOString().slice(0, 10),
      topic: String(args.topic ?? 'Decision'),
      decision: String(args.decision ?? ''),
      rationale: String(args.rationale ?? ''),
    });
    return { ok: true, decision: item };
  }

  return { error: `Unknown action: ${action}` };
}

async function handleAdvisor(
  env: ConstructionEnv,
  action: string,
  args: Record<string, unknown>,
  lastUserMessage?: string,
): Promise<Record<string, unknown>> {
  const project = await loadConstructionProject(env);
  const docs = await loadConstructionDocuments(env);
  const query =
    String(args.query ?? args.task ?? args.topic ?? args.changeDescription ?? lastUserMessage ?? '');

  if (action === 'lookup_knowledge') {
    const chunks = retrieveKnowledgeChunks({
      query,
      currentStage: project.currentStage,
      trade: args.trade ? String(args.trade) : undefined,
      limit: 10,
    });
    return { chunks: chunks.map((c) => ({ id: c.id, title: c.title, content: c.content })) };
  }

  if (action === 'dismiss_recommendation') {
    const ok = await dismissConstructionRecommendation(env, String(args.recommendationId ?? ''));
    return { ok };
  }

  if (action === 'recommend_next_steps') {
    const chunks = retrieveKnowledgeChunks({
      query: `${project.currentStage} sequence inspection`,
      currentStage: project.currentStage,
      limit: 5,
    });
    const steps = [
      `Confirm ${project.currentStage} inspection hold points with subs.`,
      `Review open bids/invoices against budget ($${project.budgetTarget} target).`,
      `Walk site for moisture, safety, and sequence conflicts.`,
    ];
    const rec = await addConstructionRecommendation(env, {
      stage: project.currentStage,
      priority: 'high',
      category: 'sequence',
      title: `Foreman: ${project.currentStage} priorities`,
      body: `${steps.join(' ')}\n\nReference:\n${formatChunksForPrompt(chunks).slice(0, 1500)}`,
    });
    return { recommendations: steps, saved: rec };
  }

  if (action === 'code_guidance') {
    const chunks = retrieveKnowledgeChunks({
      query: String(args.topic ?? query),
      limit: 6,
    });
    return {
      topic: args.topic ?? query,
      guidance: formatChunksForPrompt(chunks),
      note: 'Verify with Utah County / Lindon AHJ and your stamped plans.',
    };
  }

  if (action === 'value_engineering') {
    const bids = docs.filter((d) => d.type === 'bid' || d.type === 'estimate');
    const chunks = retrieveKnowledgeChunks({ query: 'value engineering savings alternates', limit: 3 });
    return {
      budgetTarget: project.budgetTarget,
      invoiced: sumInvoicedAmount(docs),
      bidCount: bids.length,
      strategies: formatChunksForPrompt(chunks),
      bidSpread:
        bids.length >= 2
          ? {
              low: Math.min(...bids.map((b) => b.amount ?? 0)),
              high: Math.max(...bids.map((b) => b.amount ?? 0)),
            }
          : null,
    };
  }

  if (action === 'product_recommendation') {
    const chunks = retrieveKnowledgeChunks({
      query: `materials ${args.category ?? ''} ${args.constraints ?? ''}`,
      limit: 4,
    });
    return {
      category: args.category ?? 'general',
      tiers: {
        good: 'Meets code and budget; shorter warranty or standard aesthetics.',
        better: 'Balance of durability and cost; preferred for owner-occupied or STR mid-tier.',
        best: 'Maximum durability and finish; best for high-traffic STR or long hold period.',
      },
      selectionCriteria: formatChunksForPrompt(chunks),
      constraints: args.constraints ?? null,
    };
  }

  if (action === 'stage_review') {
    const chunks = retrieveKnowledgeChunks({
      query: project.currentStage,
      currentStage: project.currentStage,
      limit: 6,
    });
    const stageDocs = docs.filter((d) => d.stage === project.currentStage || !d.stage);
    return {
      currentStage: project.currentStage,
      checklist: formatChunksForPrompt(chunks),
      documentsForStage: stageDocs.length,
      openIssues: stageDocs.flatMap((d) => d.extractedFields.openIssues ?? []).slice(0, 10),
    };
  }

  if (action === 'cross_trade_coordination') {
    const chunks = retrieveKnowledgeChunks({
      query: String(args.changeDescription ?? query),
      limit: 6,
    });
    return {
      change: args.changeDescription ?? query,
      impacts: formatChunksForPrompt(chunks),
      reminder: 'Update affected subs in writing; issue RFI to designer if plans change.',
    };
  }

  if (action === 'plan_discipline_review') {
    const plans = docs.filter((d) => d.type === 'plan' || d.type === 'engineering');
    const disciplines = plans.flatMap((p) => p.extractedFields.disciplines ?? []);
    const issues = plans.flatMap((p) => p.extractedFields.openIssues ?? []);
    return {
      planDocuments: plans.map((p) => ({ id: p.id, title: p.title, disciplines: p.extractedFields.disciplines })),
      disciplinesFound: [...new Set(disciplines)],
      openIssues: issues,
      note: plans.length === 0 ? 'Upload architectural/structural/MEP sheets for discipline review.' : undefined,
    };
  }

  if (action === 'advise_on_task') {
    const chunks = retrieveKnowledgeChunks({
      query: String(args.task ?? query),
      currentStage: project.currentStage,
      trade: args.trade ? String(args.trade) : undefined,
      limit: 8,
    });
    return {
      task: args.task ?? query,
      knowledge: formatChunksForPrompt(chunks),
      projectStage: project.currentStage,
    };
  }

  return { error: `Unknown action: ${action}` };
}
