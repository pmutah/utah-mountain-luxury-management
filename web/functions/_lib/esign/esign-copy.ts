export function esignEmailSubject(documentTitle: string): string {
  return `Utah Mountain Luxury e-sign: ${documentTitle}`;
}

export function esignEmailBody(input: {
  signerName: string;
  documentTitle: string;
  link: string;
  notes?: string;
}): string {
  const name = input.signerName.trim() || 'there';
  const notes = input.notes?.trim()
    ? `\n\nNote from Utah Mountain Luxury:\n${input.notes.trim()}\n`
    : '';
  return [
    `Hi ${name},`,
    '',
    `Your Utah Mountain Luxury e-sign document is ready: ${input.documentTitle}`,
    '',
    'Review the document, agree to electronic signature consent, and sign using this link:',
    input.link,
    notes,
    'This link is only for you. If you did not expect this, contact utahmountainluxury@gmail.com.',
    '',
    'Utah Mountain Luxury Management',
  ].join('\n');
}

export function esignSmsBody(input: { signerName: string; documentTitle: string; link: string }): string {
  const first = input.signerName.trim().split(/\s+/)[0] || 'there';
  return `${first} — Utah Mountain Luxury: please review and e-sign ${input.documentTitle}: ${input.link}`;
}
