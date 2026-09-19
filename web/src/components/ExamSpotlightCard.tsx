import type { ReactNode } from "react";

/**
 * Home's browsing-row tile. Deliberately always dark inside (see `homeCategories.ts`'s own
 * comment on `categoryGlowHex` — the same "fixed regardless of site theme" exception the
 * design system already makes for hero/gradient cards, since the glow effect needs a dark
 * canvas to read correctly). Two real content states, never a fabricated third:
 *  - a real uploaded exam photo, shown full-bleed with a bottom gradient so the name stays
 *    legible over it — the actual photo the user asked to see inside the card;
 *  - no photo: an abstract glow (real category color) plus a watermark derived from the
 *    exam's own code (see `posterWatermark`) — never a placeholder image pretending to be one.
 */
export function ExamSpotlightCard({
  name,
  examCode,
  imageUrl,
  watermark,
  subtitle,
  accentHex,
  onClick,
}: {
  name: string;
  examCode: string;
  imageUrl?: string | null;
  watermark: string;
  subtitle: ReactNode;
  accentHex: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="exam-spotlight-card" onClick={onClick}>
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="" className="exam-spotlight-image" />
          <span className="exam-spotlight-image-overlay" aria-hidden="true" />
        </>
      ) : (
        <>
          <span
            className="exam-spotlight-glow"
            style={{ background: `radial-gradient(circle, ${accentHex}66, transparent 70%)` }}
            aria-hidden="true"
          />
          <span className="exam-spotlight-watermark" aria-hidden="true">
            {watermark}
          </span>
        </>
      )}
      <span className="exam-spotlight-code" style={{ borderColor: accentHex, color: accentHex }}>
        {examCode}
      </span>
      <div className="exam-spotlight-body">
        <div className="exam-spotlight-name">{name}</div>
        <div className="exam-spotlight-subtitle">{subtitle}</div>
      </div>
    </button>
  );
}
