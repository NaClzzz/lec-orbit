/** Orbit 更新内容与贡献者弹窗：支持更新前预览、更新后首次自动弹窗（What's New）与设置页回看，所有修复/开发成员自动按 GitHub 绑定展示为可点击的 @成员 胶囊。 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Button, Dialog, Message, Tag } from '@lec-space/liquidglass';
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  ExternalLink,
  GitCommitHorizontal,
  GitCompareArrows,
  Rocket,
  Sparkles,
  Users,
} from 'lucide-react';
import type { UpdateChangelog, UpdateCheckResult } from '@shared/ipc';
import {
  CHANGELOG_CATEGORY_META,
  parseReleaseNotesToChangelog,
} from '@shared/updateChangelog';
import { MemberMention, MemberMentionList } from '@/components/MemberMention';
import { MemberProfileDialog, type MemberProfileSeed } from '@/components/MemberProfileDialog';
import { getOrbitClient } from '@/services/orbitClient';
import { useOrbitStore } from '@/stores/useOrbitStore';
import styles from './UpdateChangelogDialog.module.css';

export interface UpdateChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** update：发现新版本/下载更新；whats-new：更新完成后首次启动自动弹窗；history：设置页手动查看当前版本日志。 */
  mode: 'update' | 'whats-new' | 'history';
  version: string;
  previousVersion?: string;
  publishedAt?: string;
  releaseUrl?: string;
  rawNotes?: string;
  changelog?: UpdateChangelog | null;
  updateInfo?: UpdateCheckResult | null;
}

