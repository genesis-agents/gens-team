'use client';

/**
 * ProviderKeyHelpModal —— 「去哪申请 API Key」帮助弹层（2026-07-31）
 *
 * 背景：用户在「API Keys」页配置 Personal Key 时，界面上没有任何获取指引，
 * 只能自己去搜。本弹层按 provider 列出直达申领页的入口。
 *
 * 数据来源：**唯一真源是 DB ai_providers**（经 /user/api-keys 随 providers 返回），
 * 与「添加模型」下拉同一份数据。这里不维护任何前端硬编码的 provider 清单——
 * 那正是 2026-06-01 收敛掉的反模式（KNOWN_PROVIDERS 与 DB 两套数据源互相漂移）。
 * 新增 provider 只要进 AI_PROVIDER_CATALOG，本弹层自动出现。
 *
 * 链接回落链：apiKeyUrl（申领页，最准）→ docUrl（文档首页）→ 无链接（本地部署类
 * 如 Ollama / vLLM / LM Studio 本就不需要 Key）。
 */

import { ExternalLink, KeyRound } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Modal } from '@/components/ui/dialogs/Modal';
import { EmptyState } from '@/components/ui/states/EmptyState';
import type { ProviderInfo } from '@/hooks/features/useUserApiKeys';

interface Props {
  open: boolean;
  onClose: () => void;
  providers: ProviderInfo[];
}

export function ProviderKeyHelpModal({ open, onClose, providers }: Props) {
  const { t } = useTranslation();

  // 有申领页或文档页的排前面；本地部署类（两者皆无）沉底
  const sorted = [...providers].sort((a, b) => {
    const aHas = a.apiKeyUrl || a.docUrl ? 0 : 1;
    const bHas = b.apiKeyUrl || b.docUrl ? 0 : 1;
    return aHas - bHas;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('me.apiKeys.help.title')}
      subtitle={t('me.apiKeys.help.subtitle')}
    >
      {sorted.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title={t('me.apiKeys.help.emptyTitle')}
          description={t('me.apiKeys.help.emptyDescription')}
        />
      ) : (
        <ul className="divide-y divide-gray-100">
          {sorted.map((p) => {
            const href = p.apiKeyUrl || p.docUrl;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {p.name}
                  </p>
                  {p.freeTierNote && (
                    <p className="mt-0.5 truncate text-xs text-emerald-600">
                      {p.freeTierNote}
                    </p>
                  )}
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {p.apiKeyUrl
                      ? t('me.apiKeys.help.getKey')
                      : t('me.apiKeys.help.viewDocs')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-gray-400">
                    {t('me.apiKeys.help.noKeyNeeded')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
