'use client';

import { useMemo, useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  Eye,
  HelpCircle,
  Key,
  KeyRound,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { confirm } from '@/stores';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { TruncatedCell } from '@/components/common/tables';
import { StatusBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states';
import { ErrorState } from '@/components/ui/states';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { Input } from '@/components/ui/form/Input';
import {
  useUserSecrets,
  SECRET_CATEGORIES,
  type UserSecretItem,
  type SecretCategory,
  type CreateSecretBody,
  type UpdateSecretBody,
} from '@/hooks/features/useUserSecrets';
import {
  useUserApiKeys,
  type ProviderInfo,
} from '@/hooks/features/useUserApiKeys';
import { ProviderKeyHelpModal } from './ProviderKeyHelpModal';
import { UserApiKeyDrawer } from '@/components/me/api-keys/UserApiKeyDrawer';
import { SecretKeysDrawer } from '@/components/admin/secrets/SecretKeysDrawer';
import { SecretValueModal } from '@/components/admin/secrets/SecretValueModal';

// ─── Add Key Modal ─────────────────────────────────────────────────────────────

/**
 * 由 provider slug 推导一个在同用户下不冲突的标识符。
 *
 * name 的唯一约束是 (name, userId)（见 Secret model 注释），所以不能直接用
 * provider 当 name——同一服务商配第二把 Key 会撞。这里按 `<slug>-key-N` 递增。
 */
export function deriveKeyName(
  providerSlug: string,
  takenNames: string[]
): string {
  const base = (providerSlug || 'api').toLowerCase().trim() || 'api';
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  for (let i = 1; i < 500; i++) {
    const candidate = `${base}-key-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 理论上不可达（同一 provider 500 把 Key）；兜底避免返回已占用值
  return `${base}-key-${Date.now()}`;
}

interface AddKeyModalProps {
  onClose: () => void;
  onSubmit: (body: CreateSecretBody) => Promise<boolean>;
  /** ai_providers 单一真源：驱动服务商下拉 + 申领页直达链接 */
  providers: ProviderInfo[];
  /** 已存在的密钥标识符，用于自动生成时避开冲突 */
  takenNames: string[];
}

/**
 * 添加密钥 —— 极简表单（2026-08-01 重做）。
 *
 * 改之前要填 6 个字段（标识符 / 显示名 / 类别 / Provider / 密钥值 / 描述），
 * 但真正只有两条信息是用户独有的：**哪个服务商** 和 **密钥值**。其余全可推导：
 *   - 标识符：<provider>-key-N，按已有 Key 递增避开 (name, userId) 唯一冲突
 *   - 显示名：服务商显示名
 *   - 类别：本页 AI_MODEL 是压倒性主路径
 *
 * 另一处更实质的修复：Provider 原本是**自由文本**。后端 canonicalizeProvider
 * 只归一少数别名（claude→anthropic 等），打成 open-ai / azure 之类会顺利存下，
 * 之后解析 endpoint 时查不到 ai_providers，表现为「配了却不生效」。而我们本来
 * 就有 37 个服务商的权威清单（ai_providers，/user/api-keys 已返回）——让用户手打
 * 一个已知枚举是设计错误。现改为下拉，打错的可能性归零。
 */
function AddKeyModal({
  onClose,
  onSubmit,
  providers,
  takenNames,
}: AddKeyModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [provider, setProvider] = useState('');
  const [value, setValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // 高级项：留空则用推导值；用户改过就以用户输入为准
  const [nameOverride, setNameOverride] = useState('');
  const [displayNameOverride, setDisplayNameOverride] = useState('');
  const [category, setCategory] = useState<SecretCategory>('AI_MODEL');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  // AI_MODEL 类密钥后端强制要求 provider（路由到对应 LLM provider），其余类别可选
  const providerMissing = category === 'AI_MODEL' && !provider.trim();

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === provider),
    [provider, providers]
  );

  // 申领页优先，回落文档首页；本地部署类（两者皆无）不显示链接
  const matchedProviderHref =
    selectedProvider?.apiKeyUrl || selectedProvider?.docUrl || null;

  const derivedName = useMemo(
    () => (provider ? deriveKeyName(provider, takenNames) : ''),
    [provider, takenNames]
  );
  const derivedDisplayName = selectedProvider?.name || provider;

  const effectiveName = nameOverride.trim() || derivedName;
  const effectiveDisplayName =
    displayNameOverride.trim() || derivedDisplayName || undefined;

  const handleSubmit = async () => {
    if (!effectiveName || !value.trim() || providerMissing) return;
    setSubmitting(true);
    const ok = await onSubmit({
      name: effectiveName,
      displayName: effectiveDisplayName,
      category,
      provider: provider.trim() || undefined,
      value: value.trim(),
      description: description.trim() || undefined,
      isActive,
    });
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      closeOnOverlayClick={false}
      title={t('me.apiKeys.addTitle')}
      size="md"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.apiKeys.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={
              submitting || !effectiveName || !value.trim() || providerMissing
            }
          >
            {submitting ? t('me.apiKeys.saving') : t('me.apiKeys.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ① 服务商 —— 下拉而非自由文本：ai_providers 是权威清单，手打会静默配错 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldProviderRequired')} *
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t('me.apiKeys.selectProvider')}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.freeTierNote ? ` · ${p.freeTierNote}` : ''}
              </option>
            ))}
          </select>
          {/* 选中即给申领页入口，省掉「先去哪申请」这一步 */}
          {matchedProviderHref && (
            <a
              href={matchedProviderHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t('me.apiKeys.help.getKeyFor', {
                provider: derivedDisplayName,
              })}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* ② 密钥值 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldValue')} *
          </label>
          <Input
            type="text"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('me.apiKeys.fieldValuePlaceholder')}
          />
        </div>

        {/* 其余字段全部可推导 / 有合理默认，收进高级区 */}
        <div className="border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${
                showAdvanced ? 'rotate-90' : ''
              }`}
            />
            {t('me.apiKeys.advanced')}
          </button>

          {!showAdvanced && provider && (
            <p className="mt-1.5 text-xs text-gray-400">
              {t('me.apiKeys.derivedSummary', {
                name: effectiveName,
                displayName: effectiveDisplayName ?? '',
              })}
            </p>
          )}

          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t('me.apiKeys.fieldName')}
                </label>
                <Input
                  value={nameOverride}
                  onChange={(e) => setNameOverride(e.target.value)}
                  placeholder={derivedName || 'e.g. openai-key-1'}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t('me.apiKeys.fieldDisplayName')}
                </label>
                <Input
                  value={displayNameOverride}
                  onChange={(e) => setDisplayNameOverride(e.target.value)}
                  placeholder={derivedDisplayName || 'e.g. OpenAI'}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t('me.apiKeys.fieldCategory')} *
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as SecretCategory)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SECRET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t('me.apiKeys.fieldDescription')}
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder=""
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="add-isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="add-isActive" className="text-sm text-gray-700">
                  {t('me.apiKeys.fieldIsActive')}
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Edit Key Modal ─────────────────────────────────────────────────────────────

