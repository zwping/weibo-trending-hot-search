import type { Word } from "./types.ts";

const rowRegexp = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const linkRegexp = /<a href="(\/weibo\?q=[^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const tagRegexp = /<i[^>]*class="[^"]*icon-txt[^"]*"[^>]*>([\s\S]*?)<\/i>/;

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, "").trim();
}

export function parseWords(html: string): Word[] {
  return Array.from(html.matchAll(rowRegexp)).flatMap((row) => {
    const rowHtml = row[1];
    const link = rowHtml.match(linkRegexp);
    if (!link) {
      return [];
    }

    const tag = rowHtml.match(tagRegexp)?.[1];
    return [{
      url: link[1],
      title: stripHtml(link[2]),
      ...(tag ? { tag: stripHtml(tag) } : {}),
    }];
  });
}

/**
 * 合并两次热门话题并根据**内容**去重，新的覆盖旧的
 *
 * via https://github.com/justjavac/weibo-trending-hot-search/issues/11#issuecomment-1428187183
 */
export function mergeWords(
  words: Word[],
  another: Word[],
): Word[] {
  const obj = new Map<string, Word>();
  for (const w of words) {
    obj.set(w.title, { ...w });
  }
  for (const w of another) {
    if (!obj.has(w.title)) {
      obj.set(w.title, { ...w });
    }
  }
  return Array.from(obj.values());
}

export async function createReadme(words: Word[]): Promise<string> {
  const readme = await Deno.readTextFile("./README.md");
  return readme.replace(/<!-- BEGIN -->[\W\w]*<!-- END -->/, createList(words));
}

export function createList(words: Word[]): string {
  return `<!-- BEGIN -->
<!-- 最后更新时间 ${Date()} -->
${
    words.map((x) => {
      const tag = x.tag ? ` [${x.tag}]` : "";
      return `1. [${x.title}](https://s.weibo.com/${x.url})${tag}`;
    })
      .join("\n")
  }
<!-- END -->`;
}

export function createArchive(words: Word[], date: string): string {
  return `# ${date}\n
共 ${words.length} 条\n
${createList(words)}
`;
}
