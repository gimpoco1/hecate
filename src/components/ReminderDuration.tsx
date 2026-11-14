import { t, useAppTranslation } from "../i18n";
import { errorHaptic, selectionHaptic } from "../haptics";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  description: string;
  value: number;
  options: readonly number[];
  disabled: boolean;
  onChange: (minutes: number) => string | null | Promise<string | null>;
};

export function ReminderDuration({ title, description, value, options, disabled, onChange }: Props) {
  useAppTranslation();
  const id = useId();
  const picker = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        className="streak-reminder-time"
        aria-label={t("Change {{value0}}, {{value1}} minutes", { value0: title.toLowerCase(), value1: value })}
        aria-haspopup="dialog"
        popoverTarget={id}
        disabled={disabled || pending}
        onClick={() => setError("")}
      >{t("{{value0}} minutes", { value0: value })}</button>
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
          <p>{description}</p>
          <div className="reminder-duration-options" role="group" aria-label={t("Duration")}>
            {options.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={value === minutes}
                disabled={disabled || pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    const message = await onChange(minutes);
                    setError(message ?? "");
                    if (message) errorHaptic();
                    else { selectionHaptic(); picker.current?.hidePopover(); }
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : String(failure));
                    errorHaptic();
                  } finally { setPending(false); }
                }}
              >{t("{{value0}} minutes", { value0: minutes })}</button>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="streak-time-picker__actions">
            <button type="button" popoverTarget={id} popoverTargetAction="hide">{t("Cancel")}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
