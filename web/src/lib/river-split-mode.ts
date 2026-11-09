import type { RiverUnitId } from './river-units';

/**
 * What the host's split mode does to a decision.
 *
 * The route parsed `mode` and echoed it back without letting it change anything, so a host who set the house to
 * suggest-only, or turned splitting off, got exactly the same answer. A setting that changes nothing is worse than no
 * setting: it reads as consent to a behaviour that will happen regardless.
 *
 * Three modes, and each one means something on the answer:
 *
 *   `auto`         - the engine's choice stands, and the host is told to act on it.
 *   `suggest-only` - the same answer, but it is advice: the card says so and nothing acts on it.
 *   `off`          - the house is not split at all. The engine's comparison is still reported, because hiding the money
 *                    would leave the host unable to see what the setting costs them, but the choice is overridden to
 *                    whole with `overridden: true`.
 */

export type SplitMode = 'auto' | 'suggest-only' | 'off';

export type SplitChoice = 'whole' | 'split' | 'both';

export type AppliedSplit = {
  /** The choice that applies after the mode. */
  choice: SplitChoice;
  /** The units that may be offered. Empty when the mode forbids splitting. */
  units: RiverUnitId[];
  /** True when the mode changed what the engine chose. */
  overridden: boolean;
  /** What the engine chose, kept so the host can see what the mode is overriding. */
  engineChoice: SplitChoice;
  /** One line naming the mode's effect, or null when it changed nothing. */
  modeLine: string | null;
};

export const SPLIT_MODES: readonly SplitMode[] = ['auto', 'suggest-only', 'off'];

export function readSplitMode(value: unknown): SplitMode {
  return typeof value === 'string' && (SPLIT_MODES as readonly string[]).includes(value)
    ? (value as SplitMode)
    : 'auto';
}

/**
 * Apply the host's mode to the engine's answer.
 *
 * Deliberately total: every mode on every engine choice has a defined result, because "the mode did not cover this case"
 * is how a setting ends up doing nothing for the one range that mattered.
 */
export function applySplitMode(
  engine: { choice: SplitChoice; units: readonly RiverUnitId[] },
  mode: SplitMode,
): AppliedSplit {
  if (mode === 'off') {
    // Off means the house is never offered in parts, whatever the arithmetic said.
    if (engine.choice === 'whole' && engine.units.length === 0) {
      return {
        choice: 'whole',
        units: [],
        overridden: false,
        engineChoice: engine.choice,
        modeLine: null,
      };
    }
    return {
      choice: 'whole',
      units: [],
      overridden: true,
      engineChoice: engine.choice,
      modeLine:
        'Splitting is turned off for this house, so the parts are not offered even where they would have paid more. The comparison above is what the setting costs on this range.',
    };
  }
  if (mode === 'suggest-only') {
    return {
      choice: engine.choice,
      units: [...engine.units],
      overridden: false,
      engineChoice: engine.choice,
      modeLine:
        'Suggest only: this is advice. Nothing offers the parts or blocks a night until you act on it, and the house is not split on its own.',
    };
  }
  return {
    choice: engine.choice,
    units: [...engine.units],
    overridden: false,
    engineChoice: engine.choice,
    modeLine: null,
  };
}
