/** Orbit 版本更新日志模型与解析工具：统一解析 CI 生成的 release-changelog.json、GitHub Compare 提交记录与 Release Notes。 */

export type ChangelogCategory = 'feat' | 'fix' | 'perf' | 'refactor' | 'docs' | 'other';

export interface UpdateChangelogItem {
  id: string;
  category: ChangelogCategory;
  scope?: string;
  title: string;
  sha?: string;
  shortSha?: string;
  authorName?: string;
  authorLogin?: string;
  authorAvatar?: string;
  url?: string;
  committedAt?: string;
}

export interface UpdateChangelogContributor {
  githubLogin?: string;
  name?: string;
  avatar?: string;
  commits?: number;
  roleLabel?: string;
}

export interface UpdateChangelog {
  version: string;
  previousVersion?: string;
  publishedAt?: string;
  releaseUrl?: string;
  compareUrl?: string;
  summary?: string;
  rawNotes?: string;
  items: UpdateChangelogItem[];
  contributors: UpdateChangelogContributor[];
}

export interface RawCommitInput {
  sha?: string;
  message: string;
  authorName?: string;
  authorLogin?: string;
  authorAvatar?: string;
  committedAt?: string;
  url?: string;
}

export const CHANGELOG_CATEGORY_META: Record<
  ChangelogCategory,
  { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' }
> = {
  feat: { label: '新功能', tone: 'info' },
  fix: { label: '问题修复', tone: 'warning' },
  perf: { label: '性能优化', tone: 'success' },
  refactor: { label: '体验优化', tone: 'neutral' },
  docs: { label: '文档完善', tone: 'neutral' },
  other: { label: '其他更新', tone: 'neutral' },
};

const CONVENTIONAL_RE = /^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/;
const GITHUB_BULLET_RE =
  /^[-*]\s+(.+?)(?:\s+by\s+@([A-Za-z0-9-]+))?(?:\s+in\s+(https:\/\/github\.com\/\S+))?\s*$/;
const PAREN_AUTHOR_RE = /\s*\(@([A-Za-z0-9-]+)\)\s*$/;
const FULL_CHANGELOG_RE = /\*\*Full Changelog\*\*:\s*(https:\/\/github\.com\/\S+)/i;
const COMPARE_TAGS_RE = /\/compare\/v?([0-9]+\.[0-9]+\.[0-9][^.\s]*)\.\.\.v?([0-9]+\.[0-9]+\.[0-9][^\s]*)/i;
const CO_AUTHOR_RE = /^co-authored-by:\s*([^<\r\n]+?)(?:\s*<([^>\r\n]+)>)?\s*$/gim;
const GH_NOREPLY_RE = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i;

/** 语义化版本比较：返回 1 (a > b)、0 (相等)、-1 (a < b)。 */
export function compareOrbitSemver(a: string, b: string): number {
  const parse = (v: string): [number, number, number] => {
    const clean = v.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '0.0.0';
    const parts = clean.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  if (a3 !== b3) return a3 > b3 ? 1 : -1;
  return 0;
}

/** 将提交前缀与标题归类为可读中文分类，并剥离冗余前缀。 */
export function classifyChangelogTitle(rawTitle: string): {
  category: ChangelogCategory;
  scope?: string;
  title: string;
} {
  const trimmed = rawTitle.trim();
  const match = CONVENTIONAL_RE.exec(trimmed);
  if (!match) {
    if (/修复|fix|bug/i.test(trimmed)) {
      return { category: 'fix', title: trimmed };
    }
    if (/新增|上线|支持|feat/i.test(trimmed)) {
      return { category: 'feat', title: trimmed };
    }
    return { category: 'other', title: trimmed };
  }

  const rawType = match[1]!.toLowerCase();
  const scope = match[2]?.trim() || undefined;
  const title = match[3]!.trim();

  if (rawType === 'feat') return { category: 'feat', scope, title };
  if (rawType === 'fix') return { category: 'fix', scope, title };
  if (rawType === 'perf') return { category: 'perf', scope, title };
  if (rawType === 'refactor' || rawType === 'style' || rawType === 'ui') {
    return { category: 'refactor', scope, title };
  }
  if (rawType === 'docs') return { category: 'docs', scope, title };
  return { category: 'other', scope, title };
}

function aggregateContributors(
  items: readonly UpdateChangelogItem[],
  extraCoAuthorTexts: readonly string[],
  fallbackAuthor?: { githubLogin?: string; name?: string; avatar?: string },
): UpdateChangelogContributor[] {
  const map = new Map<string, UpdateChangelogContributor>();

  const push = (entry: {
    githubLogin?: string;
    name?: string;
    avatar?: string;
    roleLabel?: string;
    isCommit?: boolean;
  }) => {
    const login = entry.githubLogin?.trim();
    const name = entry.name?.trim();
    const key = (login || name || '').toLowerCase();
    if (!key) return;
    const prev = map.get(key);
    if (prev) {
      if (entry.isCommit !== false) {
        prev.commits = (prev.commits ?? 1) + 1;
      }
      if (!prev.githubLogin && login) prev.githubLogin = login;
      if (!prev.name && name) prev.name = name;
      if (!prev.avatar && entry.avatar) prev.avatar = entry.avatar;
      return;
    }
    map.set(key, {
      githubLogin: login,
      name,
      avatar: entry.avatar,
      commits: entry.isCommit === false ? undefined : 1,
      roleLabel: entry.roleLabel,
    });
  };

  for (const item of items) {
    if (item.authorLogin || item.authorName) {
      push({
        githubLogin: item.authorLogin,
        name: item.authorName,
        avatar: item.authorAvatar,
        isCommit: true,
      });
    }
  }

  for (const text of extraCoAuthorTexts) {
    CO_AUTHOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CO_AUTHOR_RE.exec(text)) !== null) {
      const coName = m[1]?.trim();
      const email = m[2]?.trim() ?? '';
      const noreply = GH_NOREPLY_RE.exec(email);
      push({
        githubLogin: noreply?.[1]?.trim(),
        name: coName,
        roleLabel: '联合提交',
        isCommit: true,
      });
    }
  }

  if (map.size === 0 && fallbackAuthor && (fallbackAuthor.githubLogin || fallbackAuthor.name)) {
    push({
      githubLogin: fallbackAuthor.githubLogin,
      name: fallbackAuthor.name,
      avatar: fallbackAuthor.avatar,
      roleLabel: '发布者',
      isCommit: false,
    });
  }

  return Array.from(map.values()).sort((a, b) => (b.commits ?? 0) - (a.commits ?? 0));
}

