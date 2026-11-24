/** 第三方账号绑定管理卡片：实时读取 LecSSO 已启用的 GitHub / 飞书绑定状态，展示头像、@用户名/主页链接，并支持跳转系统浏览器完成绑定、换绑与解绑。 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Button, Card, Message, Tag } from '@lec-space/liquidglass';
import { RefreshCw } from '@lec-space/icons';
import { ArrowUpRight, ExternalLink, Link2, Unlink } from 'lucide-react';
import { getOrbitEndpoints } from '@shared/env';
import type { SocialConnectionItem } from '@shared/ipc';
import { SocialBrandGlyph } from '@/components/SocialBrandGlyph';
import { getOrbitClient } from '@/services/orbitClient';
import { notifyToast } from '@/services/orbitToast';
import styles from './Settings.module.css';

/** 已绑定且存在第三方头像时展示头像 + 右下角品牌角标，否则展示品牌图标。 */
function SocialVisual({ item }: { item: SocialConnectionItem }): JSX.Element {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUrl = item.linked ? item.identity?.avatar : null;
  const normalized = item.target.toLowerCase();
  const brandToneClass =
    normalized === 'github'
      ? styles.socialIconGithub
      : normalized === 'feishu' || normalized === 'lark'
        ? styles.socialIconFeishu
        : '';

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !avatarFailed) {
    return (
      <span className={styles.socialAvatarWrap}>
        <img
          src={avatarUrl}
          alt={item.name}
          className={styles.socialAvatarImg}
          onError={() => setAvatarFailed(true)}
        />
        <span className={`${styles.socialCornerBadge} ${brandToneClass}`} aria-hidden="true">
          <SocialBrandGlyph target={item.target} size={11} />
        </span>
      </span>
    );
  }

  return (
    <span className={`${styles.socialIcon} ${brandToneClass}`} aria-hidden="true">
      <SocialBrandGlyph target={item.target} size={18} />
    </span>
  );
}

/** 构造已绑定账号的主显示名（GitHub 优先展示 @username，飞书优先展示姓名）与次要信息。 */
function buildIdentityPresentation(item: SocialConnectionItem): {
  primary: string;
  secondary: string | null;
  profileUrl: string | null;
} {
  const id = item.identity;
  if (!item.linked || !id) {
    return {
      primary: `绑定后可直接使用 ${item.name} 在 LecSSO 登录页快捷登录`,
      secondary: null,
      profileUrl: null,
    };
  }

  if (item.target === 'github') {
    const handle = id.username ? `@${id.username}` : null;
    const primary =
      id.name && handle && id.name !== id.username
        ? `${id.name}（${handle}）`
        : handle ?? id.name ?? id.email ?? `ID: ${id.userId}`;
    const secondary = id.email && id.email !== primary ? id.email : null;
    return { primary, secondary, profileUrl: id.profileUrl };
  }

  const nameParts = [id.name, id.username].filter(
    (v, idx, arr): v is string => Boolean(v) && arr.indexOf(v) === idx,
  );
  const primary = nameParts.join(' · ') || id.email || `ID: ${id.userId}`;
  const secondary = id.email && id.email !== primary ? id.email : null;
  return { primary, secondary, profileUrl: id.profileUrl };
}

