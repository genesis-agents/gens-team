/**
 * 雷达主题状态 badge 的文案 / 样式映射。
 *
 * 2026-07-30 从 RadarTopicCard.tsx 的模块私有常量提出：详情页页头也要显示同一
 * 组状态，两处各存一份必然漂移（改「已暂停」措辞时漏改一处，两个页面对同一
 * 主题给出不同说法）。这里是唯一事实源。
 */
import type { RadarTopic } from '@/services/ai-radar/types';

export const TOPIC_STATUS_BADGE: Record<
  RadarTopic['status'],
  { label: string; className: string }
> = {
  ACTIVE: {
    label: '运行中',
    className: 'bg-cyan-50 text-cyan-700',
  },
  PAUSED: {
    label: '已暂停',
    className: 'bg-gray-100 text-gray-600',
  },
  ARCHIVED: {
    label: '已归档',
    className: 'bg-gray-100 text-gray-500',
  },
};
