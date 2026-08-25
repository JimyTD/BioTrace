import { useState } from "react";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { MeSubHead } from "../components/MeSubHead";
import { applyTheme, getActiveTheme, THEME_IDS, type ThemeId } from "../themes";

function themeLabel(id: ThemeId) {
  const key = `theme.${id}` as MessageKey;
  return hasMessage(key) ? t(key) : id;
}

function themeHint(id: ThemeId) {
  const key = `theme.${id}Hint` as MessageKey;
  return hasMessage(key) ? t(key) : null;
}

export default function MeAppearancePage() {
  const [current, setCurrent] = useState<ThemeId>(getActiveTheme);

  function pick(id: ThemeId) {
    applyTheme(id);
    setCurrent(id);
  }

  return (
    <div className="stack page-me">
      <MeSubHead title={t("me.appearance")} />
      <p className="lede">{t("me.appearanceLede")}</p>
      <div className="me-menu">
        {THEME_IDS.map((id) => {
          const on = id === current;
          const hint = themeHint(id);
          return (
            <button
              key={id}
              type="button"
              className="me-row theme-row"
              aria-pressed={on}
              onClick={() => pick(id)}
            >
              <span className="theme-row-main">
                <span>{themeLabel(id)}</span>
                {hint ? <span className="theme-row-hint">{hint}</span> : null}
              </span>
              <span className="me-row-side">
                {on ? <span className="muted">{t("me.appearanceOn")}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
