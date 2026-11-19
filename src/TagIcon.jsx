import { MetalIcon } from "./MetalIcon";

// Іконка мітки: стандартні емодзі 4 типових міток → металеві гліфи; власні мітки лишають свій емодзі.
const DEFAULT_TAG_GLYPH = { exam: ["🚨", "warn"], check: ["🔍", "search"], first: ["⭐", "star"], debt: ["💸", "coin"] };
export function TagIcon({ tag, size = 14 }) {
  const d = tag && DEFAULT_TAG_GLYPH[tag.id];
  if (d && tag.icon === d[0]) return <MetalIcon name={d[1]} size={size}/>;
  return <>{tag?.icon}</>;
}
