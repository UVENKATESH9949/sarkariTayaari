import { EditIcon, TrashIcon } from "./icons.jsx";

/**
 * A titled table with an "Add" button and per-row edit/delete actions — the shape
 * repeated across Exam Guide's five cycle-scoped resource lists (dates, documents,
 * steps, mistakes, fees). Pulled out once these were the third near-identical copy of
 * ExamStructure.jsx's inline stage/paper/section table markup.
 *
 * @param columns [{ key, label, width?, render?(row) }] — `render` defaults to `row[key]`.
 */
export default function SectionTable({ title, description, addLabel = "Add", onAdd, columns, rows, rowKey, onEdit, onDelete, emptyLabel = "Nothing here yet." }) {
  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div className="page-header" style={{ marginBottom: description ? 4 : 12 }}>
        <h2 style={{ marginBottom: 0 }}>{title}</h2>
        {onAdd && (
          <button className="btn btn-sm btn-primary" onClick={onAdd}>
            {addLabel}
          </button>
        )}
      </div>
      {description && <p className="field-note" style={{ marginTop: 0, marginBottom: 12 }}>{description}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                  {col.label}
                </th>
              ))}
              {(onEdit || onDelete) && <th style={{ width: 90 }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
                {(onEdit || onDelete) && (
                  <td>
                    <div className="row-actions">
                      {onEdit && (
                        <button className="btn btn-ghost icon-btn" title="Edit" onClick={() => onEdit(row)}>
                          <EditIcon />
                        </button>
                      )}
                      {onDelete && (
                        <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => onDelete(row)}>
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1}>
                  <div className="empty-state">{emptyLabel}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
