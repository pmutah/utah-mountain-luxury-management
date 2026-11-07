/** A failed document-list read. An empty folder is a different case. */
export function vaultListUnreadable(message: string): boolean {
  return /could not be read|limit exceeded|storage writes are paused|storage reads are paused|error code:\s*1101/i.test(message);
}

/** Shown instead of an empty folder. Nothing is stored or sent. */
export function vaultUnreadLine(): string {
  return 'Saved documents could not be read. This page is not using an empty folder, and it does not say whether mail or text is connected. Nothing was written over them. Nothing is sent.';
}
