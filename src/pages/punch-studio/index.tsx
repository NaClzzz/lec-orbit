/** LecPunch 工作室动态页：团队本周榜单、工作室成员名录（点击弹出个人信息卡）、团队活动及管理员快捷入口。 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  Avatar,
  Button,
  Card,
  Empty,
  Input,
  Message,
  SegmentedControl,
  Tag,
} from '@lec-space/liquidglass';
import { CalendarDays, ExternalLink, RefreshCw, Trophy } from '@lec-space/icons';
import { Award, ChevronRight, Search, Users } from 'lucide-react';
import { getOrbitEndpoints } from '@shared/env';
import type { StudioMemberCard } from '@shared/ipc';
import { formatReadableDuration } from '@shared/punch';
import {
  MemberProfileDialog,
  resolvePrimaryStudioRole,
  type MemberProfileSeed,
} from '@/components/MemberProfileDialog';
import { SocialBrandGlyph } from '@/components/SocialBrandGlyph';
import { TitleBadgeList } from '@/components/TitleBadge';
import { getOrbitClient } from '@/services/orbitClient';
import { useOrbitStore } from '@/stores/useOrbitStore';
import styles from './PunchStudio.module.css';

type StudioSegment = 'ranking' | 'members' | 'events';

interface GradeGroup {
  key: string;
  label: string;
  members: StudioMemberCard[];
}

export function PunchStudioPage(): JSX.Element {
  const auth = useOrbitStore((s) => s.auth);
  const ranking = useOrbitStore((s) => s.teamRanking);
  const teamActive = useOrbitStore((s) => s.teamActive);
  const events = useOrbitStore((s) => s.teamEvents);
  const studioMembers = useOrbitStore((s) => s.studioMembers);
  const studioMembersLoading = useOrbitStore((s) => s.studioMembersLoading);
  const studioMembersError = useOrbitStore((s) => s.studioMembersError);
  const refreshStudioMembers = useOrbitStore((s) => s.refreshStudioMembers);
  const openTitleCabinet = useOrbitStore((s) => s.openTitleCabinet);

  const [segment, setSegment] = useState<StudioSegment>('ranking');
  const [memberQuery, setMemberQuery] = useState('');
  const [profileSeed, setProfileSeed] = useState<MemberProfileSeed | null>(null);

  useEffect(() => {
    if (auth.authenticated && studioMembers.length === 0 && !studioMembersLoading) {
      void refreshStudioMembers();
    }
  }, [auth.authenticated, studioMembers.length, studioMembersLoading, refreshStudioMembers]);

  const activeNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of teamActive) {
      if (item.username) set.add(`u:${item.username.trim().toLowerCase()}`);
      if (item.realName) set.add(`n:${item.realName.trim()}`);
      const stripped = item.displayName.replace(/[（(].*[）)]$/, '').trim();
      if (stripped) set.add(`n:${stripped}`);
    }
    return set;
  }, [teamActive]);

  const isMemberActive = (member: StudioMemberCard): boolean => {
    if (member.username && activeNameSet.has(`u:${member.username.trim().toLowerCase()}`)) {
      return true;
    }
    if (member.name && activeNameSet.has(`n:${member.name.trim()}`)) {
      return true;
    }
    return false;
  };

  const filteredMemberGroups = useMemo<GradeGroup[]>(() => {
    const keyword = memberQuery.trim().toLowerCase();
    const matched = keyword
      ? studioMembers.filter((m) => {
          const hay = [
            m.name ?? '',
            m.username ?? '',
            m.enrollYear ? `${m.enrollYear}级` : '',
            m.social.github?.username ?? '',
            m.social.github?.name ?? '',
            m.social.feishu?.name ?? '',
            m.social.feishu?.enName ?? '',
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(keyword);
        })
      : studioMembers;

    const bucket = new Map<string, GradeGroup>();
    for (const m of matched) {
      const key = m.enrollYear ? String(m.enrollYear) : 'unknown';
      const label = m.enrollYear ? `${m.enrollYear} 级` : '其他成员';
      const existing = bucket.get(key);
      if (existing) {
        existing.members.push(m);
      } else {
        bucket.set(key, { key, label, members: [m] });
      }
    }

    return Array.from(bucket.values()).sort((a, b) => {
      if (a.key === 'unknown') return 1;
      if (b.key === 'unknown') return -1;
      return Number(b.key) - Number(a.key);
    });
  }, [studioMembers, memberQuery]);

  const openAdminInBrowser = () => {
    const base = getOrbitEndpoints().punchWebUrl;
    void getOrbitClient().system.openExternal(`${base}/admin-dashboard`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>工作室动态</h1>
          <p className={styles.subheading}>
            团队本周专注排行、工作室成员名片与近期活动 · 点击成员卡片查看公开资料与社交主页
          </p>
        </div>
        <div className={styles.actions}>
          {auth.authenticated && (
            <Button
              variant="glass"
              size="small"
              icon={<Award size={14} />}
              onClick={() => openTitleCabinet()}
            >
              我的称号
            </Button>
          )}
          {auth.isAdmin && (
            <Button
              variant="glass"
              size="small"
              icon={<ExternalLink size={14} />}
              onClick={openAdminInBrowser}
            >
              管理后台（浏览器）
            </Button>
          )}
          <SegmentedControl
            value={segment}
            onValueChange={(v) => setSegment(v as StudioSegment)}
            items={[
              { value: 'ranking', label: '团队周榜' },
              { value: 'members', label: '工作室成员' },
              { value: 'events', label: '团队活动' },
            ]}
          />
        </div>
      </header>

      {segment === 'ranking' && (
        <Card
          title={
            <span className={styles.cardTitle}>
              <Trophy size={16} /> 本周专注排行榜
            </span>
          }
          description="点击任意成员行即可查看其个人名片、GitHub 主页与飞书绑定状态"
        >
          {ranking.length === 0 ? (
            <Empty title="暂无本周排行数据" description="登录后将自动同步团队本周专注排行" />
          ) : (
            <ol className={styles.rankList}>
              {ranking.map((item, idx) => (
                <li key={item.userId}>
                  <button
                    type="button"
                    className={styles.rankRowBtn}
                    onClick={() =>
                      setProfileSeed({
                        id: item.userId,
                        username: item.username,
                        displayName: item.displayName,
                        realName: item.realName,
                        nickname: item.nickname,
                        avatar: item.avatar,
                        teamName: item.teamName,
                        titles: item.titles,
                        ranking: { ...item, rank: item.rank ?? idx + 1 },
                      })
                    }
                  >
                    <div className={styles.rankLeft}>
                      <span className={styles.rankIndex}>{item.rank ?? idx + 1}</span>
                      <Avatar src={item.avatar} name={item.realName || item.displayName} size="small" />
                      <div className={styles.rankText}>
                        <div className={styles.rankNameRow}>
                          <span className={styles.rankName}>{item.displayName}</span>
                          <TitleBadgeList titles={item.titles} size="xs" maxVisible={3} />
                        </div>
                        <div className={styles.rankTeam}>{item.teamName || '工作室成员'}</div>
                      </div>
                    </div>
                    <div className={styles.rankRight}>
                      {item.qualified && <Tag tone="success">已达标</Tag>}
                      <span className={styles.rankDuration}>
                        {formatReadableDuration(item.totalDurationSeconds)}
                      </span>
                      <ChevronRight size={14} className={styles.rowChevron} />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {segment === 'members' && (
        <Card
          title={
            <span className={styles.cardTitle}>
              <Users size={16} /> 工作室成员名片
              {studioMembers.length > 0 && (
                <Tag tone="neutral">{studioMembers.length} 人</Tag>
              )}
            </span>
          }
          description="按入学年级分组展示，点击任意成员卡片查看详细资料、本周考勤与 GitHub / 飞书信息"
        >
          <div className={styles.memberToolbar}>
            <div className={styles.memberSearchWrap}>
              <Input
                value={memberQuery}
                onValueChange={setMemberQuery}
                placeholder="搜索姓名、Handle、年级或 GitHub 用户名…"
                icon={<Search size={14} />}
              />
            </div>
            <Button
              variant="glass"
              size="small"
              icon={<RefreshCw size={14} />}
              loading={studioMembersLoading}
              onClick={() => void refreshStudioMembers(true)}
            >
              刷新名录
            </Button>
          </div>

          {studioMembersError && (
            <div className={styles.memberNotice}>
              <Message
                tone="error"
                action={{ label: '重试', onClick: () => void refreshStudioMembers(true) }}
              >
                {studioMembersError}
              </Message>
            </div>
          )}

          {studioMembersLoading && studioMembers.length === 0 ? (
            <Empty title="正在同步工作室成员名片…" description="首次加载会从 LecSSO 拉取正式成员资料" />
          ) : filteredMemberGroups.length === 0 ? (
            <Empty
              title={memberQuery.trim() ? '未找到匹配的成员' : '暂无工作室成员数据'}
              description={
                memberQuery.trim()
                  ? '试试换一个姓名、Handle 或 GitHub 用户名关键词'
                  : '点击右上角「刷新名录」重新同步'
              }
            />
          ) : (
            <div className={styles.gradeGroups}>
              {filteredMemberGroups.map((group) => (
                <section key={group.key} className={styles.gradeSection}>
                  <div className={styles.gradeHeader}>
                    <span className={styles.gradeTitle}>{group.label}</span>
                    <span className={styles.gradeCount}>{group.members.length} 人</span>
                  </div>
                  <div className={styles.memberGrid}>
                    {group.members.map((member) => {
                      const role = resolvePrimaryStudioRole(member.roles);
                      const online = isMemberActive(member);
                      const hasGithub = Boolean(member.social.github);
                      const hasFeishu = Boolean(member.social.feishu);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={styles.memberCard}
                          onClick={() =>
                            setProfileSeed({
                              id: member.id,
                              username: member.username,
                              displayName: member.name || member.username || '工作室成员',
                              realName: member.name ?? undefined,
                              avatar: member.avatar,
                              studioMember: member,
                            })
                          }
                        >
                          <div className={styles.memberCardTop}>
                            <div className={styles.memberAvatarWrap}>
                              <Avatar
                                src={member.avatar ?? undefined}
                                name={member.name || member.username || '成员'}
                                size="regular"
                              />
                              {online && (
                                <span className={styles.memberOnlineDot} title="正在工作室专注中" />
                              )}
                            </div>
                            <div className={styles.memberCardMeta}>
                              <div className={styles.memberCardNameRow}>
                                <span className={styles.memberCardName}>
                                  {member.name || member.username || '工作室成员'}
                                </span>
                                {role.tone !== 'neutral' && (
                                  <Tag tone={role.tone}>{role.label}</Tag>
                                )}
                              </div>
                              <div className={styles.memberCardHandle}>
                                {member.username ? `@${member.username}` : 'LEC 正式成员'}
                              </div>
                            </div>
                          </div>

                          <div className={styles.memberCardFoot}>
                            <div className={styles.memberSocialPills}>
                              {hasGithub && (
                                <span
                                  className={styles.memberSocialPill}
                                  title={
                                    member.social.github?.username
                                      ? `GitHub: @${member.social.github.username}`
                                      : '已绑定 GitHub'
                                  }
                                >
                                  <SocialBrandGlyph target="github" size={12} />
                                  {member.social.github?.username && (
                                    <span>@{member.social.github.username}</span>
                                  )}
                                </span>
                              )}
                              {hasFeishu && (
                                <span className={styles.memberSocialPill} title="已绑定工作室飞书">
                                  <SocialBrandGlyph target="feishu" size={12} />
                                  <span>飞书</span>
                                </span>
                              )}
                              {!hasGithub && !hasFeishu && (
                                <span className={styles.memberNoSocial}>点击查看名片</span>
                              )}
                            </div>
                            <ChevronRight size={13} className={styles.rowChevron} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      )}

      {segment === 'events' && (
        <Card
          title={
            <span className={styles.cardTitle}>
              <CalendarDays size={16} /> 工作室活动
            </span>
          }
        >
          {events.length === 0 ? (
            <Empty title="近期暂无公开活动" description="有新的技术分享或团建安排时会在此展示" />
          ) : (
            <ul className={styles.eventList}>
              {events.map((ev) => (
                <li key={ev.id} className={styles.eventRow}>
                  <div>
                    <div className={styles.eventTitle}>{ev.title}</div>
                    {ev.description && <p className={styles.eventDesc}>{ev.description}</p>}
                  </div>
                  <div className={styles.eventMeta}>
                    {ev.startTime && (
                      <Tag tone="neutral">{new Date(ev.startTime).toLocaleDateString('zh-CN')}</Tag>
                    )}
                    {ev.location && <Tag tone="info">{ev.location}</Tag>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <MemberProfileDialog seed={profileSeed} onClose={() => setProfileSeed(null)} />
    </div>
  );
}
