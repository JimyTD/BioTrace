import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";

export function MeSubHead({ title }: { title: string }) {
  return (
    <header className="me-sub-head">
      <Link className="text-link" to="/me">
        ← {t("me.back")}
      </Link>
      <h1 className="page-title">{title}</h1>
    </header>
  );
}
