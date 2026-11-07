/**
 * The line above the removed-expenses list. It is counted from the rows on screen rather than taken
 * from the server response, because the two disagreed after a restore: the list emptied while the
 * line still said one expense could be restored.
 *
 * It never carries an amount, and it always says the rows are not in a total, so a host cannot read
 * the archive as a second ledger.
 */
export function archiveCountLine(count: number): string {
  if (!Number.isInteger(count) || count <= 0) {
    return 'Nothing has been removed, so there is nothing to restore.';
  }
  return count === 1
    ? '1 removed expense can be restored. It is not counted in any total while it sits here.'
    : `${count} removed expenses can be restored. They are not counted in any total while they sit here.`;
}
