import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissionTodoBoard } from '../MissionTodoBoard';
import type { MissionTodo } from '@/lib/features/agent-playground/mission-todo.types';
import type {
  AgentLiveState,
  DimensionPipelineState,
} from '@/lib/features/agent-playground/mission-presentation.types';

// ──────── Mocks ────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/common/mission-detail', () => ({
  MissionTaskList: ({
    items,
    columns,
    onRowClick,
    selectedKey,
    getRowKey,
    getRowClassName,
  }: {
    items: MissionTodo[];
    columns: {
      key: string;
      label: string;
      render: (item: MissionTodo, idx: number) => React.ReactNode;
    }[];
    onRowClick?: (item: MissionTodo) => void;
    selectedKey?: string | null;
    getRowKey: (item: MissionTodo) => string;
    getRowClassName?: (item: MissionTodo) => string | undefined;
  }) => (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr
            key={getRowKey(item)}
            data-testid={`row-${item.id}`}
            className={getRowClassName?.(item) ?? ''}
            onClick={() => onRowClick?.(item)}
          >
            {columns.map((c) => (
              <td key={c.key}>{c.render(item, idx)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock('@/components/common/tables', () => ({
  TruncatedCell: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
}));

vi.mock('@/stores', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  confirm: vi.fn(),
}));

vi.mock('@/services/agent-playground/api', () => ({
  rerunTodo: vi.fn(),
  localRerunTodo: vi.fn(),
}));

vi.mock('@/components/agent-playground/ui', () => ({
  Card: ({
    children,
    className,
    bordered,
  }: {
    children: React.ReactNode;
    className?: string;
    bordered?: boolean;
  }) => (
    <div className={`card ${className ?? ''} ${bordered ? 'bordered' : ''}`}>
      {children}
    </div>
  ),
  StatusPill: ({ status }: { status: string }) => (
    <span data-testid={`status-pill-${status}`}>{status}</span>
  ),
  RoleChip: ({
    role,
    agentId,
    size,
  }: {
    role: string;
    agentId?: string;
    size?: string;
  }) => (
    <span data-testid={`role-chip-${role}`}>
      {role}
      {agentId ? ` [${agentId}]` : ''}
    </span>
  ),
}));

vi.mock('@/components/common/agent-inspector', () => ({
  AgentInspector: ({
    open,
    onClose,
    agent,
  }: {
    open: boolean;
    onClose: () => void;
    agent: { name: string };
  }) =>
    open ? (
      <div data-testid="agent-inspector">
        <span>{agent.name}</span>
        <button onClick={onClose}>close-inspector</button>
      </div>
    ) : null,
}));

vi.mock('@/lib/design/tokens', () => ({
  statusToken: {
    done: { label: '已完成' },
    running: { label: '进行中' },
    failed: { label: '失败' },
    cancelled: { label: '已取消' },
    pending: { label: '待启动' },
    blocked: { label: '已阻塞' },
  },
}));

vi.mock('@/lib/features/agent-playground/friendly-error.util', () => ({
  friendlyError: (msg: string) => `[friendly] ${msg}`,
}));

vi.mock('@/lib/features/agent-playground/stage-id-mapping', () => ({
  FRONTEND_STAGE_TO_STEP_ID: {
    's2-leader-plan': 's2-leader-plan',
    's3-researchers': 's3-researcher-collect',
    's4-leader-assess': 's4-leader-assess',
    's5-reconciler': 's5-reconciler',
    's6-analyst': 's6-analyst',
    's7-writer-outline': 's7-writer-outline',
    's8-writer-draft': 's8-writer',
    's9-critic-l4': 's9-critic',
    's9b-objective-eval': 's9b-objective-eval',
    's10-leader-signoff': 's10-leader-foreword-signoff',
    's11-persist': 's11-persist',
  },
}));

// ──────── Fixture factories ────────────────────────────────────────────────────

function makeTodo(overrides: Partial<MissionTodo> = {}): MissionTodo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    missionId: 'mission-1',
    title: 'Test Todo',
    status: 'pending',
    origin: 'leader-plan',
    scope: 'dimension',
    assignee: { role: 'researcher' },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  } as MissionTodo;
}

function makeAgent(overrides: Partial<AgentLiveState> = {}): AgentLiveState {
  return {
    agentId: 'researcher-1',
    role: 'researcher',
    phase: 'running',
    iterations: 2,
    modelId: 'gpt-4o',
    dimension: '市场分析',
    trace: [],
    ...overrides,
  } as AgentLiveState;
}

// ──────── Tests ───────────────────────────────────────────────────────────────

describe('MissionTodoBoard - empty state', () => {
  it('shows waiting message when todos empty and not failed', () => {
    render(<MissionTodoBoard todos={[]} />);
    expect(screen.getByText(/等 Leader 拆完维度/)).toBeInTheDocument();
  });

  it('shows failure card when todos empty and missionFailed=true', () => {
    render(<MissionTodoBoard todos={[]} missionFailed />);
    expect(screen.getByText(/Mission 失败/)).toBeInTheDocument();
    expect(screen.getByText(/没有产生任何子任务/)).toBeInTheDocument();
  });

  it('shows failed message with missionFailedMessage', () => {
    render(
      <MissionTodoBoard
        todos={[]}
        missionFailed
        missionFailedMessage="连接超时"
      />
    );
    expect(screen.getByText('连接超时')).toBeInTheDocument();
  });
});

describe('MissionTodoBoard - header', () => {
  it('shows task count in header', () => {
    const todos = [
      makeTodo({ status: 'done' }),
      makeTodo({ status: 'pending' }),
    ];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('· 共 2 项')).toBeInTheDocument();
  });

  it('shows done count in header', () => {
    const todos = [
      makeTodo({ status: 'done' }),
      makeTodo({ status: 'done' }),
      makeTodo({ status: 'pending' }),
    ];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('已完成 2')).toBeInTheDocument();
  });

  it('shows in_progress count in header', () => {
    const todos = [
      makeTodo({ status: 'in_progress' }),
      makeTodo({ status: 'pending' }),
    ];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('进行中 1')).toBeInTheDocument();
  });

  it('shows failed count in header', () => {
    const todos = [makeTodo({ status: 'failed' })];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('失败 1')).toBeInTheDocument();
  });

  it('shows 任务列表 title', () => {
    const todos = [makeTodo()];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('任务列表')).toBeInTheDocument();
  });
});

