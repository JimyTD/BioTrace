import { t, type MessageKey } from "@biotrace/messages";
import type { StatusTag } from "../api";

const LABEL: Record<StatusTag, MessageKey> = {
  extinct: "listTag.extinct",
  class_i: "listTag.class_i",
  class_ii: "listTag.class_ii",
  sanyou: "listTag.sanyou",
  introduced: "settle.alertIntroduced",
  domesticated: "listTag.domesticated",
};

const HINT: Record<StatusTag, MessageKey> = {
  extinct: "listTag.extinct.hint",
  class_i: "listTag.class_i.hint",
  class_ii: "listTag.class_ii.hint",
  sanyou: "listTag.sanyou.hint",
  introduced: "settle.alertHint",
  domesticated: "listTag.domesticated.hint",
};

export function ListTag({ tag, className }: { tag: StatusTag; className?: string }) {
  const base = tag === "introduced" ? "intro-tag" : `list-tag list-tag-${tag}`;
  return (
    <span className={className ? `${base} ${className}` : base} title={t(HINT[tag])}>
      {t(LABEL[tag])}
    </span>
  );
}

export function ListTagRow({
  tags,
  except,
}: {
  tags?: StatusTag[] | null;
  except?: StatusTag[];
}) {
  const shown = except?.length ? tags?.filter((tag) => !except.includes(tag)) : tags;
  if (!shown?.length) return null;
  return (
    <span className="list-tag-row">
      {shown.map((tag) => (
        <ListTag key={tag} tag={tag} />
      ))}
    </span>
  );
}
