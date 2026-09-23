export type ThemeChoice = 'noir' | 'snow' | 'auto';

/** Approximate sunset hour in Park City, by month (0 = January). */
const PARK_CITY_SUNSET_HOUR = [17, 18, 19, 20, 20, 21, 21, 20, 19, 18, 17, 17];

export function resolveTheme(choice: ThemeChoice, now = new Date()): 'noir' | 'snow' {
  if (choice === 'noir' || choice === 'snow') return choice;
  const hour = now.getHours();
  const sunset = PARK_CITY_SUNSET_HOUR[now.getMonth()] ?? 19;
  return hour >= sunset || hour < 6 ? 'noir' : 'snow';
}

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem('uml-theme');
    if (value === 'noir' || value === 'snow' || value === 'auto') return value;
  } catch {
    /* private mode */
  }
  return 'noir';
}

export function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeChoice = choice;
  try {
    localStorage.setItem('uml-theme', choice);
  } catch {
    /* ignore */
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'snow' ? '#f6f3ec' : '#07110f');
  return resolved;
}

export function cycleTheme(choice: ThemeChoice): ThemeChoice {
  if (choice === 'noir') return 'snow';
  if (choice === 'snow') return 'auto';
  return 'noir';
}

export function themeLabel(choice: ThemeChoice, resolved: 'noir' | 'snow') {
  if (choice === 'auto') return resolved === 'snow' ? 'Auto · day' : 'Auto · night';
  return resolved === 'snow' ? 'Snowfield' : 'Alpine Noir';
}
