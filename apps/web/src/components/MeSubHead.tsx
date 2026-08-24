import { Link, useNavigate } from "react-router-dom";
import { t } from "@biotrace/messages";
import { useBackClose } from "../androidBack";

export function MeSubHead({ title }: { title: string }) {
  const navigate = useNavigate();
  useBackClose(() => navigate("/me"));
  return (
    <header className="page-head me-sub-head">
      <Link className="text-link" to="/me">
        ← {t("me.back")}
      </Link>
      <h1 className="page-title">{title}</h1>
    </header>
  );
}
