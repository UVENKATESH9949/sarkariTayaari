import { useState } from "react";

export type MatchItem = { key: string; label: string };

/**
 * MATCH's renderer — click a left item to select it, then click a right item to pair them;
 * both get the same numbered badge. Clicking an already-selected left item deselects it
 * without changing its existing pairing; clicking a left item that already has a pairing
 * re-selects it so the next right click replaces that pairing.
 *
 * Ports mobile's MatchPairing.tsx tap-to-pair interaction directly to click — the same
 * component was deliberately built without a gesture/drag dependency on mobile precisely so
 * it would need no rework here.
 */
export function MatchPairing({
  leftItems,
  rightItems,
  mapping,
  onPair,
  disabled,
  correctMapping,
}: {
  leftItems: MatchItem[];
  /** Already shuffled by the caller. */
  rightItems: MatchItem[];
  mapping: Record<string, string>;
  onPair?: (leftKey: string, rightKey: string) => void;
  disabled?: boolean;
  /** Present = reveal (Practice). Absent = blind (Mock Test). */
  correctMapping?: Record<string, string> | null;
}) {
  const [activeLeftKey, setActiveLeftKey] = useState<string | null>(null);
  const revealed = correctMapping != null;

  const badgeByLeftKey = new Map<string, number>();
  let nextBadge = 1;
  for (const item of leftItems) {
    if (mapping[item.key] !== undefined) badgeByLeftKey.set(item.key, nextBadge++);
  }

  function handleLeftClick(key: string) {
    if (disabled || !onPair) return;
    setActiveLeftKey((current) => (current === key ? null : key));
  }

  function handleRightClick(rightKey: string) {
    if (disabled || !onPair || !activeLeftKey) return;
    onPair(activeLeftKey, rightKey);
    setActiveLeftKey(null);
  }

  function rightKeyPairedTo(leftKey: string): string | undefined {
    return mapping[leftKey];
  }

  return (
    <div className="match-grid">
      <div className="match-column">
        {leftItems.map((item) => {
          const badge = badgeByLeftKey.get(item.key);
          const isCorrect = revealed && correctMapping?.[item.key] === mapping[item.key] && mapping[item.key] !== undefined;
          const isWrong = revealed && mapping[item.key] !== undefined && !isCorrect;
          return (
            <button
              type="button"
              key={item.key}
              className={`match-item ${activeLeftKey === item.key ? "match-item-active" : ""} ${isCorrect ? "option-correct" : ""} ${isWrong ? "option-wrong" : ""}`}
              onClick={() => handleLeftClick(item.key)}
              disabled={disabled || !onPair}
            >
              {badge !== undefined && <span className="match-badge">{badge}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="match-column">
        {rightItems.map((item) => {
          const pairedLeft = leftItems.find((l) => rightKeyPairedTo(l.key) === item.key);
          const badge = pairedLeft ? badgeByLeftKey.get(pairedLeft.key) : undefined;
          const isCorrect = revealed && !!pairedLeft && correctMapping?.[pairedLeft.key] === item.key;
          const isWrong = revealed && !!pairedLeft && !isCorrect;
          return (
            <button
              type="button"
              key={item.key}
              className={`match-item ${isCorrect ? "option-correct" : ""} ${isWrong ? "option-wrong" : ""}`}
              onClick={() => handleRightClick(item.key)}
              disabled={disabled || !onPair}
            >
              {badge !== undefined && <span className="match-badge">{badge}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
