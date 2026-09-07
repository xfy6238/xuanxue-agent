/** 轻量Markdown渲染：支持加粗、斜体、行内代码、无序列表、换行，其余原文展示。先转义HTML再替换，无XSS风险。 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STAR = String.fromCharCode(42);

function em(s: string): string {
  const n = s.split(STAR).length - 1;
  if (n < 2 || n % 2 !== 0) return s;
  const re = new RegExp("\\" + STAR + "([^" + STAR + "\n]+)\\" + STAR, "g");
  return s.replace(re, "<em>$1</em>");
}

function inline(s: string): string {
  let h = esc(s);
  const boldRe = new RegExp(
    "\\" + STAR + "\\" + STAR + "(.+?)\\" + STAR + "\\" + STAR,
    "g",
  );
  h = h.replace(boldRe, "<strong>$1</strong>");
  h = em(h);
  h = h.replace(/`([^`]+?)`/g, "<code>$1</code>");
  return h;
}

export default function Markdown({ text }: { text: string }) {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        `<ul>${list.map((li) => `<li>${inline(li.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`,
      );
      list = [];
    }
  };
  for (const ln of lines) {
    if (/^\s*[-*]\s+/.test(ln)) {
      list.push(ln);
    } else if (/^\s*$/.test(ln)) {
      flush();
      blocks.push("");
    } else if (/^#{1,3}\s+/.test(ln)) {
      flush();
      blocks.push(
        `<p><strong>${inline(ln.replace(/^#{1,3}\s+/, ""))}</strong></p>`,
      );
    } else {
      flush();
      blocks.push(`<p>${inline(ln)}</p>`);
    }
  }
  flush();
  return (
    <span
      className="[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-[#f0e9d8] [&_code]:px-1 [&_em]:text-[#6f6350]"
      dangerouslySetInnerHTML={{ __html: blocks.join("") }}
    />
  );
}