export function SocialBindingsCard(): JSX.Element {
  const [items, setItems] = useState<SocialConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 记录是否刚跳转到系统浏览器执行绑定/解绑，切回 Orbit 窗口时自动刷新
  const pendingBrowserSyncRef = useRef(false);

  const loadConnections = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    const res = await getOrbitClient().auth.getSocialConnections();
    setLoading(false);
    if (res.ok) {
      setItems(res.items);
      return;
    }
    setError(res.message || '获取第三方账号绑定状态失败，请稍后重试。');
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    const handleFocus = () => {
      if (!pendingBrowserSyncRef.current) return;
      pendingBrowserSyncRef.current = false;
      void loadConnections(true);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadConnections]);

  const { ssoEndpoint } = getOrbitEndpoints();
  const baseSso = ssoEndpoint.replace(/\/+$/, '');
  const returnUrl = encodeURIComponent(`${baseSso}/portal`);

  const openSocialAction = async (
    item: SocialConnectionItem,
    action: 'add' | 'change' | 'remove',
  ) => {
    const suffix = action === 'add' ? '' : `/${action}`;
    const url = `${baseSso}/account/social/${encodeURIComponent(item.connectorId)}${suffix}?redirect=${returnUrl}`;
    pendingBrowserSyncRef.current = true;
    await getOrbitClient().system.openExternal(url);
    const actionLabel = action === 'add' ? '绑定' : action === 'change' ? '换绑' : '解绑';
    notifyToast({
      tone: 'info',
      title: `已在浏览器打开 ${item.name} ${actionLabel}页`,
      description: '完成验证后切回 Orbit，绑定状态将自动刷新。',
    });
  };

  const openAccountSecurity = async () => {
    pendingBrowserSyncRef.current = true;
    await getOrbitClient().system.openExternal(`${baseSso}/account/security`);
  };

  return (
    <Card title="第三方账号绑定（GitHub / 飞书）">
      <div className={styles.socialHeader}>
        <div className={styles.settingDesc}>
          绑定后可在 LecSSO 登录页一键快捷登录；未绑定的第三方账号登录时将被引导至注册页。
        </div>
        <div className={styles.accountActions}>
          <Button
            variant="glass"
            size="small"
            icon={<RefreshCw size={14} />}
            loading={loading}
            onClick={() => void loadConnections()}
          >
            刷新
          </Button>
          <Button
            variant="glass"
            size="small"
            icon={<ExternalLink size={14} />}
            onClick={() => void openAccountSecurity()}
          >
            账户安全中心
          </Button>
        </div>
      </div>

      {error && (
        <div className={styles.socialMessage}>
          <Message
            tone="error"
            action={{ label: '重试', onClick: () => void loadConnections() }}
          >
            {error}
          </Message>
        </div>
      )}

      <div className={styles.socialList}>
        {loading && items.length === 0 ? (
          <div className={styles.socialEmpty}>正在同步 LecSSO 第三方账号绑定状态…</div>
        ) : items.length === 0 && !error ? (
          <div className={styles.socialEmpty}>
            当前暂未启用第三方社交连接器，管理员在 LecSSO 控制台配置后将自动展示在此处。
          </div>
        ) : (
          items.map((item) => {
            const view = buildIdentityPresentation(item);
            return (
              <div key={item.connectorId} className={styles.socialRow}>
                <div className={styles.socialLeft}>
                  <SocialVisual item={item} />
                  <div className={styles.socialInfo}>
                    <div className={styles.socialTitleRow}>
                      <span className={styles.settingTitle}>{item.name}</span>
                      <Tag tone={item.linked ? 'success' : 'neutral'}>
                        {item.linked ? '已绑定' : '未绑定'}
                      </Tag>
                    </div>
                    <div className={styles.socialMetaLine}>
                      {view.profileUrl ? (
                        <button
                          type="button"
                          className={styles.socialProfileLink}
                          title={`在浏览器中打开 ${view.profileUrl}`}
                          onClick={() => void getOrbitClient().system.openExternal(view.profileUrl!)}
                        >
                          <span>{view.primary}</span>
                          <ArrowUpRight size={12} />
                        </button>
                      ) : (
                        <span className={item.linked ? styles.socialPrimaryText : styles.socialSub}>
                          {view.primary}
                        </span>
                      )}
                      {view.secondary && (
                        <>
                          <span className={styles.socialDot}>·</span>
                          <span className={styles.socialSub}>{view.secondary}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.accountActions}>
                  {item.linked ? (
                    <>
                      <Button
                        variant="glass"
                        size="small"
                        icon={<ExternalLink size={13} />}
                        onClick={() => void openSocialAction(item, 'change')}
                      >
                        换绑
                      </Button>
                      <Button
                        variant="glass"
                        size="small"
                        destructive
                        icon={<Unlink size={13} />}
                        onClick={() => void openSocialAction(item, 'remove')}
                      >
                        解绑
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="filled"
                      size="small"
                      icon={<Link2 size={13} />}
                      onClick={() => void openSocialAction(item, 'add')}
                    >
                      立即绑定
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
