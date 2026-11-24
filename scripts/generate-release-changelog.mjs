#!/usr/bin/env node
/**
 * CI 发布辅助脚本：为 GitHub Release 生成结构化的 `release-changelog.json`，
 * 包含相邻两个版本 tag 之间的全部提交分类、作者 GitHub login / 头像与贡献者汇总，
 * 随安装包一同上传至 GitHub Releases CDN，供 Orbit 客户端更新前/更新后弹窗零限流展示。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const releaseTag = (process.env.RELEASE_TAG || '').trim();
const repo = (process.env.GITHUB_REPOSITORY || 'lec-org/lec-orbit').trim();
const token = (process.env.GITHUB_TOKEN || '').trim();
const outPath = process.argv[2] || path.resolve('artifacts/release-changelog.json');

if (!releaseTag) {
  console.error('缺少 RELEASE_TAG 环境变量');
  process.exit(1);
}

const cleanVersion = releaseTag.replace(/^v/i, '');

const CONVENTIONAL_RE = /^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/;
const CO_AUTHOR_RE = /^co-authored-by:\s*([^<\r\n]+?)(?:\s*<([^>\r\n]+)>)?\s*$/gim;
const GH_NOREPLY_RE = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i;

function classifyTitle(rawTitle) {
  const trimmed = rawTitle.trim();
  const m = CONVENTIONAL_RE.exec(trimmed);
  if (!m) {
    if (/修复|fix|bug/i.test(trimmed)) return { category: 'fix', title: trimmed };
    if (/新增|上线|支持|feat/i.test(trimmed)) return { category: 'feat', title: trimmed };
    return { category: 'other', title: trimmed };
  }
  const t = m[1].toLowerCase();
  const scope = m[2]?.trim() || undefined;
  const title = m[3].trim();
  if (t === 'feat') return { category: 'feat', scope, title };
  if (t === 'fix') return { category: 'fix', scope, title };
  if (t === 'perf') return { category: 'perf', scope, title };
  if (t === 'refactor' || t === 'style' || t === 'ui') return { category: 'refactor', scope, title };
  if (t === 'docs') return { category: 'docs', scope, title };
  return { category: 'other', scope, title };
}

function findPreviousTag() {
  try {
    const out = execFileSync('git', ['tag', '--sort=-creatordate', '--list', 'v*'], {
      encoding: 'utf8',
    });
    const tags = out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const idx = tags.indexOf(releaseTag);
    if (idx >= 0) return tags[idx + 1] || '';
    return tags.find((t) => t !== releaseTag) || '';
  } catch {
    return '';
  }
}

async function fetchCompareCommits(prevTag) {
  if (!prevTag) return null;
  const url = `https://api.github.com/repos/${repo}/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(releaseTag)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lec-orbit-release-ci',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data.commits)) return null;
  return {
    compareUrl: data.html_url || `https://github.com/${repo}/compare/${prevTag}...${releaseTag}`,
    commits: data.commits.map((c) => ({
      sha: c.sha,
      message: c.commit?.message || '',
      authorName: c.commit?.author?.name || c.author?.login || '',
      authorLogin: c.author?.login || undefined,
      authorAvatar: c.author?.avatar_url || undefined,
      committedAt: c.commit?.author?.date || undefined,
      url: c.html_url || (c.sha ? `https://github.com/${repo}/commit/${c.sha}` : undefined),
    })),
  };
}

function readLocalGitCommits(prevTag) {
  const range = prevTag ? `${prevTag}..${releaseTag}` : `${releaseTag}`;
  const args = prevTag
    ? ['log', range, '--pretty=format:%H%x1f%an%x1f%aI%x1f%B%x1e']
    : ['log', '-n', '20', '--pretty=format:%H%x1f%an%x1f%aI%x1f%B%x1e'];
  const out = execFileSync('git', args, { encoding: 'utf8' });
  return out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, authorName, committedAt, message] = rec.split('\x1f');
      return {
        sha: sha?.trim(),
        message: message?.trim() || '',
        authorName: authorName?.trim() || '',
        authorLogin: undefined,
        authorAvatar: undefined,
        committedAt: committedAt?.trim() || undefined,
        url: sha ? `https://github.com/${repo}/commit/${sha.trim()}` : undefined,
      };
    });
}

async function main() {
  const prevTag = findPreviousTag();
  let compareUrl = prevTag ? `https://github.com/${repo}/compare/${prevTag}...${releaseTag}` : undefined;
  let rawCommits = [];

  const apiResult = await fetchCompareCommits(prevTag).catch(() => null);
  if (apiResult && apiResult.commits.length > 0) {
    compareUrl = apiResult.compareUrl;
    rawCommits = apiResult.commits;
  } else {
    rawCommits = readLocalGitCommits(prevTag);
  }

  const items = [];
  const contribMap = new Map();
  const addContributor = ({ githubLogin, name, avatar, roleLabel }) => {
    const login = githubLogin?.trim();
    const n = name?.trim();
    const key = (login || n || '').toLowerCase();
    if (!key) return;
    const prev = contribMap.get(key);
    if (prev) {
      prev.commits += 1;
      if (!prev.githubLogin && login) prev.githubLogin = login;
      if (!prev.name && n) prev.name = n;
      if (!prev.avatar && avatar) prev.avatar = avatar;
      return;
    }
    contribMap.set(key, {
      githubLogin: login,
      name: n,
      avatar,
      commits: 1,
      ...(roleLabel ? { roleLabel } : {}),
    });
  };

  for (let i = 0; i < rawCommits.length; i += 1) {
    const c = rawCommits[i];
    const lines = (c.message || '').replace(/\r\n/g, '\n').trim().split('\n');
    const firstLine = (lines[0] || '').trim();
    if (!firstLine || /^Merge\s+(branch|pull request|remote-tracking)/i.test(firstLine)) {
      continue;
    }
    const { category, scope, title } = classifyTitle(firstLine);
    items.push({
      id: c.sha || `commit-${i}`,
      category,
      ...(scope ? { scope } : {}),
      title,
      ...(c.sha ? { sha: c.sha, shortSha: c.sha.slice(0, 7) } : {}),
      ...(c.authorName ? { authorName: c.authorName } : {}),
      ...(c.authorLogin ? { authorLogin: c.authorLogin } : {}),
      ...(c.authorAvatar ? { authorAvatar: c.authorAvatar } : {}),
      ...(c.url ? { url: c.url } : {}),
      ...(c.committedAt ? { committedAt: c.committedAt } : {}),
    });

    addContributor({
      githubLogin: c.authorLogin,
      name: c.authorName,
      avatar: c.authorAvatar,
    });

    const body = lines.slice(1).join('\n');
    CO_AUTHOR_RE.lastIndex = 0;
    let m;
    while ((m = CO_AUTHOR_RE.exec(body)) !== null) {
      const coName = m[1]?.trim();
      const email = m[2]?.trim() || '';
      const noreply = GH_NOREPLY_RE.exec(email);
      addContributor({
        githubLogin: noreply?.[1]?.trim(),
        name: coName,
        roleLabel: '联合提交',
      });
    }
  }

  const contributors = Array.from(contribMap.values()).sort((a, b) => b.commits - a.commits);

  const payload = {
    version: cleanVersion,
    ...(prevTag ? { previousVersion: prevTag.replace(/^v/i, '') } : {}),
    publishedAt: new Date().toISOString(),
    releaseUrl: `https://github.com/${repo}/releases/tag/${releaseTag}`,
    ...(compareUrl ? { compareUrl } : {}),
    items,
    contributors,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(
    `已生成 ${outPath}: ${items.length} 条更新记录, ${contributors.length} 位贡献者 (prev=${prevTag || 'none'})`,
  );
}

main().catch((err) => {
  console.error('生成 release-changelog.json 失败:', err);
  process.exit(1);
});
