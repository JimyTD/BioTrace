import { t, type MessageKey } from "@biotrace/messages";
import type { StatusTag } from "../api";

const LABEL: Record<StatusTag, MessageKey> = {
  extinct: "listTag.extinct",
  class_i: "listTag.class_i",
  class_ii: "listTag.class_ii",
  sanyou: "listTag.sanyou",
  introduced: "settle.alertIntroduced",
};

const HINT: Record<StatusTag, MessageKey> = {
  extinct: "listTag.extinct.hint",
  class_i: "listTag.class_i.hint",
  class_ii: "listTag.class_ii.hint",
  sanyou: "listTag.sanyou.hint",
  introduced: "settle.alertHint",
};

export function ListTagRow({ tags }: { tags?: StatusTag[] | null }) {
  if (!tags?.length) return null;
  return (
    <span className="list-tag-row">
      {tags.map((tag) => (
        <span
          key={tag}
          className={tag === "introduced" ? "intro-tag" : `list-tag list-tag-${tag}`}
          title={t(HINT[tag])}
        >
          {t(LABEL[tag])}
        </span>
      ))}
    </span>
  );
}
