'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';
import { useTranslation } from '@/lib/i18n';

export interface AutoConfigureResult {
  createdCount: number;
  skippedCount: number;
  items: Array<{
    provider: string;
    modelType: string;
    modelId: string;
    action: 'created' | 'skipped' | 'skipped-provider-no-match';
    reason?: string;
  }>;
  missingTypes: string[];
  providersScanned?: string[];
  /**
   * 没配成的 modelType 及逐 provider 的原因（2026-07-31）。
   *
   * 后端核心循环原本有 4 个静默 continue，用户点完只看到少了几个类型（最常见
   * CHAT_FAST），界面上零解释。档位本来就无法从 provider 的 /v1/models 推断，
   * 只能靠模型名正则猜，模型改名就失效——既然猜不准是结构性的，至少要让
   * "猜失败了"可见，并告诉用户下一步该干嘛。
   */
  unconfigured?: Array<{
    modelType: string;
    attempts: Array<{
      provider: string;
      reason:
        | 'no-key'
        | 'no-models-returned'
        | 'no-recommendation'
        | 'no-pattern-match'
        | 'all-probes-failed';
      detail?: string;
    }>;
  }>;
}

export interface AutoConfigureButtonProps {
  /** 后端接口路径，相对于 apiClient 的 baseURL */
  endpoint: string;
  /** 按钮文字（默认"一键 AI 配置"） */
  label?: string;
  /** 禁用按钮时的提示 */
  disabledReason?: string;
  /** 禁用按钮（例如还没配 Key 时） */
  disabled?: boolean;
  /** 完成后的回调（用于父组件刷新列表） */
  onDone?: () => void;
  /** 确认 Modal 的副标题 */
  confirmSubtitle?: string;
  /** 确认 Modal 里的步骤文案（4 条左右） */
  bullets?: string[];
  /** 完成后底部提示（蓝色卡片） */
  successNote?: string;
}

/**
 * 通用一键 AI 配置按钮 —— user + admin 共用。
 *
 * - 按钮：purple sparkles，同系 Add Model 风格
 * - 点击 → Confirm Modal → 发起请求 → Result Modal
 * - endpoint 由父组件传入（user: /user/model-configs/auto-configure；
 *   admin: /admin/ai-models/auto-configure）
 */
