import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import licenseText from "../LICENSE?raw";

export const LICENSE_WAIT_SECONDS = 5;
export const LICENSE_ACCEPTANCE_VERSION = "LSAL-0.1";
export const LICENSE_ACCEPTANCE_STORAGE_KEY = "labwatchboard:license-acceptance";

function hasStoredLicenseAcceptance() {
  try {
    return window.localStorage.getItem(LICENSE_ACCEPTANCE_STORAGE_KEY) === LICENSE_ACCEPTANCE_VERSION;
  } catch {
    return false;
  }
}

function storeLicenseAcceptance() {
  try {
    window.localStorage.setItem(LICENSE_ACCEPTANCE_STORAGE_KEY, LICENSE_ACCEPTANCE_VERSION);
  } catch {
    // Storage can be unavailable in hardened browser contexts; the current session may still continue.
  }
}

export function canAcceptLicense(
  hasReachedEnd: boolean,
  secondsRemaining: number,
  hasAcceptedResponsibility: boolean,
) {
  return hasReachedEnd && secondsRemaining === 0 && hasAcceptedResponsibility;
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(hasStoredLicenseAcceptance);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [hasAcceptedResponsibility, setHasAcceptedResponsibility] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(LICENSE_WAIT_SECONDS);
  const unlockAtRef = useRef(Date.now() + LICENSE_WAIT_SECONDS * 1000);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((unlockAtRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(timer);
  }, []);

  const handleLicenseScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight <= 2) {
      setHasReachedEnd(true);
    }
  };

  if (accepted) return children;

  const canAccept = canAcceptLicense(hasReachedEnd, secondsRemaining, hasAcceptedResponsibility);
  const buttonLabel = secondsRemaining > 0
    ? `请等待 ${secondsRemaining} 秒`
    : !hasReachedEnd
      ? "请滚动至协议底部"
      : hasAcceptedResponsibility
        ? "我已阅读并同意"
        : "请勾选责任确认";

  return (
    <main className="license-gate" aria-label="许可协议确认">
      <section
        className="license-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="license-title"
        aria-describedby="license-instructions"
      >
        <header className="license-dialog-header">
          <div>
            <p className="license-eyebrow">使用前必须确认</p>
            <h1 id="license-title">LICENSE 许可协议</h1>
          </div>
          <span className="license-version">LSAL 0.1</span>
        </header>

        <p id="license-instructions" className="license-instructions">
          请阅读并滚动至协议底部。页面开启 5 秒后，还需勾选责任确认方可继续。
        </p>

        <div
          className="license-document"
          data-testid="license-document"
          onScroll={handleLicenseScroll}
          tabIndex={0}
          aria-label="LICENSE 协议全文，可滚动"
        >
          <pre>{licenseText}</pre>
          <div className="license-document-end" aria-label="协议已到底部">
            —— LICENSE 全文结束 ——
          </div>
        </div>

        <footer className="license-dialog-footer">
          <span className={hasReachedEnd ? "license-status license-status-ready" : "license-status"}>
            {hasReachedEnd ? "已滚动至底部" : "尚未滚动至底部"}
          </span>
          <div className="license-confirm-actions">
            <label className="license-responsibility-confirmation">
              <input
                type="checkbox"
                checked={hasAcceptedResponsibility}
                onChange={(event) => setHasAcceptedResponsibility(event.target.checked)}
              />
              <span>本人已阅读授权，愿意承担一切责任，与开发者无关</span>
            </label>
            <button
              type="button"
              className="license-accept-button"
              disabled={!canAccept}
              onClick={() => {
                if (canAccept) {
                  storeLicenseAcceptance();
                  setAccepted(true);
                }
              }}
            >
              {buttonLabel}
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
