import { houseFaq, reviewSummary, reviewsFor } from '../lib/guest-content';
import type { HouseId } from '../lib/market/types';

/**
 * What past guests said, on the house page.
 *
 * The reviews are a curated, owner-approved list in `guest-content.ts`, and that list is empty today. **An empty list renders
 * nothing at all** — no heading, no "be the first to review" placeholder dressed up as social proof. A house that has not hosted
 * anyone yet says nothing about reviews rather than implying it has.
 */
export function HouseReviews({ house }: { house: HouseId }) {
  const reviews = reviewsFor(house);
  if (reviews.length === 0) return null;
  return (
    <section className="mt-8" data-bot="house-reviews">
      <p className="uml-kicker">What guests said</p>
      <p className="mt-1 text-sm text-[var(--uml-muted)]" data-bot="house-review-summary">
        {reviewSummary(reviews)}
      </p>
      <ul className="mt-3 space-y-4">
        {reviews.map((review) => (
          <li key={`${review.who}-${review.when}`} className="uml-panel rounded-2xl p-4" data-bot="house-review">
            <p className="text-sm">
              {review.text}
            </p>
            <p className="mt-2 text-xs text-[var(--uml-muted)]">
              {review.who} · {review.when} · {review.source}
              {typeof review.rating === 'number' ? ` · ${review.rating} of 5` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The questions a guest actually asks, with answers built from this house's own published facts.
 *
 * A `<details>` element rather than a scripted accordion: it opens with no JavaScript, it is keyboard-accessible by default, a
 * screen reader announces it as a disclosure, and the answer text is in the HTML for a search engine to index.
 */
export function HouseFaq({ house }: { house: HouseId }) {
  const rows = houseFaq(house);
  if (rows.length === 0) return null;
  return (
    <section className="mt-8" data-bot="house-faq">
      <p className="uml-kicker">Before you book</p>
      <dl className="mt-3 space-y-2">
        {rows.map((row) => (
          <details key={row.question} className="uml-panel rounded-2xl px-4 py-3" data-bot="house-faq-row">
            <summary className="cursor-pointer text-sm font-semibold">{row.question}</summary>
            <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="house-faq-answer">
              {row.answer}
            </p>
          </details>
        ))}
      </dl>
    </section>
  );
}
