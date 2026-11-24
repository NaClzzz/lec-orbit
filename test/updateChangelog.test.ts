import { describe, expect, it } from 'bun:test';
import {
  buildChangelogFromCommits,
  compareOrbitSemver,
  parseReleaseNotesToChangelog,
} from '../src/shared/updateChangelog';

describe('compareOrbitSemver', () => {
  it('正确比较带或不带 v 前缀的语义化版本', () => {
    expect(compareOrbitSemver('0.2.1', '0.2.0')).toBe(1);
    expect(compareOrbitSemver('v0.2.0', '0.2.0')).toBe(0);
    expect(compareOrbitSemver('0.1.8', '0.2.0')).toBe(-1);
    expect(compareOrbitSemver('1.0.0', '0.9.9')).toBe(1);
  });
});

describe('parseReleaseNotesToChangelog', () => {
  it('解析 GitHub 自动生成的 Release Notes、修复成员与 Full Changelog 链接', () => {
    const rawNotes = [
      "## What's Changed",
      '* feat(inbox): 通知中心支持查看发布变更详情 by @Apries406 in https://github.com/lec-org/lec-orbit/pull/18',
      '* fix(updater): 修复 macOS 重启更新弹窗闪退 by @bob-dev in https://github.com/lec-org/lec-orbit/pull/19',
      '* perf(doc): 优化文档切页内存占用 (@Apries406)',
      '',
      '## New Contributors',
      '* @bob-dev made their first contribution in https://github.com/lec-org/lec-orbit/pull/19',
      '',
      '**Full Changelog**: https://github.com/lec-org/lec-orbit/compare/v0.2.0...v0.2.1',
    ].join('\n');

    const log = parseReleaseNotesToChangelog({
      version: 'v0.2.1',
      rawNotes,
    });

    expect(log.version).toBe('0.2.1');
    expect(log.previousVersion).toBe('0.2.0');
    expect(log.compareUrl).toBe('https://github.com/lec-org/lec-orbit/compare/v0.2.0...v0.2.1');
    expect(log.items).toHaveLength(3);
    expect(log.items[0]?.category).toBe('feat');
    expect(log.items[0]?.scope).toBe('inbox');
    expect(log.items[0]?.authorLogin).toBe('Apries406');
    expect(log.items[1]?.category).toBe('fix');
    expect(log.items[1]?.authorLogin).toBe('bob-dev');
    expect(log.items[2]?.category).toBe('perf');
    expect(log.items[2]?.authorLogin).toBe('Apries406');
    expect(log.contributors).toHaveLength(2);
    expect(log.contributors[0]?.githubLogin).toBe('Apries406');
    expect(log.contributors[0]?.commits).toBe(2);
    expect(log.contributors[1]?.githubLogin).toBe('bob-dev');
  });
});

describe('buildChangelogFromCommits', () => {
  it('过滤合并提交、分类展示并提取 Co-authored-by 联合提交者', () => {
    const log = buildChangelogFromCommits({
      version: '0.2.1',
      previousVersion: '0.2.0',
      commits: [
        {
          sha: '1111111aaaaaaa',
          message: 'Merge pull request #20 from lec-org/feat-mention',
          authorLogin: 'Apries406',
        },
        {
          sha: '2222222bbbbbbb',
          message:
            'feat(mention): 新增液体玻璃 @组件\n\nCo-authored-by: Alice <42+alice-gh@users.noreply.github.com>',
          authorName: 'Apries406',
          authorLogin: 'Apries406',
        },
        {
          sha: '3333333ccccccc',
          message: 'fix(settings): 修复飞书图标清晰度',
          authorName: 'Apries406',
          authorLogin: 'Apries406',
        },
      ],
    });

    expect(log.items).toHaveLength(2);
    expect(log.items[0]?.shortSha).toBe('2222222');
    expect(log.items[0]?.category).toBe('feat');
    expect(log.items[1]?.category).toBe('fix');
    expect(log.contributors).toHaveLength(2);
    expect(log.contributors[0]?.githubLogin).toBe('Apries406');
    expect(log.contributors[0]?.commits).toBe(2);
    expect(log.contributors[1]?.githubLogin).toBe('alice-gh');
    expect(log.contributors[1]?.roleLabel).toBe('联合提交');
  });
});
