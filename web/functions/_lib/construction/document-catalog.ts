import type { ConstructionDocument } from './types';

const MAX_CATALOG_CHARS = 10000;
const LINE_SUMMARY_MAX = 120;

export function oneLineSummary(doc: ConstructionDocument): string {
  const first = doc.extractedSummary.replace(/\s+/g, ' ').trim();
  return first.length > LINE_SUMMARY_MAX ? `${first.slice(0, LINE_SUMMARY_MAX)}…` : first;
}

export function formatDocumentCatalogLine(doc: ConstructionDocument): string {
  const parts = [
    `id=${doc.id}`,
    `type=${doc.type}`,
    `"${doc.title}"`,
    doc.vendor ? `vendor=${doc.vendor}` : '',
    doc.amount != null ? `$${doc.amount}` : '',
    doc.documentDate ? `date=${doc.documentDate}` : '',
    doc.trade ? `trade=${doc.trade}` : '',
    doc.storagePath ? 'file=yes' : 'file=no',
    `summary=${oneLineSummary(doc)}`,
  ].filter(Boolean);
  return `- ${parts.join(' | ')}`;
}

export function buildDocumentCatalog(docs: ConstructionDocument[]): string {
  if (docs.length === 0) {
    return 'No project documents uploaded. Ask the user to upload plans, bids, and invoices on the Construction tab.';
  }

  const sorted = [...docs].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );

  const lines: string[] = [];
  let chars = 0;
  let truncated = 0;

  for (const doc of sorted) {
    const line = formatDocumentCatalogLine(doc);
    if (chars + line.length > MAX_CATALOG_CHARS) {
      truncated++;
      continue;
    }
    lines.push(line);
    chars += line.length + 1;
  }

  const header = `Full document library (${docs.length} total). Use manage_construction.get_document(docId) for full extract, search_documents to find by keyword.`;
  const footer =
    truncated > 0
      ? `\n(${truncated} older document(s) omitted from catalog — use list_documents or search_documents.)`
      : '';
  return `${header}\n${lines.join('\n')}${footer}`;
}

export function searchConstructionDocuments(
  docs: ConstructionDocument[],
  query: string,
  limit = 15,
): ConstructionDocument[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return docs.slice(0, limit);

  const scored = docs.map((doc) => {
    const haystack = [
      doc.title,
      doc.type,
      doc.vendor ?? '',
      doc.trade ?? '',
      doc.extractedSummary,
      JSON.stringify(doc.extractedFields.lineItems ?? []),
      JSON.stringify(doc.extractedFields.trades ?? []),
      JSON.stringify(doc.extractedFields.openIssues ?? []),
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    for (const t of tokens) {
      if (haystack.includes(t)) score += 3;
    }
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.doc);
}

export function buildDocumentDigest(docs: ConstructionDocument[]): string {
  return docs
    .map(
      (d) =>
        `[${d.id}] ${d.type} ${d.title}: ${d.extractedSummary.slice(0, 800)}`,
    )
    .join('\n\n')
    .slice(0, 50000);
}
