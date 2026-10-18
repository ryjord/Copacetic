'use client';

import { Minus, Square, X } from 'lucide-react';
import { send } from '@/lib/bridge';

/** Only drawn off macOS. */
export function WindowControls() {
  return (
    <div className="no-drag ml-1 flex items-center">
      <ControlButton label="Minimise" onClick={() => send((api) => api.window.minimize())}>
        <Minus size={13} />
      </ControlButton>
      <ControlButton label="Maximise" onClick={() => send((api) => api.window.toggleMaximize())}>
        <Square size={11} />
      </ControlButton>
      <ControlButton label="Close window" isClose onClick={() => send((api) => api.window.close())}>
        <X size={13} />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  isClose,
  onClick,
  children,
}: {
  label: string;
  isClose?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-8 w-11 place-items-center text-ink-dim transition-colors ${
        isClose ? 'hover:bg-alert hover:text-void' : 'hover:bg-hover hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