export function UpdateChangelogDialog({
  open,
  onOpenChange,
  mode,
  version,
  previousVersion,
  publishedAt,
  releaseUrl,
  rawNotes,
  changelog: providedChangelog,
  updateInfo,
}: UpdateChangelogDialogProps): JSX.Element {
  const studioMembers = useOrbitStore((s) => s.studioMembers);
  const refreshStudioMembers = useOrbitStore((s) => s.refreshStudioMembers);

  const [fetchedChangelog, setFetchedChangelog] = useState<UpdateChangelog | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileSeed, setProfileSeed] = useState<MemberProfileSeed | null>(null);

  useEffect(() => {
    if (!open) return;
    if (studioMembers.length === 0) {
      void refreshStudioMembers();
    }
  }, [open, refreshStudioMembers, studioMembers.length]);

  useEffect(() => {
    if (!open) return;
    if (providedChangelog && (providedChangelog.items.length > 0 || providedChangelog.rawNotes)) {
      setFetchedChangelog(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getOrbitClient()
      .system.getVersionChangelog(version)
      .then((res) => {
        if (!cancelled && res) {
          setFetchedChangelog(res);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, providedChangelog, version]);

  const resolvedChangelog = useMemo<UpdateChangelog>(() => {
    if (providedChangelog && (providedChangelog.items.length > 0 || providedChangelog.rawNotes)) {
      return providedChangelog;
    }
    if (fetchedChangelog && (fetchedChangelog.items.length > 0 || fetchedChangelog.rawNotes)) {
      return fetchedChangelog;
    }
    return parseReleaseNotesToChangelog({
      version,
      previousVersion,
      publishedAt,
      releaseUrl,
      rawNotes,
    });
  }, [fetchedChangelog, previousVersion, providedChangelog, publishedAt, rawNotes, releaseUrl, version]);

  const cleanVersion = (resolvedChangelog.version || version).replace(/^v/i, '');
  const cleanPrev = (resolvedChangelog.previousVersion || previousVersion)?.replace(/^v/i, '');
  const effectivePublishedAt = resolvedChangelog.publishedAt || publishedAt;
  const effectiveReleaseUrl = resolvedChangelog.releaseUrl || releaseUrl;
  const effectiveCompareUrl = resolvedChangelog.compareUrl;

  const statsSummary = useMemo(() => {
    const featCount = resolvedChangelog.items.filter((i) => i.category === 'feat').length;
    const fixCount = resolvedChangelog.items.filter((i) => i.category === 'fix').length;
    const parts: string[] = [];
    if (featCount > 0) parts.push(`${featCount} 项新功能`);
    if (fixCount > 0) parts.push(`${fixCount} 项修复`);
    if (parts.length === 0 && resolvedChangelog.items.length > 0) {
      parts.push(`${resolvedChangelog.items.length} 项更新`);
    }
    if (resolvedChangelog.contributors.length > 0) {
      parts.push(`${resolvedChangelog.contributors.length} 位伙伴参与`);
    }
    return parts.join(' · ');
  }, [resolvedChangelog.contributors.length, resolvedChangelog.items]);

  const dialogTitle =
    mode === 'whats-new'
      ? `Orbit 已更新至 v${cleanVersion}`
      : mode === 'history'
        ? `Orbit v${cleanVersion} 更新日志`
        : updateInfo?.stage === 'downloaded'
          ? `Orbit v${cleanVersion} 已下载就绪`
          : `发现 Orbit 新版本 v${cleanVersion}`;

  const dialogDescription =
    mode === 'whats-new'
      ? `感谢更新！看看本次版本新增了哪些功能、修复了哪些问题，以及参与本次发布的伙伴。`
      : mode === 'history'
        ? effectivePublishedAt
          ? `发布于 ${new Date(effectivePublishedAt).toLocaleDateString('zh-CN')}`
          : '当前客户端版本变更说明与贡献成员'
        : `当前版本 v${updateInfo?.currentVersion ?? previousVersion ?? '0.1.0'}${
            effectivePublishedAt
              ? ` · 发布于 ${new Date(effectivePublishedAt).toLocaleDateString('zh-CN')}`
              : ''
          }`;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="regular"
        title={
          <span className={styles.titleRow}>
            <span className={mode === 'whats-new' ? styles.badgeIconCelebrate : styles.badgeIconRocket}>
              {mode === 'whats-new' ? <Sparkles size={15} /> : <Rocket size={15} />}
            </span>
            <span>{dialogTitle}</span>
          </span>
        }
        description={dialogDescription}
      >
        <div className={styles.body}>
          {/* 版本升级路径与汇总概览 */}
          <div className={styles.heroCard}>
            <div className={styles.versionFlow}>
              {cleanPrev && cleanPrev !== cleanVersion ? (
                <>
                  <span className={styles.verChipMuted}>v{cleanPrev}</span>
                  <ArrowRight size={13} className={styles.verArrow} />
                  <span className={styles.verChipActive}>v{cleanVersion}</span>
                </>
              ) : (
                <span className={styles.verChipActive}>v{cleanVersion}</span>
              )}
              {mode === 'whats-new' && <Tag tone="success">已升级完成</Tag>}
              {mode === 'update' && updateInfo?.stage === 'downloaded' && (
                <Tag tone="success">安装包就绪</Tag>
              )}
            </div>
            {statsSummary && <div className={styles.statsSummary}>{statsSummary}</div>}
          </div>

          {/* 参与贡献成员（按 LecSSO 绑定的 GitHub 账号自动映射为工作室 @成员） */}
          {resolvedChangelog.contributors.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <Users size={14} /> 参与本次更新的成员
              </div>
              <div className={styles.contributorCard}>
                <MemberMentionList
                  size="regular"
                  maxVisible={12}
                  hints={resolvedChangelog.contributors.map((c) => ({
                    githubLogin: c.githubLogin,
                    name: c.name,
                    avatar: c.avatar,
                    roleLabel:
                      c.roleLabel ??
                      (c.commits && c.commits > 1 ? `${c.commits} 次提交` : '贡献者'),
                  }))}
                  onSelectMember={setProfileSeed}
                />
                <span className={styles.contributorHint}>
                  已按 LecSSO 绑定的 GitHub 账号自动关联工作室成员，点击胶囊可查看个人名片
                </span>
              </div>
            </div>
          )}

          {/* 结构化变更明细：每条清晰展示改了啥 + 谁修的 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <GitCommitHorizontal size={14} /> 本次更新内容
            </div>

            {loading ? (
              <div className={styles.loadingBox}>正在加载本次版本的改动记录与修复成员…</div>
            ) : resolvedChangelog.items.length > 0 ? (
              <ul className={styles.changeList}>
                {resolvedChangelog.items.map((item) => {
                  const cat = CHANGELOG_CATEGORY_META[item.category] ?? CHANGELOG_CATEGORY_META.other;
                  return (
                    <li key={item.id} className={styles.changeItem}>
                      <div className={styles.changeHead}>
                        <Tag tone={cat.tone}>{cat.label}</Tag>
                        {item.scope && <span className={styles.scopeChip}>{item.scope}</span>}
                        <span className={styles.changeTitle}>{item.title}</span>
                      </div>
                      {(item.authorLogin || item.authorName || item.shortSha || item.url) && (
                        <div className={styles.changeMeta}>
                          {(item.authorLogin || item.authorName) && (
                            <MemberMention
                              size="small"
                              githubLogin={item.authorLogin}
                              name={item.authorName}
                              avatar={item.authorAvatar}
                              onSelectMember={setProfileSeed}
                            />
                          )}
                          {item.shortSha && item.url ? (
                            <button
                              type="button"
                              className={styles.shaLinkBtn}
                              onClick={() => void getOrbitClient().system.openExternal(item.url!)}
                            >
                              {item.shortSha} <ArrowUpRight size={11} />
                            </button>
                          ) : item.url ? (
                            <button
                              type="button"
                              className={styles.shaLinkBtn}
                              onClick={() => void getOrbitClient().system.openExternal(item.url!)}
                            >
                              查看提交 <ArrowUpRight size={11} />
                            </button>
                          ) : item.shortSha ? (
                            <span className={styles.shaStatic}>{item.shortSha}</span>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : resolvedChangelog.rawNotes ? (
              <div className={styles.rawNotesBox}>{resolvedChangelog.rawNotes}</div>
            ) : (
              <div className={styles.emptyBox}>
                本次版本包含功能优化、稳定性提升及最新内置 LecDoc 前端版本。可点击下方按钮前往 GitHub 查看完整变更记录。
              </div>
            )}
          </div>

          {/* 下载进度条与错误提示（仅更新前模式） */}
          {mode === 'update' && updateInfo?.stage === 'downloading' && (
            <div className={styles.progressWrap}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${updateInfo.progressPercent ?? 0}%` }}
                />
              </div>
              <span className={styles.progressText}>
                {(updateInfo.progressPercent ?? 0) >= 95 && updateInfo.canAutoInstall
                  ? '下载完成，正在校验并准备更新包…'
                  : `应用内下载中 ${updateInfo.progressPercent ?? 0}%${
                      updateInfo.assetName ? `（${updateInfo.assetName}）` : ''
                    }`}
              </span>
            </div>
          )}

          {mode === 'update' && updateInfo?.stage === 'error' && updateInfo.errorMessage && (
            <Message tone="error">{updateInfo.errorMessage}</Message>
          )}

          {/* 底部操作栏 */}
          <div className={styles.footer}>
            <div className={styles.footerLeft}>
              {effectiveCompareUrl && (
                <Button
                  variant="glass"
                  size="small"
                  icon={<GitCompareArrows size={13} />}
                  onClick={() => void getOrbitClient().system.openExternal(effectiveCompareUrl)}
                >
                  版本 Diff
                </Button>
              )}
              {effectiveReleaseUrl && (
                <Button
                  variant="glass"
                  size="small"
                  icon={<ExternalLink size={13} />}
                  onClick={() => void getOrbitClient().system.openExternal(effectiveReleaseUrl)}
                >
                  GitHub 发布页
                </Button>
              )}
            </div>

            <div className={styles.footerRight}>
              {mode === 'update' ? (
                <>
                  <Button variant="glass" size="small" onClick={() => onOpenChange(false)}>
                    稍后
                  </Button>
                  {updateInfo?.stage === 'downloaded' ? (
                    <Button
                      variant="filled"
                      size="small"
                      onClick={() => void getOrbitClient().system.installUpdate()}
                    >
                      {updateInfo.canAutoInstall ? '重启以更新' : '打开安装包'}
                    </Button>
                  ) : (
                    <Button
                      variant="filled"
                      size="small"
                      icon={<Download size={14} />}
                      loading={updateInfo?.stage === 'downloading'}
                      onClick={() => void getOrbitClient().system.downloadUpdate()}
                    >
                      {updateInfo?.stage === 'downloading'
                        ? (updateInfo.progressPercent ?? 0) >= 95 && updateInfo.canAutoInstall
                          ? '正在准备更新包…'
                          : `下载中 ${updateInfo.progressPercent ?? 0}%`
                        : '应用内下载更新'}
                    </Button>
                  )}
                </>
              ) : (
                <Button variant="filled" size="small" onClick={() => onOpenChange(false)}>
                  {mode === 'whats-new' ? '知道了，开始使用' : '关闭'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      <MemberProfileDialog seed={profileSeed} onClose={() => setProfileSeed(null)} />
    </>
  );
}
