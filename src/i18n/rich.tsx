import * as React from "react";

/**
 * Строка словаря с выделением <b>…</b> → React-узлы. Поддерживается только <b>:
 * этого хватает для пояснений и методики, а HTML из словаря не вставляется как есть.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(<b>[\s\S]*?<\/b>)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("<b>") && part.endsWith("</b>") ? <b key={i}>{part.slice(3, -4)}</b> : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  );
}