/** 从原始 Git 提交列表构建结构化更新日志（用于 CI 生成清单或 GitHub Compare API）。 */
export function buildChangelogFromCommits(options: {
  version: string;
  previousVersion?: string;
  publishedAt?: string;
  releaseUrl?: string;
  compareUrl?: string;
  rawNotes?: string;
  commits: readonly RawCommitInput[];
  fallbackAuthor?: { githubLogin?: string; name?: string; avatar?: string };
}): UpdateChangelog {
  const items: UpdateChangelogItem[] = [];
  const coAuthorTexts: string[] = [];

  for (let i = 0; i < options.commits.length; i += 1) {
    const c = options.commits[i]!;
    const lines = c.message.replace(/\r\n/g, '\n').trim().split('\n');
    const firstLine = (lines[0] ?? '').trim();
    if (!firstLine) continue;
    // 跳过无意义的自动合并提交
    if (/^Merge\s+(branch|pull request|remote-tracking)/i.test(firstLine)) continue;
    if (lines.length > 1) {
      coAuthorTexts.push(lines.slice(1).join('\n'));
    }

    const classified = classifyChangelogTitle(firstLine);
    const shortSha = c.sha ? c.sha.slice(0, 7) : undefined;
    items.push({
      id: c.sha || `commit-${i}`,
      category: classified.category,
      scope: classified.scope,
      title: classified.title,
      sha: c.sha,
      shortSha,
      authorName: c.authorName,
      authorLogin: c.authorLogin,
      authorAvatar: c.authorAvatar,
      url: c.url,
      committedAt: c.committedAt,
    });
  }

  const contributors = aggregateContributors(items, coAuthorTexts, options.fallbackAuthor);

  return {
    version: options.version.replace(/^v/i, ''),
    previousVersion: options.previousVersion?.replace(/^v/i, ''),
    publishedAt: options.publishedAt,
    releaseUrl: options.releaseUrl,
    compareUrl: options.compareUrl,
    rawNotes: options.rawNotes,
    items,
    contributors,
  };
}

/** 从 GitHub Release Markdown 正文解析结构化更新条目与 `@作者` 贡献者列表。 */
export function parseReleaseNotesToChangelog(options: {
  version: string;
  previousVersion?: string;
  publishedAt?: string;
  releaseUrl?: string;
  rawNotes?: string;
  fallbackAuthor?: { githubLogin?: string; name?: string; avatar?: string };
}): UpdateChangelog {
  const cleanVersion = options.version.replace(/^v/i, '');
  const notes = (options.rawNotes || '').replace(/\r\n/g, '\n').trim();
  const items: UpdateChangelogItem[] = [];
  let compareUrl: string | undefined;
  let inferredPrev = options.previousVersion?.replace(/^v/i, '');

  if (notes) {
    const fullMatch = FULL_CHANGELOG_RE.exec(notes);
    if (fullMatch?.[1]) {
      compareUrl = fullMatch[1];
      const tagMatch = COMPARE_TAGS_RE.exec(compareUrl);
      if (!inferredPrev && tagMatch?.[1]) {
        inferredPrev = tagMatch[1];
      }
    }

    const lines = notes.split('\n');
    let inNewContributorsSection = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!.trim();
      if (!line) continue;
      if (/^#{1,4}\s*new contributors/i.test(line)) {
        inNewContributorsSection = true;
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        inNewContributorsSection = false;
        continue;
      }
      if (inNewContributorsSection) continue;
      if (FULL_CHANGELOG_RE.test(line)) continue;

      const bullet = GITHUB_BULLET_RE.exec(line);
      if (!bullet) continue;
      let rawTitle = (bullet[1] ?? '').trim();
      let authorLogin = bullet[2]?.trim();
      const url = bullet[3]?.trim();

      if (!authorLogin) {
        const paren = PAREN_AUTHOR_RE.exec(rawTitle);
        if (paren?.[1]) {
          authorLogin = paren[1].trim();
          rawTitle = rawTitle.replace(PAREN_AUTHOR_RE, '').trim();
        }
      }

      if (!rawTitle) continue;
      const classified = classifyChangelogTitle(rawTitle);
      items.push({
        id: `note-${i}`,
        category: classified.category,
        scope: classified.scope,
        title: classified.title,
        authorLogin,
        authorName: authorLogin,
        url,
      });
    }
  }

  const contributors = aggregateContributors(items, [notes], options.fallbackAuthor);

  return {
    version: cleanVersion,
    previousVersion: inferredPrev,
    publishedAt: options.publishedAt,
    releaseUrl: options.releaseUrl,
    compareUrl,
    rawNotes: notes || undefined,
    items,
    contributors,
  };
}
