module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  // PR-X40: roots includes both src/ (unit specs near sources) and
  // ../tests/integration/ (cross-module integration specs that don't belong
  // to any single module). All other paths in this config (coverageDirectory,
  // moduleNameMapper, mock paths) stay relative to rootDir=src.
  roots: ["<rootDir>", "<rootDir>/../tests/integration"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    // P36 (2026-05-24): isolatedModules 从 ts-jest config 迁到 tsconfig.json
    // (ts-jest v29 起此选项 deprecated;新地址见 tsconfig.json compilerOptions.isolatedModules)
    "^.+\\.(t|j)s$": ["ts-jest", {}],
  },
  collectCoverageFrom: [
    "**/*.(t|j)s",
    "!**/*.module.ts",
    "!**/index.ts",
    "!**/main.ts",
    "!**/*.interface.ts",
    "!**/*.dto.ts",
    "!**/*.entity.ts",
    "!**/*.spec.ts",
    "!**/__tests__/**",
    "!**/__mocks__/**",
    "!**/deprecated/**",
    "!**/*.example.ts",
    "!**/*.prompt.ts",
    "!**/*-team.config.ts",
    "!**/builtin-templates.ts",
    "!**/agent-roles.ts",
    "!**/ai-prompts.config.ts",
    "!**/*.types.ts",
    "!**/slides/templates/base/components.ts",
    // facade/exports/*.ts 是纯 re-export 桶文件，无可执行代码 → 0% 函数覆盖率
    // 但实际不需要测试（只是 barrel import 收口）
    "!**/facade/exports/**",
  ],
  coverageDirectory: "../coverage",
  coveragePathIgnorePatterns: [
    "node_modules",
    "deprecated",
    "\\.example\\.ts$",
    "\\.d\\.ts$",
  ],
  testEnvironment: "node",

  // 覆盖率阈值 — 分模块差别化守门
  //
  // 全局 50%：保留为基线，覆盖其他模块（research/teams/library 等）渐进提升
  //
  // 三个核心模块（playground/harness/engine）单独守 85% lines/statements/functions
  // branches 75%（branches 自然低于 lines —— 防御性 nullish/optional chaining 难命中
  // 反例；强求 85% 会引入伪测试）
  //
  // 历史：2026-04-29 一次性单测攻坚把这三模块从 22.67% 全局 → 91-95% lines
  // (~130 spec / 13000+ tests / 17 commits)，故守门阈值升到 85%
  // 注：threshold 检查 per-directory aggregate 优先，剩余文件归 global
  // 当只跑部分 testPathPattern 时，global 阈值会被未运行的模块（0%）拉低，
  // 故 global 设 0（仅作占位）。CI 跑全套时由 per-directory 阈值守门。
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
    // 使用 directory 路径而非 glob —— jest 在该目录所有文件上做 aggregate 检查
    // （glob "**/*.ts" 是 per-file 检查，单个低 coverage 文件即破坏阈值，不实用）
    // 真实目录是 ai-app/playground/（旧 key 写成 agent-playground 是笔误，
    // 导致 playground 后端长期无阈值守门、悄悄落到 global=0）。
    //
    // ★ L3-W0 #4（2026-07-02）棘轮基线：此前 95/85 阈值只在本地 test:coverage
    // 触发、CI 不带 --coverage 完全空转（言行不一）。本次 CI 接通 --coverage，
    // 阈值按 2026-07-02 模块内实测值下调锁基线（防回退棘轮，CI 全量跑分只会
    // 高于模块内实测，故实测值即安全下界）。攻坚目标保留在注释：
    //   playground branches 81→95 / functions 92→95
    //   harness   functions 77→85
    //   engine    branches 74→75 / functions 80→85
    "./src/modules/ai-app/playground/": {
      branches: 81, // 实测 81.1（目标 95）
      functions: 92, // 实测 92.2（目标 95）
      lines: 95,
      statements: 95,
    },
    "./src/modules/ai-harness/": {
      branches: 75,
      functions: 77, // 实测 77.19（目标 85）
      lines: 85,
      statements: 85,
    },
    "./src/modules/ai-engine/": {
      branches: 74, // 实测 74.64（目标 75）
      functions: 80, // 实测 80.04（目标 85）
      lines: 85,
      statements: 85,
    },
    // platform（L1 基础设施）守门：当前实测约 lines ~80 / stmts ~78 / funcs ~73 /
    // branches ~68（resilience + handlebars-renderer 补测后）。阈值设在实测值下方
    // 锁基线 —— 只防回退（新增未测代码会被拦），不强求与 harness/engine 同档 85%
    // （credentials/storage 等大块业务服务尚在渐进补测）。
    "./src/modules/platform/": {
      branches: 65,
      functions: 70,
      lines: 78,
      statements: 76,
    },
  },

  // 覆盖率报告格式
  coverageReporters: ["text", "text-summary", "lcov", "html"],

  // 模块路径映射（支持@/路径别名）
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Mock ESM modules to avoid compatibility issues in tests
    "^p-limit$": "<rootDir>/__mocks__/p-limit.js",
    "^marked$": "<rootDir>/__mocks__/marked.js",
    "^exceljs$": "<rootDir>/__mocks__/exceljs.js",
    "^pptxgenjs$": "<rootDir>/__mocks__/pptxgenjs.js",
    "^jsdom$": "<rootDir>/__mocks__/jsdom.js",
    "pdfjs-dist/legacy/build/pdf.mjs":
      "<rootDir>/../tests/__mocks__/pdfjs-dist.ts",
  },
};
