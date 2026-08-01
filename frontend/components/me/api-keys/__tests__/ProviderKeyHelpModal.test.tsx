/// <reference types="@testing-library/jest-dom" />

/**
 * ProviderKeyHelpModal —— 「去哪申请 API Key」帮助弹层
 *
 * 核心契约是**链接回落链**：apiKeyUrl（申领页）→ docUrl（文档首页）→ 无链接
 * （本地部署类不需要 Key）。回落错了用户会被送到错误的地方，故逐级断言。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { ProviderKeyHelpModal } from '../ProviderKeyHelpModal';
import type { ProviderInfo } from '@/hooks/features/useUserApiKeys';

const p = (o: Partial<ProviderInfo> & { id: string }): ProviderInfo => ({
  name: o.id,
  endpoint: '',
  ...o,
});

describe('ProviderKeyHelpModal', () => {
  it('apiKeyUrl 存在时链接指向申领页', () => {
    render(
      <ProviderKeyHelpModal
        open
        onClose={() => {}}
        providers={[
          p({
            id: 'openai',
            name: 'OpenAI',
            apiKeyUrl: 'https://platform.openai.com/api-keys',
            docUrl: 'https://platform.openai.com/docs',
          }),
        ]}
      />
    );

    const link = screen.getByRole('link', { name: /申请 Key/ });
    expect(link).toHaveAttribute(
      'href',
      'https://platform.openai.com/api-keys'
    );
  });

  it('只有 docUrl 时回落到文档首页，且文案改为「查看文档」', () => {
    render(
      <ProviderKeyHelpModal
        open
        onClose={() => {}}
        providers={[
          p({
            id: 'agnes',
            name: 'Agnes AI',
            docUrl: 'https://example.com/docs',
          }),
        ]}
      />
    );

    const link = screen.getByRole('link', { name: /查看文档/ });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(screen.queryByText(/申请 Key/)).not.toBeInTheDocument();
  });

  it('两者皆无（本地部署类）不渲染链接，改为提示无需 Key', () => {
    render(
      <ProviderKeyHelpModal
        open
        onClose={() => {}}
        providers={[p({ id: 'ollama', name: 'Ollama (本地)' })]}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/无需 Key/)).toBeInTheDocument();
  });

  it('有链接的排在无链接的前面', () => {
    render(
      <ProviderKeyHelpModal
        open
        onClose={() => {}}
        providers={[
          p({ id: 'ollama', name: 'Ollama (本地)' }),
          p({
            id: 'openai',
            name: 'OpenAI',
            apiKeyUrl: 'https://platform.openai.com/api-keys',
          }),
        ]}
      />
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('OpenAI');
    expect(items[1]).toHaveTextContent('Ollama');
  });

  it('渲染免费额度说明', () => {
    render(
      <ProviderKeyHelpModal
        open
        onClose={() => {}}
        providers={[
          p({
            id: 'google',
            name: 'Google Gemini',
            apiKeyUrl: 'https://aistudio.google.com/apikey',
            freeTierNote: '免费层每分钟 1500 req',
          }),
        ]}
      />
    );

    expect(screen.getByText('免费层每分钟 1500 req')).toBeInTheDocument();
  });

  it('provider 列表为空时展示空态而非空白', () => {
    render(<ProviderKeyHelpModal open onClose={() => {}} providers={[]} />);

    expect(screen.getByText(/暂无可用服务商/)).toBeInTheDocument();
  });
});
