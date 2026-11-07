/** A failed construction read. An empty project file is a different case. */
export function constructionListUnreadable(message: string): boolean {
  return /could not be read|limit exceeded|storage writes are paused|storage reads are paused|error code:\s*1101/i.test(
    message,
  );
}

/** Shown instead of an empty construction file list. Nothing is uploaded. */
export function constructionDocsUnreadLine(): string {
  return 'Saved construction documents could not be read. This page is not using an empty project file. Nothing was written over them.';
}

/** Shown instead of a zero partner balance. Nothing is logged. */
export function partnerSpendUnreadLine(): string {
  return 'Saved construction bills could not be read. This page is not using an empty partner list. Nothing was written over them. Nothing was logged.';
}

/** Shown when the construction project record itself could not be read. */
export function constructionProjectUnreadLine(): string {
  return 'The construction project could not be read. This page is not using a blank project. Nothing was written over it.';
}
