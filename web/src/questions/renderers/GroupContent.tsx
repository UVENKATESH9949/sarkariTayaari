import { useState } from "react";
import type { QuestionGroup } from "../types";

/**
 * A grouped question's shared content — a reading passage and/or attached media — rendered
 * above the question text, same placement as mobile's GroupContent.tsx. Practice has no
 * atomic-group guarantee (unlike Mock Test's group-aware pack), so a grouped question can
 * appear with none of its siblings adjacent; this renders whatever this one question's group
 * carries, independent of the rest of the current set.
 *
 * Media is a live third-party Cloudinary fetch on web — there is no mobile-style pre-download
 * to fall back to, so a slow or failed image load is just an ordinary broken-image state.
 */
export function GroupContent({ group, languageCode }: { group: QuestionGroup | null | undefined; languageCode: string }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!group) return null;

  const passage = group.passageByLanguage[languageCode] ?? Object.values(group.passageByLanguage)[0];

  return (
    <div className="group-content">
      {passage && (
        <div className="passage-card">
          <button type="button" className="passage-toggle" onClick={() => setCollapsed((c) => !c)}>
            <span>Passage</span>
            <span className="subtle">{collapsed ? "Show" : "Hide"}</span>
          </button>
          {!collapsed && <p className="passage-text">{passage}</p>}
        </div>
      )}
      {group.media.length > 0 && (
        <div className="group-media">
          {group.media
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((m) => (
              <img key={m.id} src={m.url} alt="" className="group-media-image" loading="lazy" />
            ))}
        </div>
      )}
    </div>
  );
}
