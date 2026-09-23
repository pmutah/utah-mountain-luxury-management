import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { morningBriefing } from '../lib/luxury';
import type { PortfolioData } from '../lib/api';

export function MorningLine({ data }: { data: PortfolioData }) {
  const [line, setLine] = useState(() => morningBriefing(data));

  useEffect(() => {
    setLine(morningBriefing(data));
    let cancelled = false;
    api
      .getBriefing(data.month)
      .then((result) => {
        if (!cancelled && result.line) setLine(result.line);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data]);

  return <p className="font-display text-3xl sm:text-4xl leading-snug mt-3 max-w-3xl">{line}</p>;
}