describe('MissionTodoBoard - filters chapter and reconciler-gap todos', () => {
  it('filters out chapter scope todos', () => {
    const todos = [
      makeTodo({ id: 'dim-1', scope: 'dimension', title: '研究市场行情' }),
      makeTodo({ id: 'chap-1', scope: 'chapter', title: '章节撰写任务' }),
    ];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('研究市场行情')).toBeInTheDocument();
    expect(screen.queryByText('章节撰写任务')).not.toBeInTheDocument();
  });

  it('filters out reconciler-gap origin todos', () => {
    const todos = [
      makeTodo({ id: 'dim-1', scope: 'dimension', title: '研究市场行情' }),
      makeTodo({
        id: 'gap-1',
        scope: 'review',
        origin: 'reconciler-gap',
        title: '跨维对账缺口项',
      }),
    ];
    render(<MissionTodoBoard todos={todos} />);
    expect(screen.getByText('研究市场行情')).toBeInTheDocument();
    expect(screen.queryByText('跨维对账缺口项')).not.toBeInTheDocument();
  });
});

describe('MissionTodoBoard - origin badges', () => {
  const cases: Array<[MissionTodo['origin'], string]> = [
    ['leader-plan', '维度任务'],
    ['leader-assess-retry', '评审重派'],
    ['leader-assess-replace', '换签 spec'],
    ['leader-assess-extend', '追加任务'],
    ['leader-assess-abort', '放弃维度'],
    ['leader-chat-create', '对话追加'],
    ['self-heal-retry', '自愈重试'],
    ['reviewer-revise', '复审重写'],
    ['critic-blindspot', '复审警示'],
    ['system-stage', '系统阶段'],
    ['chapter-pipeline', '章节撰写'],
  ];

  cases.forEach(([origin, expectedLabel]) => {
    it(`shows "${expectedLabel}" for origin="${origin}"`, () => {
      const todo = makeTodo({
        origin,
        scope: origin === 'critic-blindspot' ? 'review' : 'dimension',
      });
      render(<MissionTodoBoard todos={[todo]} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });

  it('shows system stage origin badges with stage id', () => {
    const todo = makeTodo({
      systemStageId: 's2-leader-plan',
      origin: 'system-stage',
      scope: 'system',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('维度规划')).toBeInTheDocument();
  });

  it('shows 并行研究 for s3-researchers', () => {
    const todo = makeTodo({
      systemStageId: 's3-researchers',
      origin: 'system-stage',
      scope: 'system',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('并行研究')).toBeInTheDocument();
  });

  it('shows 独立复审 for s9-critic-l4', () => {
    const todo = makeTodo({
      systemStageId: 's9-critic-l4',
      origin: 'system-stage',
      scope: 'system',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('独立复审')).toBeInTheDocument();
  });

  it('shows 落库归档 for s11-persist', () => {
    const todo = makeTodo({
      systemStageId: 's11-persist',
      origin: 'system-stage',
      scope: 'system',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('落库归档')).toBeInTheDocument();
  });
});

describe('MissionTodoBoard - status column', () => {
  it('renders StatusPill for non-dimension todo', () => {
    const todo = makeTodo({
      scope: 'system',
      status: 'pending',
      systemStageId: 's2-leader-plan',
      origin: 'system-stage',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByTestId('status-pill-pending')).toBeInTheDocument();
  });

  it('shows "已取消" for cancelled mission with in_progress dimension todo', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'in_progress' });
    render(<MissionTodoBoard todos={[todo]} missionCancelled />);
    expect(screen.getByText('已取消')).toBeInTheDocument();
  });

  it('shows deriveDimSubStatus for dimension todo', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'pending',
      pipelineKey: 'mkt-pipeline',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'mkt-pipeline',
        {
          dimension: '市场分析',
          chapters: [
            { index: 0, heading: '第一章', status: 'writing', attempts: 0 },
            { index: 1, heading: '第二章', status: 'pending', attempts: 0 },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    // When writing chapters exist, shows "初稿撰写 · N/M"
    expect(screen.getByText(/初稿撰写/)).toBeInTheDocument();
  });
});

describe('MissionTodoBoard - deriveDimSubStatus coverage', () => {
  it('shows "数据采集" when no pipeline and no completed researcher', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      assignee: { role: 'researcher', dimensionName: '未知维度' },
    });
    render(<MissionTodoBoard todos={[todo]} agents={[]} />);
    expect(screen.getByText('数据采集')).toBeInTheDocument();
  });

  it('shows "采集完成 · 待大纲" when researcher completed but no pipeline', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      assignee: { role: 'researcher', dimensionName: '市场分析' },
    });
    const agents = [
      makeAgent({
        role: 'researcher',
        dimension: '市场分析',
        phase: 'completed',
      }),
    ];
    render(<MissionTodoBoard todos={[todo]} agents={agents} />);
    expect(screen.getByText('采集完成 · 待大纲')).toBeInTheDocument();
  });

  it('shows "采集失败" when researcher failed and no pipeline', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      assignee: { role: 'researcher', dimensionName: '市场分析' },
    });
    const agents = [
      makeAgent({ role: 'researcher', dimension: '市场分析', phase: 'failed' }),
    ];
    render(<MissionTodoBoard todos={[todo]} agents={agents} />);
    expect(screen.getByText('采集失败')).toBeInTheDocument();
  });

  it('shows "采集完成" when status=done and no pipeline and not missionCompleted', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'done' });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('采集完成')).toBeInTheDocument();
  });

  it('shows "已完成" when status=done and no pipeline and missionCompleted=true', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'done' });
    render(<MissionTodoBoard todos={[todo]} missionTerminal />);
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('shows "撰写失败 N/M" when pipeline has failed chapters', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'market-dim',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'market-dim',
        {
          dimension: '市场',
          chapters: [
            { index: 0, heading: 'ch1', status: 'failed', attempts: 0 },
            { index: 1, heading: 'ch2', status: 'failed', attempts: 0 },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText(/撰写失败 2\/2/)).toBeInTheDocument();
  });

  // ★ 2026-08-03（用户实证截图）：failed-finalized 是「写出来了、也落地了，只是
  //   质量分没过线」——实测某章 682 字 / 复审 48 分 / 重写 1 次后兜底落地，内容就在
  //   报告里，却被标成红字「撰写失败」。两种状态必须分开报。
  it('failed-finalized 报「质量未达标」而不是「撰写失败」（内容已落地）', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'market-dim',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'market-dim',
        {
          dimension: '市场',
          chapters: [
            { index: 0, heading: 'ch1', status: 'done', attempts: 1 },
            {
              index: 1,
              heading: 'ch2',
              status: 'failed-finalized',
              attempts: 2,
            },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText(/质量未达标 1\/2/)).toBeInTheDocument();
    expect(screen.queryByText(/撰写失败/)).not.toBeInTheDocument();
  });

  it('shows "重写中 · N/M" when pipeline has revising chapters', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'revising', attempts: 0 },
            { index: 1, heading: 'ch2', status: 'passed', attempts: 0 },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText(/重写中/)).toBeInTheDocument();
  });

  it('shows "初稿复审" when pipeline has reviewing chapters', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'reviewing', attempts: 0 },
            { index: 1, heading: 'ch2', status: 'pending', attempts: 0 },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText(/初稿复审/)).toBeInTheDocument();
  });

  it('shows "等待评分" when all chapters passed but no grade', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'passed', attempts: 0 },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText('等待评分')).toBeInTheDocument();
  });

  it('shows "已完成 · N/100" when all chapters passed and graded', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'passed', attempts: 0 },
          ],
          grade: {
            overall: 88,
            grade: 'excellent',
            failed: false,
            axes: {},
            summary: '',
          },
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText('已完成 · 88/100')).toBeInTheDocument();
  });

  it('shows "兜底完成" when integrationDegraded', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'passed', attempts: 0 },
          ],
          grade: {
            overall: 70,
            grade: 'good',
            failed: false,
            axes: {},
            summary: '',
          },
          integrationDegraded: true,
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText(/兜底完成/)).toBeInTheDocument();
  });

  it('shows grade phase reason when grade failed with no-findings', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'passed', attempts: 0 },
          ],
          grade: {
            overall: 0,
            grade: 'poor',
            failed: true,
            phase: 'no-findings',
            axes: {},
            summary: '',
          },
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText('采集失败')).toBeInTheDocument();
  });

  it('shows "N/M 章节就绪" when some chapters pending', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'in_progress',
      pipelineKey: 'dim-1',
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-1',
        {
          dimension: '分析',
          chapters: [
            { index: 0, heading: 'ch1', status: 'passed', attempts: 0 },
            { index: 1, heading: 'ch2', status: 'pending', attempts: 0 },
          ],
        },
      ],
    ]);
    render(<MissionTodoBoard todos={[todo]} dimensionPipelines={pipelines} />);
    expect(screen.getByText('1/2 章节就绪')).toBeInTheDocument();
  });

  it('shows "Leader 重派采集中" when child has leader-assess-retry in_progress', () => {
    const parent = makeTodo({
      id: 'parent-1',
      scope: 'dimension',
      status: 'done',
    });
    const child = makeTodo({
      id: 'child-1',
      parentId: 'parent-1',
      origin: 'leader-assess-retry',
      status: 'in_progress',
      scope: 'dimension',
    });
    render(<MissionTodoBoard todos={[parent, child]} />);
    expect(screen.getByText('Leader 重派采集中')).toBeInTheDocument();
  });

  it('shows "自愈重试中" when child has self-heal-retry in_progress', () => {
    const parent = makeTodo({
      id: 'parent-2',
      scope: 'dimension',
      status: 'done',
    });
    const child = makeTodo({
      id: 'child-2',
      parentId: 'parent-2',
      origin: 'self-heal-retry',
      status: 'in_progress',
      scope: 'dimension',
    });
    render(<MissionTodoBoard todos={[parent, child]} />);
    expect(screen.getByText('自愈重试中')).toBeInTheDocument();
  });

  it('shows "撰写失败" for failed with chapter-pipeline-failed stage', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'failed',
      failedStage: 'chapter-pipeline-failed',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('撰写失败')).toBeInTheDocument();
  });

  it('shows "采集失败" for failed without chapter-pipeline-failed stage', () => {
    const todo = makeTodo({
      scope: 'dimension',
      status: 'failed',
      failedStage: 'research-failed',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('采集失败')).toBeInTheDocument();
  });

  it('shows "已放弃" for cancelled dimension', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'cancelled' });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('已放弃')).toBeInTheDocument();
  });
});

