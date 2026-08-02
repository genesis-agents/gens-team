'use client';

import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from '../primitives/button';
import { cn } from '@/lib/utils/common';
import { useTranslation } from '@/lib/i18n';

type ConfirmType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

const typeConfig: Record<
  ConfirmType,
  {
    Icon: typeof XCircle;
    iconColor: string;
    /** 图标底色：与全站卡片语言一致的浅色圆底，避免裸露的警报图标 */
    iconBg: string;
    confirmVariant: 'default' | 'destructive' | 'outline';
  }
> = {
  danger: {
    Icon: XCircle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    confirmVariant: 'destructive',
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    confirmVariant: 'default',
  },
  info: {
    Icon: Info,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    confirmVariant: 'default',
  },
  success: {
    Icon: CheckCircle,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    confirmVariant: 'default',
  },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  type = 'warning',
  confirmText,
  cancelText,
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const { Icon, iconColor, iconBg, confirmVariant } = typeConfig[type];

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      // 紧凑确认卡：窄一档(max-w-sm) + 去标题分隔线/去灰底页脚，收成一张干净白卡。
      //
      // ★ 2026-08-02 视觉修正：全站 78 处 confirm() 里约 58 处不传 description，
      //   旧写法此时把内容区整个 hidden，标题与按钮之间只剩 header/footer padding
      //   相加，形成一块无意义空白；加上左上角一枚裸露的纯红 XCircle 与右下角两颗
      //   size=sm 小按钮，重心散、警报感过强，与全站卡片语言不协调。
      //   现在：图标加浅色圆底（与 StatusBadge / AssetCard 同款语言）、标题与按钮
      //   间距收紧成有意的留白、按钮用默认尺寸与标题视觉重量匹配。
      className="max-w-sm"
      headerClassName="border-b-0 pb-0"
      footerClassName="border-t-0 bg-transparent pt-5"
      // 图标内联标题
      title={
        <span className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              iconBg
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', iconColor)} />
          </span>
          <span className="min-w-0 truncate">{title}</span>
        </span>
      }
      // 无描述时收起内容区（间距由 footer 的 pt-5 统一给出，不留空洞）
      contentClassName={description ? 'pb-0 pt-3' : 'hidden'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelText ?? t('common.cancel')}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading
              ? t('common.processing')
              : (confirmText ?? t('common.confirm'))}
          </Button>
        </>
      }
    >
      {description ? (
        <p className="pl-12 text-sm leading-relaxed text-gray-600">
          {description}
        </p>
      ) : null}
    </Modal>
  );
}

// Hook 简化使用
interface UseConfirmOptions {
  title: string;
  description?: string;
  type?: ConfirmType;
  confirmText?: string;
}

export function useConfirm(options: UseConfirmOptions) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  const confirm = useCallback((action: () => Promise<void>) => {
    setPendingAction(() => action);
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    setLoading(true);
    try {
      await pendingAction();
    } finally {
      setLoading(false);
      setOpen(false);
      setPendingAction(null);
    }
  }, [pendingAction]);

  const dialog = (
    <ConfirmDialog
      open={open}
      onClose={() => setOpen(false)}
      onConfirm={handleConfirm}
      loading={loading}
      {...options}
    />
  );

  return { confirm, dialog };
}
