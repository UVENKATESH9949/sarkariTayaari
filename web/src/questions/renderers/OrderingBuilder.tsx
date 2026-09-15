export type OrderingItem = { key: string; label: string };

/**
 * ORDERING's renderer — click an item in the pool to append it to "Your order"; click an
 * item already in "Your order" to send it back to the pool. Ports mobile's tap-to-append
 * OrderingBuilder.tsx directly, no drag handle needed.
 */
export function OrderingBuilder({
  items,
  order,
  onToggle,
  disabled,
  correctOrder,
}: {
  /** Every item, already shuffled by the caller. */
  items: OrderingItem[];
  order: string[];
  onToggle?: (key: string) => void;
  disabled?: boolean;
  /** Present = reveal (Practice). Absent = blind (Mock Test). */
  correctOrder?: string[] | null;
}) {
  const revealed = correctOrder != null;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const poolKeys = items.map((item) => item.key).filter((key) => !order.includes(key));

  return (
    <div className="ordering">
      <div className="ordering-section">
        <span className="field-label">Your order</span>
        <div className="ordering-list">
          {order.length === 0 && <p className="subtle">Tap items below to build your answer.</p>}
          {order.map((key, index) => {
            const item = byKey.get(key);
            if (!item) return null;
            const isCorrect = revealed && correctOrder?.[index] === key;
            const isWrong = revealed && !isCorrect;
            return (
              <button
                type="button"
                key={key}
                className={`ordering-item ${isCorrect ? "option-correct" : ""} ${isWrong ? "option-wrong" : ""}`}
                onClick={() => onToggle?.(key)}
                disabled={disabled || !onToggle}
              >
                <span className="match-badge">{index + 1}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!revealed && (
        <div className="ordering-section">
          <span className="field-label">Available items</span>
          <div className="ordering-list">
            {poolKeys.map((key) => {
              const item = byKey.get(key);
              if (!item) return null;
              return (
                <button
                  type="button"
                  key={key}
                  className="ordering-item"
                  onClick={() => onToggle?.(key)}
                  disabled={disabled || !onToggle}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
