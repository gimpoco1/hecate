import { createPortal } from "react-dom";
import { useId, useRef, useState } from "react";

type Props = {
  value: string;
  title: string;
  disabled: boolean;
  onChange: (time: string) => string | null;
};

export function   ReminderTime({ value, title, disabled, onChange }: Props) {
  const id = useId();
  const picker = useRef<HTMLDivElement>(null);
  const [hour, setHour] = useState(value.slice(0, 2));
  const [minute, setMinute] = useState(value.slice(3, 5));
  const [error, setError] = useState("");
  const formatted = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`2000-01-01T${value}:00`));

  return (
    <>
      <button
        type="button"
        className="streak-reminder-time"
        aria-label={`Change ${title.toLowerCase()}, ${formatted}`}
        aria-haspopup="dialog"
        popoverTarget={id}
        disabled={disabled}
        onClick={() => {
          setHour(value.slice(0, 2));
          setMinute(value.slice(3, 5));
          setError("");
        }}
      >
        {formatted}
      </button>
      {createPortal(<div
        ref={picker}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        className="streak-time-picker"
        onToggle={(event) => {
          if (event.newState !== "open") return;
          for (const selected of event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button[aria-pressed="true"]',
          )) {
            const list = selected.parentElement;
            if (!list) throw new Error("Reminder time option is missing its scroll list.");
            list.scrollTop += selected.getBoundingClientRect().top -
              list.getBoundingClientRect().top -
              (list.clientHeight - selected.offsetHeight) / 2;
          }
        }}
      >
        <h3 id={`${id}-title`}>{title}</h3>
        <p>Choose a time in your device’s local time.</p>
        <div className="streak-time-picker__columns">
          {[
            { label: "Hour", count: 24, selected: hour, select: setHour },
            { label: "Minute", count: 60, selected: minute, select: setMinute },
          ].map(({ label, count, selected, select }) => (
            <div key={label}>
              <strong>{label}</strong>
              <div className="streak-time-picker__options" role="group" aria-label={label}>
                {Array.from({ length: count }, (_, index) => {
                  const option = String(index).padStart(2, "0");
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-label={`${label} ${option}`}
                      aria-pressed={selected === option}
                      onClick={() => select(option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="streak-time-picker__actions">
          <button type="button" popoverTarget={id} popoverTargetAction="hide">Cancel</button>
          <button
            type="button"
            onClick={() => {
              const message = onChange(`${hour}:${minute}`);
              setError(message ?? "");
              if (!message) picker.current?.hidePopover();
            }}
          >
            Save time
          </button>
        </div>
      </div>, document.body)}
    </>
  );
}
