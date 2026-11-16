const FENCE = /^\s*(`{3,}|~{3,})/;
const ITEM = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)/;

function width(indent) {
  let column = 0;
  for (const char of indent) column += char === "\t" ? 4 - (column % 4) : 1;
  return column;
}

export function normalize(code) {
  let frontmatter = code.startsWith("---\n");
  let fence = null;
  let stack = [];

  return code
    .split("\n")
    .map((line, index) => {
      if (frontmatter) {
        if (index > 0 && line.trim() === "---") frontmatter = false;
        return line;
      }

      const delimiter = line.match(FENCE);
      if (delimiter) {
        if (!fence) fence = delimiter[1];
        else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null;
        return line;
      }
      if (fence) return line;

      const match = line.match(ITEM);
      if (!match) {
        if (line.trim() !== "" && !/^[ \t]/.test(line)) stack = [];
        return line;
      }

      const [, indent, marker, gap] = match;
      const source = width(indent);
      const size = marker.length + width(gap);

      while (stack.length && source < stack[stack.length - 1].source) stack.pop();

      const top = stack[stack.length - 1];
      if (!top) {
        stack.push({ source, output: source, size });
      } else if (source > top.source) {
        stack.push({ source, output: top.output + top.size, size });
      } else {
        top.size = size;
      }

      return " ".repeat(stack[stack.length - 1].output) + line.slice(indent.length);
    })
    .join("\n");
}

export default function listIndentPlugin() {
  return {
    name: "list-indent",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].endsWith(".mdx")) return null;
      const normalized = normalize(code);
      return normalized === code ? null : { code: normalized, map: null };
    },
  };
}
