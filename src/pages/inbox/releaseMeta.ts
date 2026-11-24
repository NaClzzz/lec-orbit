/** 发布与系统通知解析工具：从通知标题与 payload 中提取版本、Git Commit、变更记录、上一版 Diff 及直达链接。 */
import type { OrbitNotificationItem } from '@/services/orbitServerApi';
import type { OrbitNavTab } from '@/stores/useOrbitStore';

export interface ParsedReleaseCommit {
  sha: string;
  shortSha: string;
  message: string;
  author?: string;
  authorLogin?: string;
  authorAvatar?: string;
  committedAt?: string;
  url?: string;
}

export interface ParsedReleaseContributor {
  githubLogin?: string;
  handle?: string;
  name?: string;
  avatar?: string;
  roleLabel?: string;
  commits?: number;
}

export interface ParsedReleaseDetail {
  isRelease: boolean;
  appName: string;
  displayName: string;
  environment: string;
  version?: string;
  dockerImage?: string;
  gitHash?: string;
  shortSha?: string;
  buildNumber?: string;
  branch?: string;
  repo?: string;
  commitTitle?: string;
  commitBody?: string;
  author?: string;
  authorLogin?: string;
  authorAvatar?: string;
  proposer?: ParsedReleaseContributor;
  triggeredBy?: string;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  commits: ParsedReleaseCommit[];
  contributors: ParsedReleaseContributor[];
  previousVersion?: string;
  previousShortSha?: string;
  appUrl?: string;
  inAppTab?: OrbitNavTab;
  commitUrl?: string;
  compareUrl?: string;
  devtronUrl?: string;
}

interface AppLinkSpec {
  displayName: string;
  repo?: string;
  appUrl?: string;
  inAppTab?: OrbitNavTab;
}

const KNOWN_APP_SPECS: Record<string, AppLinkSpec> = {
  'lec-sso': {
    displayName: '统一身份 (LecSSO)',
    repo: 'lec-org/lec-sso',
    appUrl: 'https://sso.lecspace.top/portal',
  },
  lecsso: {
    displayName: '统一身份 (LecSSO)',
    repo: 'lec-org/lec-sso',
    appUrl: 'https://sso.lecspace.top/portal',
  },
  'lec-doc': {
    displayName: '乐程云文档 (LecDoc)',
    repo: 'lec-org/lec-doc',
    appUrl: 'https://doc.lecspace.top',
    inAppTab: 'doc',
  },
  lecdoc: {
    displayName: '乐程云文档 (LecDoc)',
    repo: 'lec-org/lec-doc',
    appUrl: 'https://doc.lecspace.top',
    inAppTab: 'doc',
  },
  'lec-punch': {
    displayName: '考勤打卡 (LecPunch)',
    repo: 'lec-org/LecPunch',
    appUrl: 'https://punch.lecspace.top',
    inAppTab: 'punch-today',
  },
  'lecpunch-api': {
    displayName: '考勤打卡 API',
    repo: 'lec-org/LecPunch',
    appUrl: 'https://punch.lecspace.top',
    inAppTab: 'punch-today',
  },
  'lecpunch-web': {
    displayName: '考勤打卡前端',
    repo: 'lec-org/LecPunch',
    appUrl: 'https://punch.lecspace.top',
    inAppTab: 'punch-today',
  },
  'lec-drive': {
    displayName: '云盘素材 (LecDrive)',
    repo: 'lec-org/lec-drive',
    appUrl: 'https://drive.lecspace.top',
  },
  'lec-oj': {
    displayName: '在线判题 (LecOJ)',
    repo: 'lec-org/lec-oj',
    appUrl: 'https://code.lecspace.top',
  },
  'lec-oj-judge': {
    displayName: '判题评测机 (LecOJ)',
    repo: 'lec-org/lec-oj',
    appUrl: 'https://code.lecspace.top',
  },
  'lec-website': {
    displayName: '乐程工作室官网',
    repo: 'lec-org/LEC-Official-Website',
    appUrl: 'https://lecspace.top',
  },
  'lec-blog': {
    displayName: '乐程博客',
    repo: 'lec-org/lec-blog',
  },
  'lec-orbit': {
    displayName: 'Orbit 伴程',
    repo: 'lec-org/lec-orbit',
    appUrl: 'https://lec-org.github.io/lec-orbit/',
  },
  'lec-orbit-server': {
    displayName: 'Orbit 服务端',
    repo: 'lec-org/lec-orbit',
    appUrl: 'https://lec-org.github.io/lec-orbit/',
  },
  orbit: {
    displayName: 'Orbit 伴程',
    repo: 'lec-org/lec-orbit',
    appUrl: 'https://lec-org.github.io/lec-orbit/',
  },
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStr(sources: Array<Record<string, unknown> | undefined>, ...keys: string[]): string | undefined {
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const val = src[k];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
  }
  return undefined;
}

