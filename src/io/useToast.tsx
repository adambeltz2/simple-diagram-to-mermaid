import { useCallback, useRef, useState } from 'react';

export interface Notice {
  msg: string;
  undo?: boolean;
}

/** One small transient message per workspace; `flash(msg, true)` adds an Undo button. */
export function useToast() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef(0);
  const flash = useCallback((msg: string, undo = false) => {
    setNotice({ msg, undo });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 6000);
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  return { notice, flash, clear };
}

export function Toast({ notice, onUndo }: { notice: Notice | null; onUndo?: () => void }) {
  if (!notice) return null;
  return (
    <div className="toast" role="status">
      <span>{notice.msg}</span>
      {notice.undo && onUndo && <button onClick={onUndo}>Undo</button>}
    </div>
  );
}
