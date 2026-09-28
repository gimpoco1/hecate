export function AccountLoadingScreen({ visible }: { visible: boolean }) {
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
        <span>Your map is returning</span>
        <strong>Gathering your discoveries.</strong>
        <p>Routes, cities, and milestones are finding their place.</p>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
