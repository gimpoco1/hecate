import { t, useAppTranslation } from "../i18n";
export function AccountLoadingScreen({ visible }: { visible: boolean }) {
  useAppTranslation();
  return (
    <div
      className={`account-loading-screen${visible ? " account-loading-screen--visible" : ""}`}
      aria-hidden={!visible}
      role={visible ? "status" : undefined}
      aria-live={visible ? "polite" : undefined}
    >
      <div className="account-loading-screen__artwork" aria-hidden="true">
        <img src="/icon.svg" alt="" />
      </div>
      <div className="account-loading-screen__copy">
        <strong>{t("Loading your map…")}</strong>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
