/** 基于 Liquid Glass `<Mention />` 的业务封装：支持通过 GitHub 用户名 / LecSSO Handle / 姓名自动反查已绑定的工作室成员，点击直接打开成员名片。 */
import { useMemo, type JSX } from 'react';
import { Mention, type MentionSize, type MentionTone } from '@lec-space/liquidglass';
import { resolveStudioMemberByHint, type MemberMentionHint } from '@shared/memberMatch';
import type { MemberProfileSeed } from '@/components/MemberProfileDialog';
import { SocialBrandGlyph } from '@/components/SocialBrandGlyph';
import { getOrbitClient } from '@/services/orbitClient';
import { useOrbitStore } from '@/stores/useOrbitStore';

export { resolveStudioMemberByHint, type MemberMentionHint };

export interface MemberMentionProps extends MemberMentionHint {
  size?: MentionSize;
  tone?: MentionTone;
  /** 点击已匹配工作室成员时触发（用于打开 MemberProfileDialog）。 */
  onSelectMember?: (seed: MemberProfileSeed) => void;
  className?: string;
}

export function MemberMention({
  githubLogin,
  handle,
  name,
  avatar,
  roleLabel,
  size = 'small',
  tone,
  onSelectMember,
  className,
}: MemberMentionProps): JSX.Element {
  const studioMembers = useOrbitStore((s) => s.studioMembers);

  const matched = useMemo(
    () => resolveStudioMemberByHint({ githubLogin, handle, name }, studioMembers),
    [githubLogin, handle, name, studioMembers],
  );

  const displayName =
    matched?.name ||
    matched?.username ||
    name?.trim() ||
    githubLogin?.trim() ||
    handle?.trim() ||
    '未知成员';

  const displayAvatar = matched?.avatar ?? matched?.social.github?.avatar ?? avatar ?? undefined;
  const resolvedTone: MentionTone = tone ?? (matched ? 'accent' : 'neutral');
  const fallbackGithubUrl =
    !matched && githubLogin?.trim()
      ? `https://github.com/${encodeURIComponent(githubLogin.trim())}`
      : null;

  const tooltip = matched
    ? `${matched.name || matched.username}${matched.social.github?.username ? ` · GitHub @${matched.social.github.username}` : ''}（点击查看工作室名片）`
    : fallbackGithubUrl
      ? `GitHub @${githubLogin}（未绑定 LecSSO，点击打开 GitHub 主页）`
      : displayName;

  const handleClick =
    matched && onSelectMember
      ? (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onSelectMember({
            id: matched.id,
            username: matched.username,
            displayName: matched.name || matched.username || displayName,
            realName: matched.name ?? undefined,
            avatar: matched.avatar,
            studioMember: matched,
          });
        }
      : fallbackGithubUrl
        ? (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            void getOrbitClient().system.openExternal(fallbackGithubUrl);
          }
        : undefined;

  return (
    <Mention
      name={displayName}
      avatar={displayAvatar}
      roleLabel={roleLabel}
      size={size}
      tone={resolvedTone}
      badge={!matched && githubLogin ? <SocialBrandGlyph target="github" size={11} /> : undefined}
      title={tooltip}
      className={className}
      onClick={handleClick}
    />
  );
}

export interface MemberMentionListProps {
  hints: readonly MemberMentionHint[];
  size?: MentionSize;
  maxVisible?: number;
  onSelectMember?: (seed: MemberProfileSeed) => void;
  className?: string;
}

/** 自动按已绑定工作室成员去重的多人 `@成员` 列表。 */
export function MemberMentionList({
  hints,
  size = 'regular',
  maxVisible = 6,
  onSelectMember,
  className,
}: MemberMentionListProps): JSX.Element {
  const studioMembers = useOrbitStore((s) => s.studioMembers);

  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ key: string; hint: MemberMentionHint }> = [];
    for (const hint of hints) {
      const matched = resolveStudioMemberByHint(hint, studioMembers);
      const key = matched
        ? `member:${matched.id}`
        : `raw:${(hint.githubLogin || hint.handle || hint.name || '').trim().toLowerCase()}`;
      if (!key || key === 'raw:' || seen.has(key)) continue;
      seen.add(key);
      result.push({ key, hint });
    }
    return result;
  }, [hints, studioMembers]);

  const visible = deduped.slice(0, maxVisible);
  const hiddenCount = Math.max(0, deduped.length - visible.length);

  return (
    <div className={`lg-mention-group ${className ?? ''}`.trim()}>
      {visible.map(({ key, hint }) => (
        <MemberMention
          key={key}
          githubLogin={hint.githubLogin}
          handle={hint.handle}
          name={hint.name}
          avatar={hint.avatar}
          roleLabel={hint.roleLabel}
          size={size}
          onSelectMember={onSelectMember}
        />
      ))}
      {hiddenCount > 0 && (
        <span
          className="lg-glass lg-mention-overflow"
          data-size={size}
          title={`还有 ${hiddenCount} 位贡献者`}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