describe('MissionTodoBoard - task rows', () => {
  it('renders todo title', () => {
    const todo = makeTodo({ title: '分析市场趋势' });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('分析市场趋势')).toBeInTheDocument();
  });

  it('renders reasonText', () => {
    const todo = makeTodo({ reasonText: '需要补充数据' });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('需要补充数据')).toBeInTheDocument();
  });

  it('renders friendly error for self-heal-retry reasonText', () => {
    const todo = makeTodo({
      origin: 'self-heal-retry',
      reasonText: 'Connection timeout',
    });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(
      screen.getByText('[friendly] Connection timeout')
    ).toBeInTheDocument();
  });

  it('renders role chip for assignee', () => {
    const todo = makeTodo({ assignee: { role: 'researcher' } });
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByTestId('role-chip-researcher')).toBeInTheDocument();
  });

  it('renders model when agents provided', () => {
    const todo = makeTodo({
      id: 'todo-m',
      agentRefId: 'researcher-1',
      assignee: { role: 'researcher' },
    });
    const agents = [
      makeAgent({ agentId: 'researcher-1', modelId: 'gpt-4o-mini' }),
    ];
    render(<MissionTodoBoard todos={[todo]} agents={agents} />);
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
  });

  it('renders "—" when no model resolved', () => {
    const todo = makeTodo({ assignee: { role: 'analyst' } });
    render(<MissionTodoBoard todos={[todo]} agents={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders 详情 link', () => {
    const todo = makeTodo();
    render(<MissionTodoBoard todos={[todo]} />);
    expect(screen.getByText('详情')).toBeInTheDocument();
  });

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn();
    const todo = makeTodo({ id: 'sel-todo' });
    render(<MissionTodoBoard todos={[todo]} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('row-sel-todo'));
    expect(onSelect).toHaveBeenCalledWith('sel-todo');
  });

  it('calls onSelect with null when same row clicked again (deselect)', () => {
    const onSelect = vi.fn();
    const todo = makeTodo({ id: 'sel-todo2' });
    render(
      <MissionTodoBoard
        todos={[todo]}
        onSelect={onSelect}
        selectedKey="sel-todo2"
      />
    );
    fireEvent.click(screen.getByTestId('row-sel-todo2'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('MissionTodoBoard - tree ordering', () => {
  it('renders children under parent in DFS order', () => {
    const parent = makeTodo({ id: 'parent', createdAt: 1000 });
    const child1 = makeTodo({
      id: 'child1',
      parentId: 'parent',
      createdAt: 1001,
    });
    const child2 = makeTodo({
      id: 'child2',
      parentId: 'parent',
      createdAt: 1002,
    });
    render(<MissionTodoBoard todos={[parent, child1, child2]} />);
    const rows = screen.getAllByTestId(/^row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'row-parent');
    expect(rows[1]).toHaveAttribute('data-testid', 'row-child1');
    expect(rows[2]).toHaveAttribute('data-testid', 'row-child2');
  });
});

describe('MissionTodoBoard - AgentInspector', () => {
  it('opens AgentInspector when role chip clicked', () => {
    const todo = makeTodo({ assignee: { role: 'researcher' } });
    render(<MissionTodoBoard todos={[todo]} />);
    const chip = screen.getByTestId('role-chip-researcher');
    fireEvent.click(chip);
    expect(screen.getByTestId('agent-inspector')).toBeInTheDocument();
  });

  it('closes AgentInspector when close button clicked', () => {
    const todo = makeTodo({ assignee: { role: 'researcher' } });
    render(<MissionTodoBoard todos={[todo]} />);
    fireEvent.click(screen.getByTestId('role-chip-researcher'));
    expect(screen.getByTestId('agent-inspector')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-inspector'));
    expect(screen.queryByTestId('agent-inspector')).not.toBeInTheDocument();
  });

  it('shows correct agent profile name for leader role', () => {
    const todo = makeTodo({ assignee: { role: 'leader' } });
    render(<MissionTodoBoard todos={[todo]} agents={[]} />);
    fireEvent.click(screen.getByTestId('role-chip-leader'));
    expect(screen.getByText('Research Leader')).toBeInTheDocument();
  });

  it('shows dimension name in inspector for researcher', () => {
    const todo = makeTodo({
      assignee: { role: 'researcher', dimensionName: '市场分析' },
    });
    render(<MissionTodoBoard todos={[todo]} agents={[]} />);
    fireEvent.click(screen.getByTestId('role-chip-researcher'));
    expect(
      screen.getByText('Dimension Researcher · 市场分析')
    ).toBeInTheDocument();
  });
});

describe('MissionTodoBoard - rerun button', () => {
  it('shows rerun button when missionTerminal and todo is done', async () => {
    const { localRerunTodo } = await import('@/services/agent-playground/api');
    (localRerunTodo as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const todo = makeTodo({
      id: 'done-todo',
      status: 'done',
      scope: 'dimension',
      dimensionRef: 'market',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    expect(screen.getByText('重跑')).toBeInTheDocument();
  });

  it('does not show rerun button when not terminal', () => {
    const todo = makeTodo({
      id: 'done-todo',
      status: 'done',
      scope: 'dimension',
    });
    render(<MissionTodoBoard todos={[todo]} missionId="mission-1" />);
    expect(screen.queryByText('重跑')).not.toBeInTheDocument();
  });

  it('does not show rerun for pending todos', () => {
    const todo = makeTodo({
      id: 'pend-todo',
      status: 'pending',
      scope: 'dimension',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    expect(screen.queryByText('重跑')).not.toBeInTheDocument();
  });

  it('does not show rerun for s12-self-evolution', () => {
    const todo = makeTodo({
      id: 'evo-todo',
      status: 'done',
      scope: 'system',
      systemStageId: 's12-self-evolution',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    expect(screen.queryByText('重跑')).not.toBeInTheDocument();
  });

  it('does not show rerun for leader-assess-abort origin', () => {
    const todo = makeTodo({
      id: 'abort-todo',
      status: 'cancelled',
      scope: 'dimension',
      origin: 'leader-assess-abort',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    expect(screen.queryByText('重跑')).not.toBeInTheDocument();
  });

  it('calls localRerunTodo when rerun button clicked for dimension todo', async () => {
    const { localRerunTodo } = await import('@/services/agent-playground/api');
    (localRerunTodo as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const todo = makeTodo({
      id: 'rerun-dim',
      status: 'done',
      scope: 'dimension',
      dimensionRef: 'market',
      origin: 'leader-plan',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    fireEvent.click(screen.getByText('重跑'));
    await waitFor(() => {
      expect(localRerunTodo).toHaveBeenCalledWith(
        'mission-1',
        'rerun-dim',
        expect.objectContaining({ scope: 'dimension', dimensionRef: 'market' })
      );
    });
  });

  it('calls localRerunTodo when rerun button clicked for system stage', async () => {
    const { localRerunTodo } = await import('@/services/agent-playground/api');
    (localRerunTodo as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const todo = makeTodo({
      id: 'rerun-sys',
      status: 'done',
      scope: 'system',
      systemStageId: 's5-reconciler',
      origin: 'system-stage',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    fireEvent.click(screen.getByText('重跑'));
    await waitFor(() => {
      expect(localRerunTodo).toHaveBeenCalledWith(
        'mission-1',
        'rerun-sys',
        expect.objectContaining({ stepId: 's5-reconciler' })
      );
    });
  });

  it('shows confirm dialog for non-local-rerun todo', async () => {
    const { confirm } = await import('@/stores');
    (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const todo = makeTodo({
      id: 'non-local',
      status: 'done',
      scope: 'review',
      origin: 'critic-blindspot',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    fireEvent.click(screen.getByText('重跑'));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalled();
    });
  });

  it('shows error toast when rerun fails', async () => {
    const { localRerunTodo } = await import('@/services/agent-playground/api');
    (localRerunTodo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed')
    );
    const { toast } = await import('@/stores');

    const todo = makeTodo({
      id: 'err-rerun',
      status: 'done',
      scope: 'dimension',
      dimensionRef: 'dim1',
    });
    render(
      <MissionTodoBoard todos={[todo]} missionId="mission-1" missionTerminal />
    );
    fireEvent.click(screen.getByText('重跑'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('重跑失败', 'Failed');
    });
  });
});

describe('MissionTodoBoard - missionCompleted logic', () => {
  it('sets missionCompleted=false when missionQualityFailed', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'done' });
    render(
      <MissionTodoBoard todos={[todo]} missionTerminal missionQualityFailed />
    );
    // missionCompleted=false → shows "采集完成" not "已完成"
    expect(screen.getByText('采集完成')).toBeInTheDocument();
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
  });

  it('sets missionCompleted=false when missionFailed', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'done' });
    render(<MissionTodoBoard todos={[todo]} missionTerminal missionFailed />);
    expect(screen.getByText('采集完成')).toBeInTheDocument();
  });

  it('sets missionCompleted=false when missionCancelled', () => {
    const todo = makeTodo({ scope: 'dimension', status: 'done' });
    render(
      <MissionTodoBoard todos={[todo]} missionTerminal missionCancelled />
    );
    expect(screen.getByText('采集完成')).toBeInTheDocument();
  });
});
