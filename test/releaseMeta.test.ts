import { describe, expect, it } from 'bun:test';
import type { StudioMemberCard } from '../src/shared/ipc';
import { resolveStudioMemberByHint } from '../src/shared/memberMatch';
import type { OrbitNotificationItem } from '../src/services/orbitServerApi';
import { parseNotificationReleaseDetail } from '../src/pages/inbox/releaseMeta';

const MOCK_MEMBERS: StudioMemberCard[] = [
  {
    id: 'u1',
    username: 'chenxinhao.apries',
    name: '陈信豪',
    avatar: 'https://example.com/apries.png',
    enrollYear: 2023,
    roles: ['lec-admin', 'lec-studio'],
    social: {
      github: {
        username: 'Apries406',
        name: 'Apries',
        avatar: 'https://avatars.githubusercontent.com/u/1',
        profileUrl: 'https://github.com/Apries406',
      },
      feishu: {
        name: '陈信豪',
        enName: null,
        avatar: null,
        linked: true,
      },
    },
  },
];

describe('resolveStudioMemberByHint', () => {
  it('优先通过绑定的 GitHub 用户名反查工作室成员（大小写不敏感）', () => {
    const matched = resolveStudioMemberByHint({ githubLogin: 'apries406' }, MOCK_MEMBERS);
    expect(matched?.id).toBe('u1');
    expect(matched?.name).toBe('陈信豪');
  });

  it('兼容仅传入 author 字符串但实际为 GitHub login 的历史数据', () => {
    const matched = resolveStudioMemberByHint({ name: 'Apries406' }, MOCK_MEMBERS);
    expect(matched?.id).toBe('u1');
  });

  it('支持按 LecSSO Handle 或真名反查', () => {
    expect(resolveStudioMemberByHint({ handle: 'chenxinhao.apries' }, MOCK_MEMBERS)?.id).toBe('u1');
    expect(resolveStudioMemberByHint({ name: '陈信豪' }, MOCK_MEMBERS)?.id).toBe('u1');
    expect(resolveStudioMemberByHint({ githubLogin: 'stranger-dev' }, MOCK_MEMBERS)).toBeUndefined();
  });
});

describe('parseNotificationReleaseDetail', () => {
  it('解析 commits、Co-authored-by、需求提出人与上一版本 Diff 链接', () => {
    const current: OrbitNotificationItem = {
      id: 'n2',
      sourceApp: 'lec-sso',
      eventType: 'app.updated',
      title: 'lec-sso 已更新至 748e4b80-1-58',
      body: '更新内容：新增工作室成员公开名片',
      payload: {
        release: {
          appName: 'lec-sso',
          version: '748e4b80-1-58',
          proposer: { githubLogin: 'Apries406', name: '陈信豪' },
          commits: [
            {
              sha: '748e4b80abcdef',
              message:
                'feat(core): 新增工作室成员公开名片\n\nCo-authored-by: Alice <99+alice-gh@users.noreply.github.com>',
              author: 'Apries406',
              authorLogin: 'Apries406',
            },
          ],
        },
      },
      isRead: false,
      createdAt: '2026-11-24T14:00:00Z',
    };
    const previous: OrbitNotificationItem = {
      id: 'n1',
      sourceApp: 'lec-sso',
      eventType: 'app.updated',
      title: 'lec-sso 已更新至 50d43920-1-57',
      body: 'lec-sso 已完成新一轮校园生产环境发布（镜像版本 50d43920-1-57）。',
      payload: {},
      isRead: true,
      createdAt: '2026-11-24T12:00:00Z',
    };

    const detail = parseNotificationReleaseDetail(current, [current, previous]);
    expect(detail.isRelease).toBe(true);
    expect(detail.shortSha).toBe('748e4b80');
    expect(detail.previousShortSha).toBe('50d43920');
    expect(detail.compareUrl).toBe('https://github.com/lec-org/lec-sso/compare/50d43920...748e4b80');
    expect(detail.proposer?.githubLogin).toBe('Apries406');
    expect(detail.contributors).toHaveLength(2);
    expect(detail.contributors[0]?.githubLogin).toBe('Apries406');
    expect(detail.contributors[1]?.githubLogin).toBe('alice-gh');
    expect(detail.contributors[1]?.roleLabel).toBe('联合提交');
  });
});