export function AutoConfigureButton({
  endpoint,
  label = '一键 AI 配置',
  disabled,
  disabledReason,
  onDone,
  confirmSubtitle = '自动为每个已配 Key 创建推荐模型',
  bullets,
  successNote = '结果可以随时在列表里编辑、删除或改默认。',
}: AutoConfigureButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AutoConfigureResult | null>(null);

  const defaultBullets = [
    '用你配置的每个 Key 调 Provider 的 /v1/models',
    '按推荐矩阵（OpenAI / Claude / Cohere 等）自动选 modelId',
    '为每个 modelType 创建模型配置，第一个命中自动设为默认',
    '已经配置过的模型不会重复创建',
  ];

  const run = async () => {
    setRunning(true);
    try {
      const res = await apiClient.post<AutoConfigureResult>(endpoint, {});
      setResult(res);
      if (res.createdCount > 0) {
        toast.success(
          `已创建 ${res.createdCount} 个模型配置${
            res.skippedCount ? `，跳过 ${res.skippedCount} 个` : ''
          }`
        );
      } else if (res.skippedCount > 0) {
        toast.info('所有推荐模型已经配置过了');
      } else {
        toast.error(
          '没有可配置的模型。请确认至少有一个 Provider 的 Key 能正常访问 /v1/models'
        );
      }
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message || '一键配置失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={disabled || running}
        className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 shadow-sm transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
        title={
          disabled ? disabledReason : `${label}：自动跑推荐矩阵为你建齐模型`
        }
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {label}
      </button>

      {showConfirm && !result && (
        <Modal
          open
          onClose={() => setShowConfirm(false)}
          size="md"
          title={label}
          subtitle={confirmSubtitle}
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={running}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={run}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                开始自动配置
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-gray-700">
            <p>系统会：</p>
            <ol className="ml-5 list-decimal space-y-1 text-gray-600">
              {(bullets ?? defaultBullets).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
            <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-800">
              {successNote}
            </p>
          </div>
        </Modal>
      )}

      {result && (
        <AutoConfigureResultModal
          result={result}
          onClose={() => {
            setResult(null);
            setShowConfirm(false);
          }}
        />
      )}
    </>
  );
}

/**
 * 逐类型解释「为什么没配上」，并给出该原因对应的下一步动作。
 *
 * 只展示**最有解释力的那一条** attempt：优先级为
 *   no-pattern-match（正则失效，最常见且可自助修）
 *   > all-probes-failed（匹配到但调不通）
 *   > no-models-returned > no-recommendation > no-key
 * 全列出来会变成一堵墙——偏好表里十几个 provider 大多只是"用户没配 Key"。
 */
function UnconfiguredReasons({
  unconfigured,
}: {
  unconfigured?: AutoConfigureResult['unconfigured'];
}) {
  const { t } = useTranslation();
  if (!unconfigured || unconfigured.length === 0) return null;

  const PRIORITY: Array<
    NonNullable<
      AutoConfigureResult['unconfigured']
    >[number]['attempts'][number]['reason']
  > = [
    'no-pattern-match',
    'all-probes-failed',
    'no-models-returned',
    'no-recommendation',
    'no-key',
  ];

  return (
    <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-700">
        {t('modelConfig.autoConfigure.whyMissing')}
      </p>
      {unconfigured.map((u) => {
        const best = PRIORITY.map((r) =>
          u.attempts.find((a) => a.reason === r)
        ).find(Boolean);
        return (
          <div key={u.modelType} className="text-xs text-slate-600">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
              {u.modelType}
            </span>{' '}
            {best
              ? t(`modelConfig.autoConfigure.reason.${best.reason}`, {
                  provider: best.provider,
                })
              : t('modelConfig.autoConfigure.reason.no-key', { provider: '-' })}
            {best?.reason === 'no-pattern-match' && best.detail && (
              <span className="font-mono ml-1 break-all text-[11px] text-slate-400">
                {best.detail}
              </span>
            )}
          </div>
        );
      })}
      <p className="pt-1 text-xs text-slate-500">
        {t('modelConfig.autoConfigure.whyMissingNextStep')}
      </p>
    </div>
  );
}

function AutoConfigureResultModal({
  result,
  onClose,
}: {
  result: AutoConfigureResult;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="一键配置完成"
      subtitle={`创建 ${result.createdCount} 个，跳过 ${result.skippedCount} 个`}
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            完成
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {result.missingTypes.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            以下必需类型仍未配置：
            <strong> {result.missingTypes.join(', ')}</strong>
            。建议手动添加或为这些类型的 Provider 配置 Key。
          </div>
        )}
        <UnconfiguredReasons unconfigured={result.unconfigured} />
        {result.providersScanned && result.providersScanned.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
            已扫描 Provider：
            <strong> {result.providersScanned.join(', ')}</strong>
          </div>
        )}
        {result.items.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">
            没有可匹配的模型。请检查 Provider Key 是否可用、是否能访问
            /v1/models。
          </div>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-gray-200">
            {result.items.map((it, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 uppercase text-gray-600">
                    {it.provider}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                    {it.modelType}
                  </span>
                  <code className="font-mono text-gray-700">{it.modelId}</code>
                </div>
                <span
                  className={`font-medium ${
                    it.action === 'created'
                      ? 'text-green-600'
                      : it.action === 'skipped'
                        ? 'text-gray-500'
                        : 'text-red-500'
                  }`}
                >
                  {it.action === 'created'
                    ? '✓ 新建'
                    : it.action === 'skipped'
                      ? '— 跳过'
                      : '✗ ' + (it.reason ?? '无匹配')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
