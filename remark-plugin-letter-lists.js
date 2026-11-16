const MARKER = /^([a-zA-Z])([.)])\s+/;

function splitLines(children) {
  const lines = [{ nodes: [], hard: false }];
  const open = hard => lines.push({ nodes: [], hard });
  const push = node => lines[lines.length - 1].nodes.push(node);

  for (const child of children) {
    if (child.type === "break") {
      open(true);
      continue;
    }
    if (child.type !== "text" || !child.value.includes("\n")) {
      push(child);
      continue;
    }
    const parts = child.value.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) open(false);
      if (part !== "") push({ ...child, value: part, position: undefined });
    });
  }

  return lines.filter(line => line.nodes.length > 0);
}

function markerOf(line) {
  const first = line.nodes[0];
  return first.type === "text" ? first.value.match(MARKER) : null;
}

function isUpper(marker) {
  return marker[1] === marker[1].toUpperCase();
}

function findRun(lines) {
  const a = "a".charCodeAt(0);

  for (let start = 0; start < lines.length; start++) {
    const first = markerOf(lines[start]);
    if (!first || first[1].toLowerCase().charCodeAt(0) !== a) continue;

    const markers = [first];
    while (start + markers.length < lines.length) {
      const next = markerOf(lines[start + markers.length]);
      if (!next || next[1].toLowerCase().charCodeAt(0) !== a + markers.length) break;
      if (next[2] !== first[2] || isUpper(next) !== isUpper(first)) break;
      markers.push(next);
    }
    if (markers.length >= 2) return { start, markers };
  }

  return null;
}

function toParagraph(lines, position) {
  const children = [];
  lines.forEach((line, index) => {
    if (index > 0) children.push(line.hard ? { type: "break" } : { type: "text", value: "\n" });
    children.push(...line.nodes);
  });
  return { type: "paragraph", children, position };
}

function toList(lines, markers, position) {
  return {
    type: "list",
    ordered: true,
    start: 1,
    spread: false,
    position,
    data: { hProperties: { type: isUpper(markers[0]) ? "A" : "a" } },
    children: lines.map((line, index) => {
      const [head, ...rest] = line.nodes;
      const text = head.value.slice(markers[index][0].length);
      return {
        type: "listItem",
        spread: false,
        children: [
          {
            type: "paragraph",
            children: [...(text ? [{ ...head, value: text }] : []), ...rest],
          },
        ],
      };
    }),
  };
}

function split(lines, position) {
  const run = findRun(lines);
  if (!run) return [toParagraph(lines, position)];

  const end = run.start + run.markers.length;
  return [
    ...(run.start ? [toParagraph(lines.slice(0, run.start), position)] : []),
    toList(lines.slice(run.start, end), run.markers, position),
    ...(end < lines.length ? split(lines.slice(end), position) : []),
  ];
}

export default function remarkLetterLists() {
  return tree => {
    const walk = node => {
      if (!Array.isArray(node.children)) return;

      node.children = node.children.flatMap(child => {
        if (child.type !== "paragraph") {
          walk(child);
          return child;
        }

        const lines = splitLines(child.children);
        return findRun(lines) ? split(lines, child.position) : child;
      });
    };

    walk(tree);
  };
}