function readNum(sources: Array<Record<string, unknown> | undefined>, ...keys: string[]): number | undefined {
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const val = src[k];
      if (typeof val === 'number' && Number.isFinite(val)) {
        return val;
      }
    }
  }
  return undefined;
}

/** 从版本 tag（如 `89a4662f-1-56` 或 `v0.2.0`）提取 7~40 位 Git SHA 与构建序号。 */
export function parseVersionTag(version?: string): { sha?: string; shortSha?: string; buildNumber?: string } {
  if (!version) return {};
  const trimmed = version.trim();
  const tagPart = trimmed.includes(':') ? trimmed.slice(trimmed.lastIndexOf(':') + 1) : trimmed;
  const match = /^([0-9a-fA-F]{7,40})(?:[-_](\d+))?(?:[-_](\d+))?/.exec(tagPart);
  if (!match) return {};
  const sha = match[1]!.toLowerCase();
  const buildNumber = match[3] ?? match[2];
  return {
    sha,
    shortSha: sha.slice(0, 8),
    buildNumber,
  };
}

/** 从历史标题（如 `lec-sso 已更新至 89a4662f-1-56`）兜底解析版本 tag。 */
function extractVersionFromText(title: string, body: string): string | undefined {
  const fromTitle = /已更新至\s+([A-Za-z0-9._-]+)/.exec(title);
  if (fromTitle?.[1]) return fromTitle[1];
  const fromBody = /镜像版本\s+([A-Za-z0-9._-]+)/.exec(body);
  if (fromBody?.[1]) return fromBody[1];
  return undefined;
}

export function getKnownAppDisplayName(sourceApp: string): string {
  const spec = KNOWN_APP_SPECS[sourceApp.trim().toLowerCase()];
  return spec?.displayName ?? sourceApp;
}

