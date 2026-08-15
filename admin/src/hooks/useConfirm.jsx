import { useCallback, useState } from "react";
import Modal from "../components/Modal.jsx";

/**
 * Returns [confirm, dialog]. Call `await confirm("message")` (or with options)
 * from an event handler; render `{dialog}` once in the component's JSX.
 */
export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({ message, resolve, ...options });
    });
  }, []);

  function respond(result) {
    state.resolve(result);
    setState(null);
  }

  if (!state) return [confirm, null];

  const {
    message,
    title = "Please confirm",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = state;

  const dialog = (
    <Modal
      title={title}
      size="sm"
      onClose={() => respond(false)}
      footer={
        <>
          <button className="btn" onClick={() => respond(false)}>{cancelLabel}</button>
          <button className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={() => respond(true)}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14 }}>{message}</p>
    </Modal>
  );

  return [confirm, dialog];
}
