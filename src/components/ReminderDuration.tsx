import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  value: number;
  options: readonly number[];
  disabled: boolean;
  onChange: (minutes: number) => string | null;
};

export function ReminderDuration({ title, value, options, disabled, onChange }: Props) {
  const id = useId();
  const picker = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  return (
    <>
      <button
        type="button"
        className="streak-reminder-time"
        aria-label={`Change ${title.toLowerCase()}, ${value} minutes`}
        aria-haspopup="dialog"
        popoverTarget={id}
        disabled={disabled}
        onClick={() => setError("")}
      >
        {value} minutes
      </button>
      {createPortal(
        <div
          ref={picker}
          id={id}
          popover="auto"
          role="dialog"
          aria-labelledby={`${id}-title`}
          className="streak-time-picker"
        >
          <h3 id={`${id}-title`}>{title}</h3>
          <p>Choose how long Hecate waits before reminding you.</p>
          <div className="reminder-duration-options" role="group" aria-label="Duration">
            {options.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={value === minutes}
                onClick={() => {
                  const message = onChange(minutes);
                  setError(message ?? "");
                  if (!message) picker.current?.hidePopover();
                }}
              >
                {minutes} minutes
              </button>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="streak-time-picker__actions">
            <button type="button" popoverTarget={id} popoverTargetAction="hide">Cancel</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