interface EditKeyModalProps {
  item: UserSecretItem;
  onClose: () => void;
  onSubmit: (
    source: 'llm' | 'secret',
    id: string,
    body: UpdateSecretBody
  ) => Promise<boolean>;
}

function EditKeyModal({ item, onClose, onSubmit }: EditKeyModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState('');
  const [displayName, setDisplayName] = useState(item.displayName);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(item.isActive);

  const handleSubmit = async () => {
    setSubmitting(true);
    const body: UpdateSecretBody = {
      displayName: displayName.trim() || undefined,
      description: description.trim() || undefined,
      isActive,
    };
    if (value.trim()) body.value = value.trim();
    const ok = await onSubmit(item.source, item.id, body);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      closeOnOverlayClick={false}
      title={t('me.apiKeys.editTitle')}
      size="md"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.apiKeys.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('me.apiKeys.saving') : t('me.apiKeys.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldDisplayName')}
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldValue')}
          </label>
          <Input
            type="text"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('me.apiKeys.fieldValueEditPlaceholder')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldDescription')}
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edit-isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="edit-isActive" className="text-sm text-gray-700">
            {t('me.apiKeys.fieldIsActive')}
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ─── Request System Key Modal ───────────────────────────────────────────────────

interface RequestKeyModalProps {
  onClose: () => void;
  onSubmit: (
    category: SecretCategory,
    targetId: string,
    reason?: string
  ) => Promise<boolean>;
}

function RequestKeyModal({ onClose, onSubmit }: RequestKeyModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<SecretCategory>('AI_MODEL');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!targetId.trim()) return;
    setSubmitting(true);
    const ok = await onSubmit(
      category,
      targetId.trim(),
      reason.trim() || undefined
    );
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      closeOnOverlayClick={false}
      title={t('me.apiKeys.requestTitle')}
      size="md"
      closeButtonDisabled={submitting}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t('me.apiKeys.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !targetId.trim()}
          >
            {submitting ? t('me.apiKeys.submitting') : t('me.apiKeys.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.requestCategory')} *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SecretCategory)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SECRET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Target ID *
          </label>
          <Input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="e.g. openai-gpt4"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('me.apiKeys.fieldReason')}
          </label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Tab Component ─────────────────────────────────────────────────────────

