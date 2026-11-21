import { useCallback, useRef, useState } from 'react';

export interface Notice {
  msg: string;
  /** shows an Undo button that runs this */
  onUndo?: () => void;
}

/** One small transient message per workspace. */
export function useToast() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef(0);
  const flash = useCallback((msg: string, onUndo?: () => void) => {
    setNotice({ msg, onUndo });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 7000);
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  return { notice, flash, clear };
}

export function Toast({ notice, clear }: { notice: Notice | null; clear: () => void }) {
  if (!notice) return null;
  const undo = notice.onUndo;
  return (
    <div className="toast" role="status">
      <span>{notice.msg}</span>
      {undo && (
        <button
          onClick={() => {
            clear();
            undo();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
