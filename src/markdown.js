import { escape as esc } from "./ui.js";
// A small safe reading view; raw HTML is always displayed as text.
function inline(text) {
  const tokens = [];
  const token = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, code) =>
    token(`<code>${esc(code)}</code>`),
  );
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
    token(
      `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`,
    ),
  );
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[+i] || "");
}
export function markdown(text) {
  const out = [];
  let code = null,
    list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const line of text.replaceAll("\r", "").split("\n")) {
    if (line.startsWith("```")) {
      closeList();
      if (code !== null) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = null;
      } else code = [];
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/),
      item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if (item) {
      const kind = item[1] ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        list = kind;
        out.push(`<${kind}>`);
      }
      out.push(`<li>${inline(item[2])}</li>`);
      continue;
    }
    closeList();
    if (heading)
      out.push(
        `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`,
      );
    else if (line.startsWith("> "))
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    else out.push("<br>");
  }
  closeList();
  if (code !== null)
    out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  return out.join("") || '<p class="muted">Start writing to see a preview.</p>';
}
