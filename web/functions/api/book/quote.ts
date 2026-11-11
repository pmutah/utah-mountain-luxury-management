import { quoteWithTax } from '../../../src/lib/platform/guest-ops';
import { failSoft, jsonResponse } from '../../_lib/platform/http';

/**
 * A tax estimate for a stay the guest already has numbers for.
 * Public. It does not read the books, does not add the tax to the quoted stay, and does not charge.
 */
export const onRequestGet: PagesFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const lodging = Number(url.searchParams.get('lodging'));
    const cleaning = Number(url.searchParams.get('cleaning'));
    const pet = Number(url.searchParams.get('pet') ?? 0);
    if (!Number.isFinite(lodging) || !Number.isFinite(cleaning) || lodging < 0 || cleaning < 0) {
      return jsonResponse(request, { error: 'Send lodging and cleaning as numbers.' }, 400);
    }
    return jsonResponse(request, quoteWithTax({ lodging, cleaning, pet: Number.isFinite(pet) ? pet : 0 }));
  } catch (err) {
    return failSoft(request, err, 'Tax quote');
  }
};