export function UserApiKeysTab() {
  const { t } = useTranslation();
  const {
    secrets,
    loading,
    error,
    refresh,
    createSecret,
    updateSecret,
    deleteSecret,
    requestSystemKey,
    testSecret,
    testingId,
    getSecretValue,
  } = useUserSecrets();

  // ★ 2026-05-29 P4：AI_MODEL 行的同名多 Key 管理（admin 同款 UserApiKeyDrawer + MultiKeyTable）
  const apiKeys = useUserApiKeys();
  // ai_providers 单一真源，供「去哪申请 Key」帮助与表单内直达链接共用
  const providers = apiKeys.providers;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [editingItem, setEditingItem] = useState<UserSecretItem | null>(null);
  // ★ 揭示密钥明文（与 admin SecretsManager 同款 SecretValueModal）
  const [viewingItem, setViewingItem] = useState<UserSecretItem | null>(null);
  const [manageProvider, setManageProvider] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // ★ 2026-05-29 P4：非 AI_MODEL（工具/其它）行的多 Key 管理（user-scoped secrets，admin 同款抽屉）
  const [manageSecret, setManageSecret] = useState<{
    id: string;
    name: string;
    displayName: string;
    provider?: string | null;
  } | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return secrets.filter((s) => {
      if (categoryFilter !== 'ALL' && s.category !== categoryFilter)
        return false;
      if (
        term &&
        !s.name.toLowerCase().includes(term) &&
        !s.displayName.toLowerCase().includes(term)
      )
        return false;
      return true;
    });
  }, [secrets, search, categoryFilter]);

  const handleDelete = async (item: UserSecretItem) => {
    const confirmed = await confirm({
      title: t('me.apiKeys.deleteConfirmTitle'),
      description: t('me.apiKeys.deleteConfirmDesc'),
      type: 'danger',
    });
    if (!confirmed) return;
    await deleteSecret(item.source, item.id);
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => void refresh()} />;
  }

  const isEmpty = filtered.length === 0;
  const isSearchActive = search.trim() !== '' || categoryFilter !== 'ALL';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          {t('me.apiKeys.title')}
        </h2>
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('me.apiKeys.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="ALL">{t('me.apiKeys.filterAll')}</option>
          {SECRET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-gray-300 p-2 transition-colors hover:bg-gray-100"
          title={t('me.apiKeys.refresh')}
        >
          <RefreshCw className="h-4 w-4 text-gray-500" />
        </button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowRequestModal(true)}
        >
          <Key className="mr-1.5 h-4 w-4" />
          {t('me.apiKeys.requestSystemKey')}
        </Button>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('me.apiKeys.addKey')}
        </Button>
        {/* 「去哪申请 Key」帮助——此前整个页面没有任何获取指引 */}
        <button
          type="button"
          onClick={() => setShowKeyHelp(true)}
          className="rounded-lg border border-gray-300 p-2 transition-colors hover:bg-gray-100"
          title={t('me.apiKeys.help.title')}
          aria-label={t('me.apiKeys.help.title')}
        >
          <HelpCircle className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Table className="w-full">
          <THead className="bg-gray-50">
            <Tr>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colName')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colCategory')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colValue')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colStatus')}
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colUsage')}
              </Th>
              <Th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('me.apiKeys.colActions')}
              </Th>
            </Tr>
          </THead>
          <TBody className="divide-y divide-gray-200">
            {isEmpty ? (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState
                    size="sm"
                    title={
                      isSearchActive
                        ? t('me.apiKeys.emptySearchTitle')
                        : t('me.apiKeys.emptyTitle')
                    }
                    description={
                      isSearchActive ? undefined : t('me.apiKeys.emptyDesc')
                    }
                  />
                </Td>
              </Tr>
            ) : (
              filtered.map((item) => (
                <SecretRow
                  key={`${item.source}-${item.id}`}
                  item={item}
                  onEdit={() => setEditingItem(item)}
                  onViewValue={() => setViewingItem(item)}
                  onManageKeys={
                    // 按存储来源路由（比 category 更稳健）：
                    //   llm  → user_api_keys（UserApiKeyDrawer，provider 维度）
                    //   secret → user-scoped secrets（SecretKeysDrawer，secret id 维度）
                    item.source === 'llm' && item.provider
                      ? () =>
                          setManageProvider({
                            id: item.provider as string,
                            name: item.displayName || item.name,
                          })
                      : item.source === 'secret'
                        ? () =>
                            setManageSecret({
                              id: item.id,
                              name: item.name,
                              displayName: item.displayName || item.name,
                              provider: item.provider,
                            })
                        : undefined
                  }
                  onDelete={() => void handleDelete(item)}
                  onTest={() => void testSecret(item.source, item.id)}
                  isTesting={testingId === item.id}
                />
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddKeyModal
          onClose={() => setShowAddModal(false)}
          onSubmit={createSecret}
          providers={providers}
          takenNames={secrets.map((s) => s.name)}
        />
      )}
      {showKeyHelp && (
        <ProviderKeyHelpModal
          open
          onClose={() => setShowKeyHelp(false)}
          providers={providers}
        />
      )}
      {editingItem && (
        <EditKeyModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={updateSecret}
        />
      )}
      {showRequestModal && (
        <RequestKeyModal
          onClose={() => setShowRequestModal(false)}
          onSubmit={requestSystemKey}
        />
      )}

      {/* 揭示密钥明文（复用 admin SecretValueModal：揭示 + 复制 + 30s 自动隐藏 + 自动清剪贴板） */}
      {viewingItem && (
        <SecretValueModal
          secretName={viewingItem.name}
          displayName={viewingItem.displayName || viewingItem.name}
          onClose={() => setViewingItem(null)}
          getSecretValue={() =>
            getSecretValue(viewingItem.source, viewingItem.id)
          }
        />
      )}

      {/* ★ 2026-05-29 P4：AI_MODEL 同名多 Key 管理抽屉（与 admin /admin/access/secrets 同款 MultiKeyTable） */}
      {manageProvider && (
        <UserApiKeyDrawer
          open={true}
          onClose={() => {
            setManageProvider(null);
            void refresh();
          }}
          provider={manageProvider}
          keys={apiKeys.getKeysForProvider(manageProvider.id)}
          loading={apiKeys.loading}
          saving={apiKeys.saving}
          testing={apiKeys.testing}
          onSave={apiKeys.saveKey}
          onDelete={apiKeys.deleteKey}
          onTest={async (keyId) => {
            await apiKeys.testKeyById(manageProvider.id, keyId);
          }}
        />
      )}

      {/* ★ 2026-05-29 P4：工具/其它类同名多 Key 管理（user-scoped secrets，与 admin 同款抽屉） */}
      {manageSecret && (
        <SecretKeysDrawer
          secret={manageSecret}
          baseUrl="/user/secrets"
          onClose={() => {
            setManageSecret(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

export default UserApiKeysTab;

// ─── Row ───────────────────────────────────────────────────────────────────────

function SecretRow({
  item,
  onEdit,
  onViewValue,
  onManageKeys,
  onDelete,
  onTest,
  isTesting,
}: {
  item: UserSecretItem;
  onEdit: () => void;
  onViewValue: () => void;
  onManageKeys?: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTesting: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Tr className="hover:bg-gray-50">
      {/* Name */}
      <Td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <div className="min-w-0">
            <TruncatedCell className="max-w-[200px] font-medium text-gray-900">
              {item.displayName || item.name}
            </TruncatedCell>
            {item.displayName && (
              <TruncatedCell className="max-w-[200px] text-xs text-gray-400">
                {item.name}
              </TruncatedCell>
            )}
          </div>
        </div>
      </Td>
      {/* Category + provider */}
      <Td className="px-4 py-2.5">
        <StatusBadge tone="info" label={item.category} />
        {item.provider && (
          <p className="mt-0.5 text-xs text-gray-400">{item.provider}</p>
        )}
      </Td>
      {/* Masked value（与 admin SecretsManager 同款：灰底胶囊 + 👁 揭示按钮） */}
      <Td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <code className="font-mono rounded bg-gray-100 px-2 py-1 text-sm text-gray-600">
            {item.maskedValue || '—'}
          </code>
          <button
            onClick={onViewValue}
            className="rounded p-1 hover:bg-gray-100"
            title={t('me.apiKeys.viewValue')}
          >
            <Eye className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </Td>
      {/* Status */}
      <Td className="px-4 py-2.5">
        <StatusBadge
          tone={item.isActive ? 'success' : 'neutral'}
          label={
            item.isActive
              ? t('me.apiKeys.statusActive')
              : t('me.apiKeys.statusInactive')
          }
          dot
        />
      </Td>
      {/* Usage */}
      <Td className="px-4 py-2.5 text-sm text-gray-500">{item.usageCount}</Td>
      {/* Actions */}
      <Td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onTest}
            disabled={isTesting}
            className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-50"
            title={isTesting ? t('me.apiKeys.testing') : t('me.apiKeys.test')}
          >
            <PlugZap className="h-4 w-4 text-gray-500" />
          </button>
          {onManageKeys && (
            <button
              onClick={onManageKeys}
              className="rounded p-1.5 hover:bg-gray-100"
              title={t('me.apiKeys.manageKeys')}
            >
              <KeyRound className="h-4 w-4 text-gray-500" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="rounded p-1.5 hover:bg-gray-100"
            title={t('me.apiKeys.editTitle')}
          >
            <Pencil className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 hover:bg-red-100"
            title={t('me.apiKeys.deleteConfirmTitle')}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </Td>
    </Tr>
  );
}