/** 提取单条通知的结构化发布详情，并自动在历史列表中匹配同应用的上一条版本以构造 GitHub Compare Diff 链接。 */
export function parseNotificationReleaseDetail(
  item: OrbitNotificationItem,
  allNotifications: readonly OrbitNotificationItem[],
): ParsedReleaseDetail {
  const payload = asRecord(item.payload);
  const release = asRecord(payload?.release);
  const nestedPayload = asRecord(payload?.payload);
  const sources = [release, payload, nestedPayload];

  const appName = readStr(sources, 'appName', 'app_name') ?? item.sourceApp;
  const spec = KNOWN_APP_SPECS[appName.trim().toLowerCase()];

  const version = readStr(sources, 'version', 'imageTag', 'tag') ?? extractVersionFromText(item.title, item.body);
  const parsedTag = parseVersionTag(version);
  const gitHash = readStr(sources, 'gitHash', 'commitHash', 'commitSha', 'sha') ?? parsedTag.sha;
  const shortSha =
    readStr(sources, 'shortSha') ?? (gitHash ? gitHash.slice(0, 8) : parsedTag.shortSha);

  const isRelease =
    item.eventType === 'app.updated' ||
    Boolean(release) ||
    Boolean(version && /已更新至|已发布更新/.test(item.title));

  const repo = readStr(sources, 'repo', 'repository') ?? spec?.repo;
  const appUrl = readStr(sources, 'appUrl', 'appURL', 'url') ?? spec?.appUrl;
  const devtronUrl =
    readStr(sources, 'devtronUrl', 'devtronURL', 'appDetailLink', 'cdPipelineLink') ??
    (isRelease ? 'https://devtron.lecspace.top/dashboard/app/list' : undefined);

  const commitUrl =
    readStr(sources, 'commitUrl', 'commitURL') ??
    (repo && gitHash ? `https://github.com/${repo}/commit/${gitHash}` : undefined);

  const rawCommits = Array.isArray(release?.commits)
    ? release.commits
    : Array.isArray(payload?.commits)
      ? payload.commits
      : [];

  const commits: ParsedReleaseCommit[] = rawCommits
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const sha = readStr([entry], 'sha', 'id', 'hash') ?? '';
      const message = readStr([entry], 'message', 'title') ?? '';
      const sSha = readStr([entry], 'shortSha') ?? (sha ? sha.slice(0, 8) : '');
      const url =
        readStr([entry], 'url') ?? (repo && sha ? `https://github.com/${repo}/commit/${sha}` : undefined);
      return {
        sha,
        shortSha: sSha,
        message,
        author: readStr([entry], 'author', 'authorName'),
        authorLogin: readStr([entry], 'authorLogin', 'githubLogin', 'login'),
        authorAvatar: readStr([entry], 'authorAvatar', 'avatar'),
        committedAt: readStr([entry], 'committedAt', 'timestamp', 'date'),
        url,
      };
    })
    .filter((c) => Boolean(c.message || c.sha));

  let commitTitle = readStr(sources, 'commitTitle', 'commitMessage', 'commit_message', 'changelog', 'releaseNotes');
  let commitBody = readStr(sources, 'commitBody');
  if (!commitTitle && commits.length > 0) {
    const [firstLine, ...restLines] = commits[0]!.message.split('\n');
    commitTitle = firstLine?.trim();
    if (!commitBody && restLines.length > 0) {
      commitBody = restLines.join('\n').trim();
    }
  }

  const author = readStr(sources, 'author', 'commitAuthor', 'committer') ?? commits[0]?.author;
  const authorLogin =
    readStr(sources, 'authorLogin', 'githubLogin', 'author_login') ?? commits[0]?.authorLogin;
  const authorAvatar =
    readStr(sources, 'authorAvatar', 'author_avatar') ?? commits[0]?.authorAvatar;

  // 解析需求提出人（如 payload.release.proposer 或 requestedBy）
  const rawProposerObj = asRecord(release?.proposer ?? payload?.proposer);
  const rawProposerName = readStr(sources, 'proposer', 'requestedBy', 'requested_by');
  const proposer: ParsedReleaseContributor | undefined = rawProposerObj
    ? {
        githubLogin: readStr([rawProposerObj], 'githubLogin', 'login'),
        handle: readStr([rawProposerObj], 'handle', 'username'),
        name: readStr([rawProposerObj], 'name'),
        avatar: readStr([rawProposerObj], 'avatar'),
        roleLabel: readStr([rawProposerObj], 'roleLabel') ?? '需求提出',
      }
    : rawProposerName
      ? {
          githubLogin: readStr(sources, 'proposerLogin', 'requestedByLogin'),
          name: rawProposerName,
          roleLabel: '需求提出',
        }
      : undefined;

  // 汇总贡献者：优先使用后端聚合的 contributors，否则从 commits、Co-authored-by 与顶层提交者推导
  const contributorMap = new Map<string, ParsedReleaseContributor>();
  const pushContributor = (entry: ParsedReleaseContributor) => {
    const login = entry.githubLogin?.trim();
    const handle = entry.handle?.trim();
    const name = entry.name?.trim();
    const key = (login || handle || name || '').toLowerCase();
    if (!key) return;
    const prev = contributorMap.get(key);
    if (prev) {
      prev.commits = (prev.commits ?? 1) + (entry.commits ?? 1);
      if (!prev.githubLogin && login) prev.githubLogin = login;
      if (!prev.handle && handle) prev.handle = handle;
      if (!prev.name && name) prev.name = name;
      if (!prev.avatar && entry.avatar) prev.avatar = entry.avatar;
      if (!prev.roleLabel && entry.roleLabel) prev.roleLabel = entry.roleLabel;
      return;
    }
    contributorMap.set(key, {
      githubLogin: login,
      handle,
      name,
      avatar: entry.avatar,
      roleLabel: entry.roleLabel,
      commits: entry.commits ?? 1,
    });
  };

  const extractCoAuthors = (text?: string) => {
    if (!text) return;
    const re = /^co-authored-by:\s*([^<\r\n]+?)(?:\s*<([^>\r\n]+)>)?\s*$/gim;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const coName = m[1]?.trim();
      const email = m[2]?.trim() ?? '';
      const noreply = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email);
      pushContributor({
        githubLogin: noreply?.[1]?.trim(),
        name: coName,
        roleLabel: '联合提交',
        commits: 1,
      });
    }
  };

  const rawContributors = Array.isArray(release?.contributors)
    ? release.contributors
    : Array.isArray(payload?.contributors)
      ? payload.contributors
      : [];
  for (const rawEntry of rawContributors) {
    const rec = asRecord(rawEntry);
    if (!rec) continue;
    pushContributor({
      githubLogin: readStr([rec], 'githubLogin', 'login', 'authorLogin'),
      handle: readStr([rec], 'handle', 'username'),
      name: readStr([rec], 'name', 'author'),
      avatar: readStr([rec], 'avatar', 'authorAvatar'),
      roleLabel: readStr([rec], 'roleLabel'),
      commits: readNum([rec], 'commits') ?? 1,
    });
  }

  if (contributorMap.size === 0) {
    for (const c of commits) {
      pushContributor({
        githubLogin: c.authorLogin,
        name: c.author,
        avatar: c.authorAvatar,
        commits: 1,
      });
      extractCoAuthors(c.message);
    }
  }
  if (contributorMap.size === 0 && (authorLogin || author)) {
    pushContributor({
      githubLogin: authorLogin,
      name: author,
      avatar: authorAvatar,
      commits: 1,
    });
    extractCoAuthors(commitBody);
  }
  const contributors = Array.from(contributorMap.values());

  // 在同一应用的历史发布记录中查找早于当前通知的最近一条，用于自动生成 GitHub Compare Diff 链接
  let previousVersion: string | undefined;
  let previousShortSha: string | undefined;
  let compareUrl: string | undefined;
  if (isRelease && shortSha) {
    const currentTime = Date.parse(item.createdAt);
    const sameAppEarlier = allNotifications
      .filter(
        (other) =>
          other.id !== item.id &&
          other.sourceApp.trim().toLowerCase() === item.sourceApp.trim().toLowerCase() &&
          (Number.isNaN(currentTime) || Date.parse(other.createdAt) < currentTime),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    for (const prev of sameAppEarlier) {
      const prevPayload = asRecord(prev.payload);
      const prevRelease = asRecord(prevPayload?.release);
      const prevVer =
        readStr([prevRelease, prevPayload], 'version', 'imageTag', 'tag') ??
        extractVersionFromText(prev.title, prev.body);
      const prevTag = parseVersionTag(prevVer);
      const prevSha = readStr([prevRelease, prevPayload], 'gitHash', 'sha') ?? prevTag.sha;
      const prevShort = prevSha ? prevSha.slice(0, 8) : prevTag.shortSha;
      if (prevShort && prevShort !== shortSha) {
        previousVersion = prevVer;
        previousShortSha = prevShort;
        if (repo) {
          compareUrl = `https://github.com/${repo}/compare/${prevSha ?? prevShort}...${gitHash ?? shortSha}`;
        }
        break;
      }
    }
  }

  return {
    isRelease,
    appName,
    displayName: readStr(sources, 'displayName') ?? spec?.displayName ?? appName,
    environment: readStr(sources, 'environment', 'envName', 'env') ?? '校园生产环境',
    version,
    dockerImage: readStr(sources, 'dockerImage', 'dockerImageUrl', 'image'),
    gitHash,
    shortSha,
    buildNumber: parsedTag.buildNumber,
    branch: readStr(sources, 'branch', 'gitBranch'),
    repo,
    commitTitle,
    commitBody,
    author,
    authorLogin,
    authorAvatar,
    proposer,
    triggeredBy: readStr(sources, 'triggeredBy', 'triggered_by'),
    filesChanged: readNum(sources, 'filesChanged'),
    additions: readNum(sources, 'additions'),
    deletions: readNum(sources, 'deletions'),
    commits,
    contributors,
    previousVersion,
    previousShortSha,
    appUrl,
    inAppTab: spec?.inAppTab,
    commitUrl,
    compareUrl,
    devtronUrl,
  };
}
