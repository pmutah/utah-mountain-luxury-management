const SECRET = /door\s*code|wi-?fi|password/i;
const CANYON = /provo canyon|vivian park/i;

/** Where Nora should place this house. The line uses the published address and arrival note. */
export function conciergePlaceBrief(address: string, arrival: string): { where: string; drive: string } {
  const street = address.trim();
  const getting = arrival.trim();
  const published = `${street} ${getting}`;
  if (!street || !getting || published.includes('$') || SECRET.test(published)) {
    return {
      where: 'Use the published address and the published arrival note. If they say Hebrew, they mean Heber.',
      drive: 'Say how long the drive is from the published address.',
    };
  }
  const canyon = CANYON.test(published);
  const where = canyon
    ? `This house is at ${street}. ${getting} Heber and Midway are up the canyon from this house. Provo and Orem are down the canyon. A Provo restaurant is not in Heber. If they say Hebrew, they mean Heber.`
    : `This house is at ${street}. ${getting} A Provo restaurant is not in Heber. If they say Hebrew, they mean Heber.`;
  const drive = canyon
    ? 'Say how long the drive is from this house and whether it is up the canyon, down the canyon, or over toward Park City.'
    : 'Say how long the drive is from this house in Lindon. Provo Canyon is a drive from here.';
  return { where, drive };
}

/** The line Nora shows before a question. Ranch and Lindon stay in Lindon. The River House stays in the canyon. */
export function conciergeIntro(address: string, arrival: string): string {
  const published = `${address} ${arrival}`;
  const place = CANYON.test(published) ? 'the canyon' : 'Lindon';
  const line = `Ask about the house, dinner, ${place}, or anything you need during your stay.`;
  if (published.includes('$') || SECRET.test(published) || line.includes('$')) {
    return 'Ask about the house, dinner, or anything you need during your stay.';
  }
  return line;
}
