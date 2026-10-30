/** Convert the plain markdown ShipLog generates into Slack mrkdwn. */
export function markdownToSlack(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      let l = line;
      const heading = /^#{1,6}\s+(.*)$/.exec(l);
      if (heading) return `*${convertInline(heading[1] ?? "").replace(/\*/g, "")}*`;
      const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(l);
      if (bullet) {
        const depth = Math.floor((bullet[1] ?? "").length / 2);
        return `${"    ".repeat(depth)}• ${convertInline(bullet[2] ?? "")}`;
      }
      l = convertInline(l);
      return l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function convertInline(text: string): string {
  return (
    text
      // links [label](url) -> <url|label>
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<$2|$1>")
      // bold **x** or __x__ -> placeholder so the italic pass skips it
      .replace(/\*\*([^*]+)\*\*/g, "\u0000$1\u0000")
      .replace(/__([^_]+)__/g, "\u0000$1\u0000")
      // italic *x* -> _x_
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1_$2_")
      .replace(/\u0000([^\u0000]+)\u0000/g, "*$1*")
  );
}
