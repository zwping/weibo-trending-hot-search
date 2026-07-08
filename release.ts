#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
// Copyright 2020 justjavac(迷渡). All rights reserved. MIT license.
import { format } from "std/datetime/mod.ts";
import { join } from "std/path/mod.ts";
import { exists } from "std/fs/mod.ts";

import type { Word } from "./types.ts";

const burstTag = "爆";
const apiVersion = "2022-11-28";

type GitHubRelease = {
  tag_name: string;
};

function getGitHubHeaders(token: string): HeadersInit {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": apiVersion,
  };
}

async function createReleaseTag(title: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(title),
  );
  const hex = Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `weibo-burst-${hex.slice(0, 16)}`;
}

async function getPublishedReleaseTags(
  apiUrl: string,
  repository: string,
  token: string,
): Promise<Set<string>> {
  const tags = new Set<string>();

  for (let page = 1;; page++) {
    const response = await fetch(
      `${apiUrl}/repos/${repository}/releases?per_page=100&page=${page}`,
      { headers: getGitHubHeaders(token) },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to list GitHub releases: ${response.status} ${response.statusText}`,
      );
    }

    const releases = await response.json() as GitHubRelease[];
    for (const release of releases) {
      tags.add(release.tag_name);
    }

    if (releases.length < 100) {
      break;
    }
  }

  return tags;
}

async function createRelease(
  apiUrl: string,
  repository: string,
  token: string,
  word: Word,
  tagName: string,
): Promise<void> {
  const response = await fetch(`${apiUrl}/repos/${repository}/releases`, {
    method: "POST",
    headers: {
      ...getGitHubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tag_name: tagName,
      name: `微博爆搜：${word.title}`,
      body: [
        `微博爆搜：${word.title}`,
        "",
        `链接：https://s.weibo.com/${word.url}`,
      ].join("\n"),
      draft: false,
      prerelease: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create GitHub release for ${word.title}: ${response.status} ${response.statusText}`,
    );
  }
}

async function main(): Promise<void> {
  const yyyyMMdd = format(new Date(), "yyyy-MM-dd");
  const rawPath = join("raw", `${yyyyMMdd}.json`);
  if (!(await exists(rawPath))) {
    console.warn(`Raw file not found: ${rawPath}`);
    return;
  }

  const token = Deno.env.get("GITHUB_TOKEN");
  const repository = Deno.env.get("GITHUB_REPOSITORY");
  if (!token || !repository) {
    console.warn(
      "GITHUB_TOKEN or GITHUB_REPOSITORY is not set; skip publishing burst releases.",
    );
    return;
  }

  const words = JSON.parse(await Deno.readTextFile(rawPath)) as Word[];
  const burstWords = words.filter((word) => word.tag?.trim() === burstTag);
  if (burstWords.length === 0) {
    console.log("No burst hot searches found; skip publishing releases.");
    return;
  }

  const apiUrl = Deno.env.get("GITHUB_API_URL") ?? "https://api.github.com";
  const publishedTags = await getPublishedReleaseTags(apiUrl, repository, token);

  for (const word of burstWords) {
    const tagName = await createReleaseTag(word.title);
    if (publishedTags.has(tagName)) {
      console.log(`Release already exists for ${word.title}; skip.`);
      continue;
    }

    await createRelease(apiUrl, repository, token, word, tagName);
    publishedTags.add(tagName);
    console.log(`Published release for ${word.title}.`);
  }
}

if (import.meta.main) {
  await main();
}
