/** 工作室成员身份反查工具：按 GitHub 绑定账号、LecSSO Handle、真实姓名反查正式成员名片。 */
import type { StudioMemberCard } from './ipc';

export interface MemberMentionHint {
  /** GitHub 用户名（如 `Apries406`），优先通过 LecSSO 绑定关系反查工作室成员。 */
  githubLogin?: string | null;
  /** LecSSO Handle（如 `chenxinhao.apries`）。 */
  handle?: string | null;
  /** 显示名或 Git 提交作者名。 */
  name?: string | null;
  /** 兜底头像（未匹配到工作室成员时使用，例如 GitHub 头像）。 */
  avatar?: string | null;
  /** 可选角色副标（如 `提交者`、`需求提出`、`3 次提交`）。 */
  roleLabel?: string;
}

/** 通过 GitHub 绑定关系、LecSSO Handle 或真名反查工作室正式成员。 */
export function resolveStudioMemberByHint(
  hint: MemberMentionHint,
  studioMembers: readonly StudioMemberCard[],
): StudioMemberCard | undefined {
  const gh = hint.githubLogin?.trim().toLowerCase();
  if (gh) {
    const byGh = studioMembers.find(
      (m) => m.social.github?.username?.trim().toLowerCase() === gh,
    );
    if (byGh) return byGh;
  }

  const handle = hint.handle?.trim().toLowerCase();
  if (handle) {
    const byHandle = studioMembers.find((m) => m.username?.trim().toLowerCase() === handle);
    if (byHandle) return byHandle;
  }

  const name = hint.name?.trim();
  if (name) {
    const lower = name.toLowerCase();
    // 兼容未单独传 githubLogin 但 author 字段直接存了 GitHub login 的历史数据
    const byGhFromName = studioMembers.find(
      (m) => m.social.github?.username?.trim().toLowerCase() === lower,
    );
    if (byGhFromName) return byGhFromName;

    const byRealName = studioMembers.find((m) => m.name?.trim() === name);
    if (byRealName) return byRealName;

    const byGhName = studioMembers.find(
      (m) => m.social.github?.name?.trim().toLowerCase() === lower,
    );
    if (byGhName) return byGhName;

    const byHandleFromName = studioMembers.find(
      (m) => m.username?.trim().toLowerCase() === lower,
    );
    if (byHandleFromName) return byHandleFromName;
  }

  return undefined;
}
