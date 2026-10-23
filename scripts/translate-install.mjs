#!/usr/bin/env node
/**
 * Rewrite hardcoded UI text inside a local Cursor install.
 *
 * The language pack covers strings Cursor registered with VS Code. Settings,
 * the Agent window and the account page also ship English literals in the
 * workbench bundles. This replaces those literals when they are the value of
 * a UI field, then installs the pack and sets the display language.
 *
 *   npm run translate
 *   npm run translate -- --locale=zh-tw
 *   npm run translate -- --preview
 *   npm run translate -- --undo
 *   npm run translate -- --dir="D:\cursor"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Module from 'node:module';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { p, readJson, writeJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';
import { findCursorInstalls, readCursorInfo, extensionsDir, argvJsonPath, cursorAppRoot } from './lib/cursor-paths.mjs';
import { readHistoryCatalog, historyBootstrap, translateHistoryStatus } from './lib/history-localization.mjs';
import { restoreTrackedFiles, finalizeInstallation, activeExtensionNames, findVersionedVsix } from './lib/install-state.mjs';
import { offlineMainBootstrap } from './lib/offline-host.mjs';
import { applyFileTransaction, recoverFileTransaction, writeFileAtomic } from './lib/file-transaction.mjs';

const BUNDLES = [
  'out/main.js',
  'out/vs/workbench/workbench.desktop.main.js',
  'out/vs/workbench/workbench.glass.main.js',
  'out/vs/workbench/workbench.anysphere-ui-automations.js',
  'molten/dist/electron-main/host.cjs'
];

// Hosted Glass and standalone Agents can obtain menu data through different
// paths. Apply the same reviewed wording to actual menu controls as well.
const MENU_LABELS = [
  'File', 'New Agent', 'Open Folder', 'New Terminal', 'New Browser', 'Open IDE', 'Exit',
  'Edit', 'Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All',
  'View', 'Changes', 'Browser', 'Files', 'Terminal', 'Next Tab', 'Previous Tab',
  'Zoom In', 'Zoom Out', 'Reset Zoom', 'Settings', 'Help', 'Command Palette',
  'Keyboard Shortcuts', 'About', 'View License', 'Export Diagnostics…',
  'Minimap', 'Status Bar', 'About Cursor', 'Check for Updates…'
];

/** Renderer chunks use content hashes; discover the active files on each run. */
function bundlePaths(appRoot) {
  const result = [...BUNDLES];
  const assetDir = path.join(appRoot, 'molten', 'dist', 'renderer', 'assets');
  const activeChunks = [
    /^task-models-settings-[\w-]+\.js$/,
    /^account-store-[\w-]+\.js$/,
    /^boot-[\w-]+\.js$/,
    /^chrome-[\w-]+\.js$/,
    /^react-[\w-]+\.js$/,
    /^new-agent-[\w-]+\.js$/,
    /^shortcuts-[\w-]+\.js$/,
    /^ssh-connect-dialog-[\w-]+\.js$/,
    /^tile-pane-[\w-]+\.js$/,
    /^view-[\w-]+\.js$/,
    /^add-plugin-ui-[\w-]+\.js$/
  ];
  if (fs.existsSync(assetDir)) {
    for (const name of fs.readdirSync(assetDir)) {
      if (activeChunks.some((pattern) => pattern.test(name))) {
        result.push(`molten/dist/renderer/assets/${name}`);
      }
    }
  }
  return [...new Set(result)];
}

/** Only these fields are shown to the user. Anything else is left alone. */
const UI_FIELDS = [
  'label', 'description', 'placeholder', 'accessibleLabel', 'ariaLabel', 'tooltip',
  'subtitle', 'buttonLabel', 'emptyLabel', 'emptyText', 'heading',
  'confirmText', 'primaryLabel', 'regretLabel', 'loadingLabel', 'title', 'children', 'text', 'loading', 'completed', 'error', 'defaultPlaceholder'
];

const FIELD_RE = new RegExp(
  `\\b(${UI_FIELDS.join('|')})\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
  'g'
);
const TEMPLATE_FIELD_RE = new RegExp(
  '\\b(' + [...UI_FIELDS, 'aria-label', 'content'].join('|') + ')\\s*:\\s*`([^`\\r\\n]*)`',
  'g'
);

// Canonical keys keep translated wording independent of minified variable names.
// Captures are copied as JavaScript expressions, never escaped as UI text.
const UI_TEMPLATE_RULES = [
  [/^Partial Accepts keybinding: (\$\{.+\})$/, 'Partial Accepts keybinding: {0}'],
  [/^Keybinding: (\$\{.+\})$/, 'Keybinding: {0}'],
  [/^Remove (\$\{.+\})$/, 'Remove {0}'],
  [/^Remove image (\$\{.+\})$/, 'Remove image {0}'],
  [/^(\$\{.+\}) submits chat, Enter inserts a newline, and primary actions move to (\$\{.+\})$/, '{0} submits chat, Enter inserts a newline, and primary actions move to {1}'],
  [/^Submit with (\$\{.+\})Enter$/, 'Submit with {0}Enter'],
  [/^Automatically parse links when pasted into Quick Edit \((\$\{.+\})K\) input$/, 'Automatically parse links when pasted into Quick Edit ({0}K) input'],
  [/^Show a hint for (\$\{.+\})K in the Terminal$/, 'Show a hint for {0}K in the Terminal'],
  [/^Preview Box for Terminal (\$\{.+\})K$/, 'Preview Box for Terminal {0}K'],
  [/^Automatically jump to the next diff when accepting changes with (\$\{.+\})Y$/, 'Automatically jump to the next diff when accepting changes with {0}Y'],
  [/^(\$\{.+\}), select project$/, '{0}, select project'],
  [/^(\$\{.+\}), select environment$/, '{0}, select environment']
];

// The Windows Agents menu lives in chrome-*.js, separately from the editor
// menu. The sidebar updater also builds its label outside a UI field.
const UPDATE_BUTTON_STATE_RE = /(\b(?:let|const|var)\s+[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$][\w$]*\?)`Updating`(:[A-Za-z_$][\w$]*\?)`Installing`(:)`Update`(?=[,;])/g;
const UPDATE_TOOLTIP_RE = /`((?:Installing update (?:—|\\u2014) |Update to |Preparing the update (?:—|\\u2014) |Downloading the update \(|Updating: |Update: restart )[^`\r\n]*)`/g;
const UPDATE_TOOLTIP_RULES = [
  [/^Installing update (?:—|\\u2014) (\$\{.+\}) will close and reopen automatically$/, 'Installing update — {0} will close and reopen automatically'],
  [/^Update to (\$\{.+\}) is ready (?:—|\\u2014) click to restart$/, 'Update to {0} is ready — click to restart'],
  [/^Preparing the update (?:—|\\u2014) (\$\{.+\}) restarts as soon as it's ready$/, "Preparing the update — {0} restarts as soon as it's ready"],
  [/^Downloading the update \((\$\{.+\})%\) (?:—|\\u2014) (\$\{.+\}) restarts as soon as it's ready$/, "Downloading the update ({0}%) — {1} restarts as soon as it's ready"],
  [/^Updating: (\$\{.+\}) restarts when the update is ready$/, 'Updating: {0} restarts when the update is ready'],
  [/^Update: restart (\$\{.+\}) to install$/, 'Update: restart {0} to install']
];

function translateUiTemplate(raw, dict, hits, rules = UI_TEMPLATE_RULES) {
  for (const [pattern, key] of rules) {
    const match = pattern.exec(raw);
    if (!match || !Object.hasOwn(dict, key)) continue;
    const translated = dict[key].split(/(\{\d+\})/g).map((part) => {
      const token = /^\{(\d+)\}$/.exec(part);
      if (token) return match[Number(token[1]) + 1];
      return part.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    }).join('');
    hits.set(key, (hits.get(key) || 0) + 1);
    return translated;
  }
  return translateLiteral(raw, dict, hits);
}

const { flags } = parseArgs();
const config = loadConfig();

function unescapeJs(raw) {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, token) => {
    if (token.startsWith('u')) return String.fromCharCode(Number.parseInt(token.slice(1), 16));
    return { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[token] ?? token;
  });
}

function escapeJs(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function translateLiteral(raw, dict, hits) {
  const english = unescapeJs(raw);
  if (!Object.prototype.hasOwnProperty.call(dict, english)) return null;
  const translated = dict[english];
  if (typeof translated !== 'string' || translated === english) return null;
  hits.set(english, (hits.get(english) || 0) + 1);
  return escapeJs(translated);
}

/**
 * Cursor Settings sidebar titles, keyed by the internal id.
 * Only this exact English value is replaced. The same id is reused for icons,
 * colors and abbreviation tables (`mcp:"MCP"`), and those must stay as they are.
 */
const SIDEBAR_ENGLISH = {
  general: 'General',
  profile: 'Profile',
  'vscode-settings': 'VS Code Settings',
  appearance: 'Appearance',
  fun: 'Fun',
  'plan-usage': 'Plan & Usage',
  chat: 'Agents',
  browser: 'Browser & Network',
  tab: 'Tab',
  models: 'Models',
  'git-prs': 'Git & PRs',
  rules: 'Rules, Skills, Subagents',
  plugins: 'Plugins',
  customize: 'Customize',
  indexing: 'Indexing',
  mcp: 'Tools & MCPs',
  hooks: 'Hooks',
  beta: 'Beta',
  network: 'Network',
  'background-composer': 'Cloud Agents',
  'grok-bot': 'Grok Bot',
  'self-driving': 'Self-Driving PRs',
  worktrees: 'Worktrees',
  developer: 'Developer'
};
const SIDEBAR_ALIASES = {
  voice: ['Voice'],
  'git-prs': ['Source Control']
};

/** Composer mode names, one object, same text in the desktop and glass bundles. */
const MODE_FROM = 'agent:"Agent",chat:"Chat",background:"Cloud",plan:"Plan",spec:"Spec",debug:"Debug",triage:"Triage"';
const MODE_PARTS = [
  ['agent', 'Agent'],
  ['chat', 'Chat'],
  ['background', 'Cloud'],
  ['plan', 'Plan'],
  ['spec', 'Spec'],
  ['debug', 'Debug'],
  ['triage', 'Triage']
];

/** Quoted literals that are shown as-is, not as a `label:` / `title:` field. */
const BARE_LABELS = [
  'Send follow-up',
  'Send follow-up with subagent',
  'Open App',
  'Preview App',
  'Agents Window',
  'Remove image',
  'Installing update',
  'Update is ready — click to restart',
  'Browse Marketplace',
  'Cloud Agents require a Git repository in an open folder.',
  'Please open a folder to use background agents.',
  'Open Folder',
  'Copy Domains',
  'Run Diagnostic',
  'Pull Requests',
  'Review Provider',
  'No Cursor-managed worktrees on this machine.',
  'Files to exclude from indexing in addition to .gitignore.',
  'View included files.',
  'Agent Voice',
  'Play voice sample',
  'Stop voice sample',
  'Auto-detect',
  'Run Mode',
  'Run Mode Disabled by Team Admin',
  'Run Mode Controlled by Team Admin',
  'Run Mode Controlled by Team Admin (Sandbox Enabled)',
  'Rules, Skills, Subagents',
  'Code Intelligence',
  'Indexing',
  'Privacy Mode',
  'Privacy Mode (Legacy)',
  'Switch to Agents Window',
  'Try it now',
  'Run many agents in parallel \u2014 across repos, locally, on remote SSH, and in the cloud.',
  'System Tray Icon',
  'Show Cursor in system tray',
  'Menu Bar Icon',
  'Show Cursor in menu bar',
  'Repositories',
  'No Repo',
  'Task Models',
  'Cursor Settings',
  'Upgrade to Premium',
  'Upgrade your plan',
  'Plugins, MCPs, Skills, and Rules have moved to Customize',
  'Open Customize',
  'Reset "Don’t Ask Again" Dialogs',
  'You can also manage Privacy Mode in the',
  'Unify dashboard',
  'New Chat',
  'Chat actions',
  'Panel actions',
  'Show Apps',
  'Hide Apps',
  'Import',
  'Open project',
  'Clone repo',
  'Connect via SSH',
  'Connect via WSL',
  'Connection Failed',
  'Connecting',
  'Select Folder',
  'Sign in',
  'New Window',
  'Steer from iOS',
  'Select a project',
  'Select Environment',
  'Dismiss recommendation',
  'Hide tips',
  'Use /cloud or /local to move agent sessions between runtimes',
  'Free Plan',
  'Upgrade',
  'No commit scored',
  '$(git-commit) No commit scored',
  'Start voice input',
  'Starting voice input…',
  'Voice input unavailable',
  '$(comment-discussion) Agent Stats: ${this.todayStats.composerAcceptedLines}/${this.todayStats.composerSuggestedLines} (${t}%)',
  '$(comment-discussion) Agent Stats: ${this.todayStats.composerAcceptedLines}/${this.todayStats.composerSuggestedLines} (${e}%)',
  '$(tab) Tab Stats: ${this.todayStats.tabAcceptedLines}/${this.todayStats.tabSuggestedLines} (${t}%)',
  '$(tab) Tab Stats: ${this.todayStats.tabAcceptedLines}/${this.todayStats.tabSuggestedLines} (${e}%)',
  'Plan Mode improves agent outcomes and accuracy - hit shift+tab to get started',
  'Explore Subagent Model',
  'About the default Explore model',
  'View All Models',
  'Choose a model or use the cost- and availability-aware default',
  'Upgrade to Pro',
  'Upgrade to ${d.label}',
  'Upgrade to ${e}',
  'Upgrade to ${t.planName}',
  'Upgrade to ${e.name}',
  'Upgrade to ${p}',
  'Upgrade to ${_}',
  'Upgrade to ${R}',
  'Upgrade to ${u()}',
  'Upgrade to ${r.label}',
  'Upgrade to ${t}',
  'Upgrade to ${i.planName}',
  'Confirm Upgrade to ${p}',
  'Thought',
  'Question',
  'Questions',
  'Asking questions',
  'Computer Use',
  'Always-allowed apps: Cursor can use these in any chat without asking. Remove one to be asked again.',
  'No always-allowed apps yet. Choose Always Allow when Cursor asks to use an app.',
  'Add more optional details',
  'Add more optional details...',
  'available tools',
  'Explored',
  'Continue',
  'Get Cursor for iOS',
  'Get Grok Bot',
  'Contact Us',
  'Log Out',
  'Share Data',
  'Improve Cursor for everyone',
  'No training. Code may be stored for Background Agent and other features.',
  'Choose the default behavior of messages sent while Agent is working',
  'Custom words that submit a voice prompt. Spaces and punctuation are ignored.',
  'Third-Party Imports',
  'Choose how Agents run tools like command execution, MCP, and file writes.',
  "A classifier will run for each action and decide whether it's safe to execute this command. Allowlists are still respected.",
  'File-Deletion Protection',
  'External-File Protection',
  'Allowlist Options',
  'You can configure Shell, MCP and Fetch allowlists for Auto mode. However, Auto works well without these.',
  'You can configure Shell, MCP, Fetch, and Read allowlists for Auto mode. However, Auto works well without these.',
  'Choose Origin (cursor.com/codebase) or GitHub for GitHub pull request links on web and desktop',
  'Choose Origin (cursor.com/codebase), GitHub, or Graphite for pull request links on web and desktop',
  'Inside Cursor',
  'Index Repositories for Instant Grep',
  'Automatically index repositories to speed up Grep searches. All data is stored locally.',
  'Start from scratch',
  'Use Existing...',
  'This PC',
  'This Mac',
  'This Computer',
  'Submit with Ctrl + Enter',
  'Learn more',
  'When enabled, your cursor.com profile page is visible to anyone with the link.',
  'Public profiles are disabled by your team admin.',
  'Current Plan',
  'Upgrade Available',
  'Adjust Plan',
  'Unlock 3x more usage on Agent & more',
  'Cursor Models',
  'Includes Cursor Grok and Composer',
  'Other Models',
  'Additional usage beyond limits consumes Other Models quota or on-demand spend.',
  'Additional usage beyond limits consumes on-demand spend.',
  'Search Settings',
  'Remote Control',
  'Allow agents on this computer to be controlled remotely from mobile',
  'Auto-Review',
  'Auto-Review (with Sandbox)',
  'Auto-review',
  'Auto-review (with Sandbox)',
  'Allowlist',
  'Run Everything',
  'Run Everything (Unsandboxed)',
  'Auto-Accept Web Search',
  'Skip approval dialog; Agent may run web searches automatically',
  'Wait indefinitely to authenticate when prompted. When off, skip authentication prompts after 30 seconds.',
  'Browser Automation',
  'Browser Protection',
  'Connected to Browser Tab',
  'Browser Tab',
  'Browser automation disabled',
  'Prevent Agent from automatically running Browser tools',
  'Open Local Links in Cursor Browser',
  'Open Web Links in Cursor Browser',
  'Automatically open localhost links in the Browser Tab',
  'Automatically open http and https links in the Browser Tab',
  'By default, get notifications for stable updates. In Early Access, pre-release builds may be unstable for production work.',
  'Plan, Build, / for skills, @ for context',
  'Plan New Idea',
  'Multitask',
  'Run in Cloud',
  'Run locally in a Worktree',
  'Start with a plan',
  'Align on implementation before writing code',
  'Debug an issue',
  'Find root causes and fix tricky bugs',
  'New Automation',
  'No Automations Yet',
  'Ship better code, faster',
  'Review Code with Bugbot',
  'Catch bugs and auto-fix before they ship.',
  'Scan and Triage Security Vulnerabilities',
  'Security checks on every change.',
  'Route PR Reviews and Auto-Approve',
  'Assign reviewers and approve PRs.',
  'Get Started',
  'All Runs',
  'Mine',
  'Team',
  'Search...',
  'New Project',
  'Projects',
  'Automate repetitive tasks with always-on agents and configure Cursor\'s built-in agents for your team.',
  'Show status filters',
  'Show PR filters',
  'Show environment filters',
  'Sidebar filters',
  'Hide Sidebar',
  'Show Sidebar'
];

/** Labels inside Cursor's pre-rendered HTML welcome-card strings. */
const HTML_LABELS = [
  'New Chat',
  'Open project',
  'Clone repo',
  'Connect via SSH',
  'Connect via WSL',
  'Steer from iOS',
  'Upgrade',
  'Sign in',
  'New Window',
  'No commit scored'
];

/** Fragments inside template literals. The translation is the dictionary value. */
const PHRASES = [
  'answer:"Skipped"',
  'action:"Skipped",details:',
  'const ne=h?"Hide":"Show"',
  'const d=n?"Hide":"Show"',
  'const le=p?"Hide":"Show"',
  'children:["Browse",',
  'children:[`Browse`,',
  'case`user`:return`User`;case`team`:return',
  'case"user":return"User";case"team":return',
  'user:`User`,team:',
  'workspace:`Workspace`,workspaces:`Workspaces`,sources:`Sources`',
  'return e.resourceCount>0?`${n}, ${`${e.resourceCount} resource${e.resourceCount===1?``:`s`}`} enabled`:`${n} enabled`',
  '${t} tool${t===1?``:`s`}',
  'case`user`:return`User`;case`team`:return`Team`;case`project`:return',
  'case`user`:return`User`;case`project`:return',
  'case`inline`:return`Built-in`;case`user`:return`User`',
  'user:`User`,team:`Team`,workspace:`Workspace`,workspaces:`Workspaces`,sources:`Sources`',
  '${e} tool${e===1?"":"s"}',
  '${t.resourceCount} resource${t.resourceCount===1?"":"s"}',
  '${n}, ${i} enabled',
  '${n} enabled',
  'case"user":return"User";case"team":return"Team";case"project":return',
  'case"user":return"User";case"project":return',
  '. Changing this setting requires restarting Cursor.',
  'Use with caution. Skip symlinks during .cursorignore file discovery. Enable only when all .cursorignore files are reachable without symlinks',
  'Control whether agents can read files outside the workspace without approval',
  'queue:"Queue"',
  '??"Queue"',
  '${n}, select project',
  '${$e}, select environment',
  'Prevent Agent from creating or modifying files outside of the workspace automatically',
  'Prevent Agent from deleting files automatically',
  'Use with caution. Skip symlinks during .cursorignore file discovery. Enable only when all .cursorignore files are reachable without symlinks.',
  'Apply .cursorignore files to all subdirectories',
  'Changing this setting requires restarting Cursor.',
  ' (controlled by admin)',
  'Accept the next word of a suggestion via ',
  'Automatically import necessary modules for ',
  'Automatically parse links when pasted into Quick Edit (',
  "Mark Agent commits as 'Made with Cursor'",
  'Mark pull requests as made with Cursor',
  'Automatically index repositories to speed up Grep searches. All data is stored locally.',
  'Usage limits reset on ',
  '${s} hour${s===1?"":"s"} and ${o} minute${o===1?"":"s"} left',
  '${s} hour${s===1?"":"s"} left',
  '${o} minute${o===1?"":"s"} left',
  '${a} day${a===1?"":"s"} left',
  '${dh1(t)}% used',
  'Included in ',
  'Enter submits chat, Enter inserts a newline, and primary actions move to ',
  'Submit with ',
  'return"Customize"',
  'name:"Customize"',
  'children:["Open",b]',
  'children:n.length>0?"Review":"Open"',
  'children:y?"Importing\\u2026":"Import"',
  'const ce=p?"Hide":"Show"',
  'const h=n?"Hide":"Show"',
  'case"docs":return"Docs"',
  'docs:"Docs"',
  'Search settings',
  'value:"New Chat"',
  '||"New Chat"',
  '??"New Chat"',
  'LABEL="New Chat"',
  'pageTitle:"Automations"',
  'e7a="New Chat"',
  'MUd="New Chat"',
  '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}'
];

/**
 * Agents sidebar “Source” means 来源. The same word on a file tab means the
 * raw view, so it cannot be a plain `label:"Source"` replacement.
 * The minified binding between these two fields changes between builds.
 */
const SOURCE_FILTER_KEY = 'contentLabel:"Show source filters",label:"Source"';
const SOURCE_FILTER_RE = /contentLabel:"Show source filters",deviates:([A-Za-z_$][\w$]*),label:"Source"/g;

function isWelcomeTip(key) {
  return /^(?:Use [/@]|Ask Mode uses|Plan Mode improves|Tell Cursor to use|Hooks let|After long sessions, use|Messages sent while Cursor is working)/.test(key);
}

const NAV_RE = /(?:"([A-Za-z0-9-]+)"|([A-Za-z_$][\w$]*)):"((?:\\.|[^"\\])*)"/g;

/**
 * Replace a translation only when the English text is the entire value of a
 * UI field (`label:"…"`, `title:"…"`, …) or a Cursor Settings sidebar name.
 * A word inside a longer string, a search keyword, or an id is left alone.
 */
export function rewrite(source, dict) {
  FIELD_RE.lastIndex = 0;
  const hits = new Map();
  let count = 0;
  let text = source.replace(FIELD_RE, (full, field, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `${field}:"${translated}"`;
  });

  TEMPLATE_FIELD_RE.lastIndex = 0;
  text = text.replace(TEMPLATE_FIELD_RE, (full, field, raw) => {
    const translated = translateUiTemplate(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `${field}:\`${translated}\``;
  });

  UPDATE_TOOLTIP_RE.lastIndex = 0;
  text = text.replace(UPDATE_TOOLTIP_RE, (full, raw) => {
    const translated = translateUiTemplate(raw, dict, hits, UPDATE_TOOLTIP_RULES);
    if (translated === null) return full;
    count++;
    return `\`${translated}\``;
  });
  UPDATE_BUTTON_STATE_RE.lastIndex = 0;
  text = text.replace(UPDATE_BUTTON_STATE_RE, (full, first, second, third) => {
    const labels = ['Updating', 'Installing', 'Update'].map((english) => {
      if (typeof dict[english] !== 'string' || dict[english] === english) return `\`${english}\``;
      count++;
      hits.set(english, (hits.get(english) || 0) + 1);
      return JSON.stringify(dict[english]);
    });
    return `${first}${labels[0]}${second}${labels[1]}${third}${labels[2]}`;
  });

  text = text.replace(/"aria-label"\s*:\s*`([^`\r\n]*)`/g, (full, raw) => {
    const translated = translateUiTemplate(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `"aria-label":\`${translated}\``;
  });

  text = text.replace(/("aria-label"\s*:\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\?)`([^`\r\n]*)`/g, (full, prefix, raw) => {
    const translated = translateUiTemplate(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `${prefix}\`${translated}\``;
  });

  text = text.replace(/"aria-label"\s*:\s*"((?:\\.|[^"\\])*)"/g, (full, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `"aria-label":"${translated}"`;
  });

  NAV_RE.lastIndex = 0;
  text = text.replace(NAV_RE, (full, quotedKey, bareKey, raw) => {
    const key = quotedKey || bareKey;
    const aliases = Object.hasOwn(SIDEBAR_ALIASES, key) ? SIDEBAR_ALIASES[key] : [];
    const expected = [SIDEBAR_ENGLISH[key], ...aliases].filter(Boolean);
    if (!expected.includes(unescapeJs(raw))) return full;
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    const prop = quotedKey ? `"${quotedKey}"` : bareKey;
    return `${prop}:"${translated}"`;
  });

  if (text.includes(MODE_FROM)) {
    let partCount = 0;
    const modeTo = MODE_PARTS.map(([key, english]) => {
      const translated = translateLiteral(english, dict, hits);
      if (translated === null) return `${key}:"${english}"`;
      partCount++;
      return `${key}:"${translated}"`;
    }).join(',');
    const modeHits = text.split(MODE_FROM).length - 1;
    if (modeHits && partCount) {
      count += modeHits * partCount;
      text = text.split(MODE_FROM).join(modeTo);
    }
  }

  let bareCount = 0;
  for (const english of new Set([...BARE_LABELS, ...Object.keys(dict).filter(isWelcomeTip)])) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = escapeJs(dict[english]);
    if (translated === english) continue;
    const forms = new Map([
      [`"${english}"`, `"${translated}"`],
      [`\`${english}\``, `\`${translated}\``],
      [`'${english}'`, `'${translated}'`]
    ]);
    if (/[^\x00-\x7f]/.test(english)) {
      const hex = english.replace(/[^\x00-\x7f]/g, (ch) => {
        const code = ch.charCodeAt(0).toString(16).padStart(4, '0');
        return `\\u${code}`;
      });
      forms.set(`"${hex}"`, `"${translated}"`);
      forms.set(`"${hex.toUpperCase()}"`, `"${translated}"`);
      forms.set(`'${hex}'`, `'${translated}'`);
      forms.set(`'${hex.toUpperCase()}'`, `'${translated}'`);
      forms.set(`\`${hex}\``, `\`${translated}\``);
      const upperHex = hex.replace(/\\u([0-9a-f]{4})/g, (_, code) => `\\u${code.toUpperCase()}`);
      forms.set(`\`${upperHex}\``, `\`${translated}\``);
    }
    for (const [from, to] of forms) {
      if (!text.includes(from)) continue;
      const n = text.split(from).length - 1;
      bareCount += n;
      hits.set(english, (hits.get(english) || 0) + n);
      text = text.split(from).join(to);
    }
  }

  // A few Cursor welcome cards ship pre-rendered HTML strings instead of
  // React text fields (for example: "<div>Open project"). Translate only
  // known complete text nodes, ending at a tag or a JS string delimiter.
  for (const english of HTML_LABELS) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = escapeJs(dict[english]);
    if (translated === english) continue;
    for (const delimiter of ['"', '<']) {
      const from = `>${english}${delimiter}`;
      const to = `>${translated}${delimiter}`;
      if (!text.includes(from)) continue;
      const n = text.split(from).length - 1;
      count += n;
      hits.set(english, (hits.get(english) || 0) + n);
      text = text.split(from).join(to);
    }
  }

  count += bareCount;

  for (const english of PHRASES) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = dict[english];
    if (typeof translated !== 'string' || translated === english || !text.includes(english)) continue;
    const n = text.split(english).length - 1;
    count += n;
    hits.set(english, (hits.get(english) || 0) + n);
    text = text.split(english).join(translated);
  }

  const sourceFilter = dict[SOURCE_FILTER_KEY];
  if (typeof sourceFilter === 'string' && sourceFilter !== SOURCE_FILTER_KEY && sourceFilter.includes('",label:"')) {
    SOURCE_FILTER_RE.lastIndex = 0;
    text = text.replace(SOURCE_FILTER_RE, (full, binding) => {
      count++;
      hits.set(SOURCE_FILTER_KEY, (hits.get(SOURCE_FILTER_KEY) || 0) + 1);
      return sourceFilter.replace('",label:"', `",deviates:${binding},label:"`);
    });
  }

  // Shared renderer chunks can supply the same duration header as Glass.
  // Keep this formatter self-contained so module evaluation order is irrelevant.
  text = text.replace(/`Worked for \$\{([A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\))\}`/g, template => {
    count++;
    return `(${translateHistoryStatus.toString()})(${template})`;
  });
  return { text, count, hits };
}

function checksumBase64(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
}

/** Cursor compares these hashes to the files on disk and otherwise says the install is damaged. */
function plannedChecksums(appRoot, contents = new Map()) {
  const productFile = path.join(appRoot, 'product.json');
  const originalText = fs.readFileSync(productFile, 'utf8');
  let text = originalText;
  let changed = 0;
  for (const rel of bundlePaths(appRoot)) {
    const key = rel.replace(/^out\//, '');
    const file = bundlePath(appRoot, rel);
    if (!fs.existsSync(file)) continue;
    const re = new RegExp(`("${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*")([^"]*)(")`);
    if (!re.test(text)) continue;
    const hash = checksumBase64(contents.get(rel) ?? fs.readFileSync(file));
    text = text.replace(re, (full, open, current, close) => {
      if (current === hash) return full;
      changed++;
      return `${open}${hash}${close}`;
    });
  }
  return {text, originalText, changed};
}

function syncChecksums(appRoot) {
  const {text,originalText,changed}=plannedChecksums(appRoot);
  if (changed) {
    const info = readCursorInfo(appRoot);
    const backup = backupPath(info.dataFolderName, info.commit, 'product.json', sha256(Buffer.from(originalText)));
    if (!fs.existsSync(backup)) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      writeFileAtomic(backup, originalText);
    }
    writeFileAtomic(path.join(appRoot,'product.json'), text);
  }
  return changed;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hardcodedFile(localeId) {
  return p('src', 'i18n', localeId, 'hardcoded.json');
}

function loadDict(localeId) {
  const file = hardcodedFile(localeId);
  if (!fs.existsSync(file)) {
    const ready = config.locales
      .filter((l) => l.enabled !== false && fs.existsSync(hardcodedFile(l.id)))
      .map((l) => l.id);
    fail(`${localeId} 没有硬编译文（${path.relative(p('.'), file)}）。可用：${ready.join(', ') || '无'}。`);
  }
  const data = readJson(file);
  const localOverridesFile = p(`local-overrides.${localeId}.json`);
  const localOverrides = fs.existsSync(localOverridesFile)
    ? readJson(localOverridesFile)
    : {};
  if (!localOverrides || typeof localOverrides !== 'object' || Array.isArray(localOverrides)) {
    fail(`${path.relative(p('.'), localOverridesFile)} 必须是 JSON 对象。`);
  }
  const dict = {};
  for (const [key, value] of Object.entries({ ...data, ...localOverrides })) {
    // Icon labels and ${...} UI templates are real entries, not $comment metadata.
    if (key.startsWith('$') && !key.startsWith('$(') && !key.startsWith('${')) continue;
    if (typeof value !== 'string' || value.length === 0) {
      fail(`${path.relative(p('.'), file)} 里 “${key}” 的译文是空的。`);
    }
    if (value !== key) dict[key] = value;
  }
  if (!Object.keys(dict).length) fail(`${path.relative(p('.'), file)} 里没有译文。`);
  return dict;
}

function loadRuntimeOverrides(localeId, dict) {
  const file = p(`runtime-overrides.${localeId}.json`);
  if (!fs.existsSync(file)) return {};
  const overrides = readJson(file);
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    fail(`${path.relative(p('.'), file)} 必须是 JSON 对象。`);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!key || typeof value !== 'string' || value.length === 0) {
      fail(`${path.relative(p('.'), file)} 里有空的原文或译文。`);
    }
  }
  // These fixed welcome tips can also arrive from the service. Reuse their
  // reviewed static translations rather than maintain a second copy.
  const tips = Object.fromEntries(Object.entries(dict).filter(([key]) => isWelcomeTip(key)));
  return Object.fromEntries(Object.entries({ ...tips, ...overrides }).filter(([key, value]) => key !== value));
}

export function injectRuntimeOverrides(source, overrides, menuOverrides = {}, historyCatalog = {version:1,entries:[]}) {
  const entries = Object.entries(overrides);
  if (!entries.length || source.includes('globalThis.__cursorZhCnRuntimeTextOverrides')) return source;
  const mapping = JSON.stringify(Object.fromEntries(entries))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const menuMapping = JSON.stringify(menuOverrides);
  // Cursor splits command tips into text and inline code while rendering.
  // Translate the complete UI tip first, retaining React's own markup and nodes.
  // This exact anchor belongs to glass-empty-state-rotating-tips, never chat text.
  const tipValues = [
    'const Te=j?M?"":ciy:M?"":K?.text??"";', // 3.26.16
    'const Ce=j?M?"":uyy:M?"":V?.text??"";', // 3.27.6
    'const Ce=j?M?"":qky:M?"":V?.text??"";' // 3.27.12
  ];
  let withTipTranslation = source;
  let tipHooks = 0;
  for (const anchor of tipValues) {
    if (!source.includes(anchor)) continue;
    tipHooks++;
    withTipTranslation = withTipTranslation.replace(anchor, anchor.replace('=', '=globalThis.__cursorZhCnTranslateUiText(').replace(/;$/, ');'));
  }
  if (source.includes('"data-component":"glass-empty-state-rotating-tips"') && tipHooks !== 1) {
    throw new Error('轮播提示渲染入口已变化，已停止应用；请先重新核对该版本的提示模板。');
  }
  // Workspace exclusions and frame batching are adapted from ggbdpq/cursor-loc
  // (MIT), packages/patch-core/src/assets/cursor.inject.js. See NOTICE.
  const bootstrap = `
;(()=>{try{
  if(typeof document==="undefined"||globalThis.__cursorZhCnRuntimeTextOverrides)return;
  globalThis.__cursorZhCnRuntimeTextOverrides=true;
  const m=${mapping};
  const menuM=${menuMapping};
  const has=s=>Object.prototype.hasOwnProperty.call(m,s);
  const hasMenu=s=>Object.prototype.hasOwnProperty.call(menuM,s);
  const menuSelector='[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[data-component="glass-in-app-menubar"]';
  const inMenu=e=>Boolean(e?.closest(menuSelector));
  globalThis.__cursorZhCnTranslateUiText=s=>typeof s==="string"&&has(s)?m[s]:s;
  const excluded='script,style,pre,code,textarea,input,[contenteditable]:not([contenteditable="false"]),.view-lines,.explorer-folders-view,.search-view .results,.xterm-rows,.monaco-breadcrumbs,.ui-code-block-content,[data-ui-code-block-diff],.rendered-markdown,.markdown-body,.markdown-rendered,[data-streamdown],.composer-human-message,.composer-user-message,[data-message-role],[data-role="user"],[data-role="assistant"]';
  const controlOnly=new Set(["Default","Queue","Settings","Small","Large","Dismiss","Browse Marketplace","Open"]);
  const controls='button,[role="button"],[role="combobox"],[role="option"],[role="menuitem"],[role="switch"],[role="tab"]';
  const blocked=n=>{const e=n.nodeType===1?n:n.parentElement;return Boolean(e?.closest(excluded+",.composer-assistant-message"))};
  const apply=n=>{
    // Only UI placeholders are changed on form controls; their values and text
    // remain untouched, including the editable prompt and search query.
    if(n?.nodeType===1&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA")){
      const v=n.getAttribute("placeholder");
      if(v!==null){
        const q=/^Search (.+) for (.+)\\.\\.\\.$/.exec(v);
        const translated=has(v)?m[v]:q?"在 "+q[2]+" 中搜索"+q[1]+"…":v;
        if(translated!==v)n.setAttribute("placeholder",translated);
      }
      return;
    }
    if(!n||blocked(n))return;
    if(n.nodeType===3){
      const v=n.nodeValue,t=v.trim();
      const translated=has(t)&&(!controlOnly.has(t)||n.parentElement?.closest(controls))?m[t]:hasMenu(t)&&inMenu(n.parentElement)?menuM[t]:null;
      if(translated!==null&&translated!==t){
        const i=v.indexOf(t);n.nodeValue=v.slice(0,i)+translated+v.slice(i+t.length);
      }
      return;
    }
    if(n.nodeType!==1&&n.nodeType!==9)return;
    if(n.nodeType===1){for(const a of ["aria-label","title","placeholder"]){
      const v=n.getAttribute(a);
      if(v!==null&&has(v))n.setAttribute(a,m[v]);
      else if(v!==null&&hasMenu(v)&&inMenu(n))n.setAttribute(a,menuM[v]);
      else if(a==="aria-label"&&v!==null){
        const translated=v.replace(/, select project$/, "，选择项目").replace(/, select environment$/, "，选择环境");
        const configured=translated.replace(/^Configure (.+)$/, "配置 $1");
        if(configured!==v)n.setAttribute(a,configured);
      }
    }}
    for(let c=n.firstChild;c;c=c.nextSibling)apply(c);
  };
  const pending=new Set();let scheduled=false;
  const queue=n=>{const form=n?.nodeType===1&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA");if(!n||(blocked(n)&&!form))return;
    if(inMenu(n.nodeType===1?n:n.parentElement)){apply(n);return;}
    if(n.nodeType===1&&typeof n.querySelectorAll==="function")for(const menu of n.querySelectorAll(menuSelector))apply(menu);
    pending.add(n);if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;const nodes=Array.from(pending);pending.clear();for(const node of nodes)apply(node)});
  };
  apply(document);
  const observer=new MutationObserver(records=>{for(const record of records){
    if(record.type==="characterData"||record.type==="attributes")queue(record.target);
    else for(const node of record.addedNodes)queue(node);
  }});
  observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-label","title","placeholder"]});
  globalThis.__cursorZhCnRuntimeTextObserver=observer;
}catch{}})();
`;
  return bootstrap + historyBootstrap(historyCatalog) + withTipTranslation;
}

function bundlePath(appRoot, rel) {
  return path.join(appRoot, ...rel.split('/'));
}

function stateDir(dataFolderName) {
  return path.join(os.homedir(), dataFolderName || '.cursor', 'cursor-language-pack');
}

function recordPath(dataFolderName) {
  return path.join(stateDir(dataFolderName), 'rewrite.json');
}

function backupPath(dataFolderName, commit, rel, hash) {
  const name = `${rel.split('/').join('__')}__${hash.slice(0, 12)}`;
  return path.join(stateDir(dataFolderName), 'backup', commit || 'unknown', name);
}

export function cursorCli(installRoot) {
  const names = process.platform === 'win32' ? ['Cursor.exe', 'cursor.exe'] : ['Cursor', 'cursor'];
  const candidates = [
    ...names.map((name) => path.join(installRoot, name)),
    ...names.map((name) => path.join(installRoot, 'bin', name)),
    path.join(installRoot, 'MacOS', 'Cursor')
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

export function assertCursorStopped(installRoot) {
  if (process.platform !== 'win32') {
    const result = spawnSync('ps', ['-ax', '-o', 'comm='], {encoding:'utf8'});
    if (result.error || result.status !== 0) fail('无法确认 Cursor 是否已退出，已停止写入。');
    const running = result.stdout.split(/\r?\n/).some(line => line.includes(installRoot) || /(?:^|\/)Cursor(?:$|\.app\/Contents\/)/i.test(line.trim()));
    if (running) fail('Cursor 仍在运行，请完全退出后再应用。');
    return;
  }
  if (fs.existsSync(path.join(installRoot, 'cursor-update.journal.json'))
      || !fs.existsSync(path.join(installRoot, 'Cursor.exe'))) {
    fail('Cursor 正在更新或安装目录尚不完整，已停止写入。请等更新完成后再执行。');
  }
  const imageName = path.basename(cursorCli(installRoot) || 'Cursor.exe');
  const result = spawnSync('tasklist.exe', ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'], {
    encoding: 'utf8', windowsHide: true
  });
  if (result.error || result.status !== 0) fail('无法确认 Cursor 是否已退出，已停止写入。');
  if (result.stdout.split(/\r?\n/).some(line => {
    const match = /^"([^"]+)","(\d+)"/.exec(line);
    return match && match[1].toLowerCase() === imageName.toLowerCase() && Number(match[2]) !== process.pid;
  })) {
    fail('Cursor 仍在运行。请完全退出 Cursor 后重新执行，避免旧进程覆盖汉化或缓存。');
  }
}

/** Preserve old compiled JavaScript caches so the next launch reads new files. */
function refreshScriptCaches(info) {
  if (!/^[a-f0-9]{40}$/i.test(info.commit || '')) return [];
  const dataRoot = process.platform === 'win32' ? process.env.APPDATA
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  if (!dataRoot) return [];
  const userDataRoot = path.resolve(dataRoot, 'Cursor');
  const destinationRoot = path.resolve(stateDir(info.dataFolderName), 'cache-backup', new Date().toISOString().replace(/[:.]/g, '-'));
  const targets = [
    path.join(userDataRoot, 'CachedData', info.commit),
    path.join(userDataRoot, 'Code Cache'),
    path.join(userDataRoot, 'Cache'),
    path.join(userDataRoot, 'Partitions', 'molten', 'Code Cache'),
    path.join(userDataRoot, 'Partitions', 'molten', 'Cache')
  ];
  const languageCache = path.join(userDataRoot, 'clp');
  const localeId = typeof flags.locale === 'string' ? flags.locale : 'zh-cn';
  if (fs.existsSync(languageCache)) {
    for (const entry of fs.readdirSync(languageCache, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith(`.${localeId}`)) targets.push(path.join(languageCache, entry.name));
    }
  }
  const moved = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const resolved = path.resolve(target);
    const relative = path.relative(userDataRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('缓存路径超出 Cursor 用户数据目录。');
    const destination = path.resolve(destinationRoot, relative.replace(/[\\/]/g, '__'));
    if (!destination.startsWith(destinationRoot + path.sep)) throw new Error('缓存备份路径不在预定目录内。');
    fs.mkdirSync(destinationRoot, { recursive: true });
    fs.renameSync(resolved, destination);
    moved.push({ source: resolved, backup: destination });
  }
  if (moved.length) {
    writeJson(path.join(destinationRoot, 'manifest.json'), { refreshedAt: new Date().toISOString(), commit: info.commit, moved });
    log.plain(`旧脚本缓存已移至 ${destinationRoot}；下次启动会重新生成。`);
  }
  return moved;
}

function resolveInstall() {
  if (flags.dir) {
    const installRoot = path.resolve(String(flags.dir));
    const appRoot = cursorAppRoot(installRoot);
    if (!fs.existsSync(path.join(appRoot, 'package.json'))) {
      fail(`--dir=${flags.dir} 不是 Cursor 安装目录。\n  这一层要能看到 resources/app。macOS 填 Cursor.app/Contents。`);
    }
    return { installRoot, appRoot };
  }
  const found = findCursorInstalls();
  if (found.length === 1) return found[0];
  if (!found.length) {
    fail(
      '没有找到 Cursor。\n' +
      '  npm run translate -- --dir="安装目录"\n' +
      '  安装目录是包含 resources/app 的那一层。macOS 是 Cursor.app/Contents。'
    );
  }
  log.err('找到多个 Cursor，需要指定一个：');
  for (const item of found) {
    const info = readCursorInfo(item.appRoot);
    log.plain(`  npm run translate -- --dir="${item.installRoot}"    （${info.cursorVersion ?? '未知版本'}）`);
  }
  process.exit(1);
}

function localeChoice() {
  if (typeof flags.locale === 'string') {
    const named = config.locales.find((l) => l.id === flags.locale);
    if (!named) fail(`不认识的语言 “${flags.locale}”。`);
    return named;
  }
  return config.locales.find((l) => l.id === 'zh-cn')
    ?? config.locales.find((l) => l.enabled !== false);
}

function loadLocaleWriter() {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return {
        l10n: { t: (message) => message },
        env: {},
        window: {},
        commands: {},
        workspace: {},
        extensions: { all: [] }
      };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    const require = createRequire(import.meta.url);
    return require(p('src', 'extension', 'main.cjs')).__test;
  } finally {
    Module._load = original;
  }
}

export function runCli(cli, args, appRoot) {
  const cliScript = path.join(appRoot, 'out', 'cli.js');
  const result = spawnSync(cli, [cliScript, ...args], { stdio: 'inherit', windowsHide:true, env:{...process.env,ELECTRON_RUN_AS_NODE:'1'} });
  return !result.error && result.status === 0;
}

function findVsix() {
  return findVersionedVsix(p('dist'), config.namePrefix, config.version);
}

function packInstalled(dir) {
  if (!fs.existsSync(dir)) return false;
  const prefix = `${config.publisher}.${config.namePrefix}`.toLowerCase();
  for (const name of activeExtensionNames(dir)) {
    const manifest = readJson(path.join(dir, name, 'package.json'), null);
    if (!manifest) continue;
    const id = `${manifest.publisher ?? ''}.${manifest.name ?? ''}`.toLowerCase();
    if (id === prefix && manifest.version === config.version) return true;
  }
  return false;
}

function conflictingPacks(dir, localeId) {
  if (!fs.existsSync(dir)) return [];
  const ours = `${config.publisher}.`.toLowerCase();
  const found = [];
  for (const name of activeExtensionNames(dir)) {
    const manifest = readJson(path.join(dir, name, 'package.json'), null);
    const localizations = manifest?.contributes?.localizations;
    if (!Array.isArray(localizations)) continue;
    const id = `${manifest.publisher ?? ''}.${manifest.name ?? ''}`;
    if (id.toLowerCase().startsWith(ours)) continue;
    const claims = localizations.some((item) =>
      item.languageId === localeId && (item.translations ?? []).some((tr) => tr.id === 'vscode'));
    if (claims) found.push(id);
  }
  return found;
}

function completeSetup(install, info, locale) {
const cli = cursorCli(install.installRoot);
const extDir = extensionsDir(info.dataFolderName);
const vsix = findVsix();

const outcome = finalizeInstallation({
  packNeeded: !packInstalled(extDir) || flags['force-language-pack'], vsix, cli,
  installPack: () => runCli(cli, ['--install-extension', vsix, '--force'], install.appRoot),
  setLocale: () => {
    const { writeLocale } = loadLocaleWriter();
    writeLocale(argvJsonPath(info.dataFolderName), locale.id);
  }
});
if (!outcome.complete) fail(`安装未完成：${outcome.failures.join('；')}。\n应用资源已改写，备份和记录已保留。修复原因后重新运行安装入口，或使用 --undo 恢复程序文件。\n阶段：${JSON.stringify(outcome.stages)}`);
log.ok('配套语言包与显示语言已就绪。');
let conflictFailed = false;

for (const id of conflictingPacks(extDir, locale.id)) {
  if (!cli) {
    conflictFailed = true; log.warn(`请卸载另一个语言包：${id}`);
    continue;
  }
  if (runCli(cli, ['--uninstall-extension', id],install.appRoot)) log.ok(`已卸载 ${id}`);
  else { conflictFailed = true; log.warn(`没能卸载 ${id}，语言包冲突尚未解决。`); }
}
if (conflictFailed) fail('安装未完成：存在语言包冲突。资源备份与改写记录已保留，请处理上方冲突后重试。');

}

function selfTest() {
  const sample = [
    'keep({label:"Sign In",title:"General",id:"Sign In",children:"Open","aria-label":"Sign In",note:"Sign In please"})',
    'skip("Sign In")',
    'quoted({description:"Say \\"hi\\""})',
    'logic(new Set(["Archived"]))',
    'keys({searchKeywords:["Terminal","Bash"]})',
    'nav({"plan-usage":"Plan & Usage",general:"General",tab:"Tab",mcp:"MCP",id:"General",original:"VS Code Settings"})',
    'modes({agent:"Agent",chat:"Chat",background:"Cloud",plan:"Plan",spec:"Spec",debug:"Debug",triage:"Triage"})',
    'fn(()=>"Rules, Skills, Subagents")'
  ].join('\n');
  const { text, count } = rewrite(sample, {
    'Sign In': '登录',
    General: '通用',
    Open: '打开',
    'Say "hi"': '说「你好」',
    Archived: '已归档',
    Terminal: '终端',
    'Plan & Usage': '计划与用量',
    'VS Code Settings': 'VS Code 设置',
    'Rules, Skills, Subagents': '规则、技能、子智能体',
    Tab: '代码补全',
    Agent: '智能体',
    Chat: '对话',
    Cloud: '云端',
    Plan: '计划',
    Spec: '规格',
    Debug: '调试',
    Triage: '分诊'
  });
  const expect = [
    text.includes('label:"登录"'),
    text.includes('title:"通用"'),
    text.includes('id:"Sign In"'),
    text.includes('"aria-label":"登录"'),
    text.includes('note:"Sign In please"'),
    text.includes('children:"打开"'),
    text.includes('skip("Sign In")'),
    text.includes('description:"说「你好」"'),
    text.includes('new Set(["Archived"])'),
    text.includes('searchKeywords:["Terminal","Bash"]'),
    text.includes('"plan-usage":"计划与用量"'),
    text.includes('general:"通用"'),
    text.includes('id:"General"'),
    text.includes('original:"VS Code Settings"'),
    text.includes('()=>"规则、技能、子智能体"'),
    text.includes('tab:"代码补全"'),
    text.includes('mcp:"MCP"'),
    text.includes('agent:"智能体"'),
    text.includes('background:"云端"'),
    text.includes('triage:"分诊"'),
    count === 16
  ];
  const menuSample = '[{label:`Undo`,edit:`undo`,shortcut:`Ctrl+Z`},{label:`Redo`,edit:`redo`,shortcut:`Ctrl+Y`},{label:`Cut`,edit:`cut`,shortcut:`Ctrl+X`},{label:`Copy`,edit:`copy`,shortcut:`Ctrl+C`},{label:`Paste`,edit:`paste`,shortcut:`Ctrl+V`},{label:`Select All`,edit:`select-all`,shortcut:`Ctrl+A`},{label:`Exit`,command:`window.quit`}]';
  const menu = rewrite(menuSample, { Undo: '撤销', Redo: '重做', Cut: '剪切', Copy: '复制', Paste: '粘贴', 'Select All': '全选', Exit: '退出' });
  expect.push(
    ['撤销', '重做', '剪切', '复制', '粘贴', '全选', '退出'].every((label) => menu.text.includes(`label:\`${label}\``)),
    JSON.stringify(menuSample.match(/(?:edit|shortcut|command):`[^`]+`/g)) === JSON.stringify(menu.text.match(/(?:edit|shortcut|command):`[^`]+`/g)),
    menu.count === 7
  );
  const updater = rewrite('let visible=downloading?`Updating`:installing?`Installing`:`Update`,next;const hint=`Downloading the update (${Math.floor(update.progress*100)}%) — ${appName} restarts as soon as it\'s ready`;', {
    Updating: '正在更新', Installing: '正在安装', Update: '更新',
    "Downloading the update ({0}%) — {1} restarts as soon as it's ready": '正在下载更新（{0}%），完成后 {1} 将自动重启'
  });
  expect.push(
    updater.text.includes('let visible=downloading?"正在更新":installing?"正在安装":"更新",next;'),
    updater.text.includes('`正在下载更新（${Math.floor(update.progress*100)}%），完成后 ${appName} 将自动重启`'),
    updater.count === 4
  );
  const escapedUpdater = rewrite('const hint=`Downloading the update (${Math.floor(state.progress*100)}%) \\u2014 ${product} restarts as soon as it\'s ready`,ready=`Update is ready \\u2014 click to restart`;', {
    "Downloading the update ({0}%) — {1} restarts as soon as it's ready": '正在下载更新（{0}%），完成后 {1} 将自动重启',
    'Update is ready — click to restart': '更新已就绪，点击即可重启'
  });
  expect.push(
    escapedUpdater.text.includes('`正在下载更新（${Math.floor(state.progress*100)}%），完成后 ${product} 将自动重启`'),
    escapedUpdater.text.includes('ready=`更新已就绪，点击即可重启`'),
    escapedUpdater.count === 2
  );
  const sourceSample = [
    '{value:"raw",label:"Source",ariaLabel:"Source"}',
    '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}',
    'van({contentLabel:"Show source filters",deviates:mn,label:"Source"})'
  ].join('\n');
  const source = rewrite(sourceSample, {
    '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}': '{value:"source",label:"来源",icon:"arrow-bracket-to-right"}',
    'contentLabel:"Show source filters",label:"Source"': 'contentLabel:"显示来源筛选",label:"来源"'
  });
  expect.push(
    source.text.includes('{value:"raw",label:"Source",ariaLabel:"Source"}'),
    source.text.includes('{value:"source",label:"来源",icon:"arrow-bracket-to-right"}'),
    source.text.includes('contentLabel:"显示来源筛选",deviates:mn,label:"来源"'),
    source.count === 2
  );
  if (expect.some((ok) => !ok)) {
    fail(`self-test failed\n${text}\n${source.text}`);
  }
  log.ok('self-test ok');
  process.exit(0);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun && flags['self-test']) selfTest();

if (isDirectRun) {

const install = resolveInstall();
const info = readCursorInfo(install.appRoot);
const recPath = recordPath(info.dataFolderName);
const journalPath = path.join(stateDir(info.dataFolderName),'install-transaction.json');
if (!flags.preview) {
  assertCursorStopped(install.installRoot);
  try {
    const recovery=recoverFileTransaction({journalPath,appRoot:install.appRoot,ledgerPath:recPath,commit:info.commit});
    if(!recovery.complete)fail('上次安装未恢复完成，记录已保留：'+JSON.stringify(recovery.failures));
    if(recovery.recovered)log.ok('上次中断的安装已恢复到操作前状态。');
  }catch(error){fail(error.message)}
}
const record = readJson(recPath, null);
const sameInstall = record
  && record.installRoot === install.installRoot
  && record.commit === info.commit;

if (!flags.preview && !flags.undo && !(config.target.runtimeVerifiedCursorVersions ?? config.target.verifiedCursorVersions).includes(info.cursorVersion)) {
  fail('当前 Cursor 版本尚未校准。请先运行 --preview 和 npm run check-upgrade，完成适配后再加入已验证版本。');
}
if (!flags.preview && !flags.undo && (process.platform !== 'win32' || process.arch !== 'x64')) fail('完整汉化补丁当前仅验收 Windows x64。其他系统可贡献适配，但本安装入口暂不写入应用资源。');
if (!flags.preview && !flags.undo) {
  const manifest = readJson(path.join(install.appRoot,'package.json'));
  if (manifest.type !== 'module' || !['./out/main.js','out/main.js'].includes(manifest.main)) {
    fail('应用启动入口与本版本的适配记录不符，未改写任何资源。');
  }
}

if(flags['with-offline']&&!flags.preview&&!flags.undo){
  const prepared=spawnSync(process.execPath,[p('scripts','setup-offline.mjs'),`--state=${path.join(stateDir(info.dataFolderName),'offline')}`],{stdio:'inherit',windowsHide:true,env:process.env});
  if(prepared.status!==0)fail('离线引擎准备未完成，未改写 Cursor 程序文件。');
}

if (flags.undo) {
  if (!sameInstall) {
    fail(`这个安装没有与当前 commit 匹配的备份，不能跨版本还原。\n  ${install.installRoot}`);
  }
  const result = restoreTrackedFiles(record.files, rel => bundlePath(install.appRoot, rel));
  const left = result.remaining;
  for (const item of result.failures) log.warn(`${item.rel} 未恢复：${item.reason}`);
  // Never bless unknown or unrecovered application files with new checksums.
  const checksums = result.complete ? syncChecksums(install.appRoot) : 0;
  refreshScriptCaches(info);
  if (Object.keys(left).length) writeFileAtomic(recPath, JSON.stringify({ ...record, files: left },null,2)+'\n');
  else fs.rmSync(recPath, { force: true });
  if (!result.complete) fail(`回滚未完成：已恢复 ${result.restored} 项，仍有 ${Object.keys(left).length} 项未恢复。记录及原始备份已保留：${recPath}`);
  log.ok(`已还原 ${result.restored} 个文件，${result.alreadyOriginal} 项原本已恢复。原始备份保留供核对。语言包和显示语言没有动。`);
  if (checksums) log.plain('安装校验已按当前文件重新算过。');
  process.exit(0);
}

const locale = localeChoice();
const dict = loadDict(locale.id);
const runtimeOverrides = loadRuntimeOverrides(locale.id, dict);
const historyCatalogFile = typeof flags['history-translations'] === 'string' ? path.resolve(flags['history-translations']) : path.join(stateDir(info.dataFolderName), `history-translations.${locale.id}.json`);
const historyCatalog = readHistoryCatalog(historyCatalogFile);
const menuOverrides = Object.fromEntries(MENU_LABELS.filter((key) => typeof dict[key] === 'string').map((key) => [key, dict[key]]));
const preview = flags.preview === true;
const plan = [];
const originalContents = new Map();
let total = 0;
const seen = new Set();

log.plain(`Cursor ${info.cursorVersion ?? '?'}    ${install.installRoot}`);
log.plain(`${locale.localizedLanguageName}（${locale.id}）${preview ? '    预览，不会写入' : ''}`);
if (Object.keys(runtimeOverrides).length) {
  log.plain(`编辑器与 Glass 界面运行时补漏：${Object.keys(runtimeOverrides).length} 条`);
}
log.plain(`顶栏菜单显示层补漏：${Object.keys(menuOverrides).length} 条（限菜单控件）`);
log.plain(`个人历史译文：${historyCatalog.entries.length} 条（在界面中导入后显示，不随公共维护包分发）`);

for (const rel of bundlePaths(install.appRoot)) {
  const file = bundlePath(install.appRoot, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file);
  const current = sha256(before);
  const previous = sameInstall ? record.files?.[rel] : null;
  if (previous && current !== previous.patched && current !== previous.original) {
    fail(`${rel} 已被其他程序修改，当前哈希与备份记录不符，已停止改写。`);
  }
  const source = previous?.backup && fs.existsSync(previous.backup)
    ? fs.readFileSync(previous.backup)
    : before;
  if(previous && sha256(source)!==previous.original)fail(`${rel} 原始备份缺失或损坏，已停止改写。`);
  originalContents.set(rel,source);
  const { text: staticText, count, hits } = rel === 'out/main.js'
    ? {text:source.toString('utf8'),count:0,hits:new Map()}
    : rewrite(source.toString('utf8'), dict);
  for (const key of hits.keys()) seen.add(key);
  const text = /^(?:out\/vs\/workbench\/workbench\.(?:desktop|glass)\.main\.js|molten\/dist\/renderer\/assets\/boot-[\w-]+\.js)$/.test(rel)
    ? injectRuntimeOverrides(staticText, runtimeOverrides, menuOverrides, historyCatalog)
    : rel === 'out/main.js' ? staticText + offlineMainBootstrap(info.dataFolderName) : staticText;
  if (text === before.toString('utf8')) continue;
  total += count;
  plan.push({ rel, file, before, text, count, original: sha256(source), source, previous });
  log.plain(`  ${rel}    ${count} 处`);
}

const missed = Object.keys(dict).filter((key) => !seen.has(key));
log.plain(`共 ${total} 处。译文表 ${Object.keys(dict).length} 条，这份安装里对上 ${seen.size} 条。`);

if (preview) {
  if (missed.length) {
    log.plain(`有 ${missed.length} 条在这份 Cursor 里没出现，例如：`);
    for (const key of missed.slice(0, 8)) log.plain(`  ${JSON.stringify(key)}`);
  }
  log.plain('确认后执行：npm run translate' + (locale.id === 'zh-cn' ? '' : ` -- --locale=${locale.id}`));
  process.exit(0);
}

if (!plan.length && total === 0 && !sameInstall) {
  fail('没有找到可适配的应用资源，未写入任何文件。');
}

const files = { ...(sameInstall ? record.files : {}) };
assertCursorStopped(install.installRoot);
if (readCursorInfo(install.appRoot).commit !== info.commit) {
  fail('检查期间 Cursor 已更新，已停止写入。请按新版本重新预览。');
}
for (const item of plan) {
  const result = spawnSync(process.execPath, ['--check', `--input-type=${item.rel.endsWith('.cjs') ? 'commonjs' : 'module'}`], {
    input: item.text, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) fail(`汉化后的 ${item.rel} 未通过语法检查，未写入任何应用资源。\n${result.stderr || result.error?.message || ''}`);
}
if (record && !sameInstall) {
  const previousCommit = /^[a-f0-9]{40}$/i.test(record.commit || '') ? record.commit : 'unknown';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeJson(path.join(stateDir(info.dataFolderName), 'history', `rewrite-${previousCommit}-${stamp}.json`), record);
}

const checksumPlan=plannedChecksums(install.appRoot,new Map(plan.map(item=>[item.rel,Buffer.from(item.text)])));
if(checksumPlan.changed){
  const productFile=path.join(install.appRoot,'product.json');
  const previous=sameInstall?record.files?.['product.json']:null;
  const source=previous?.backup&&fs.existsSync(previous.backup)?fs.readFileSync(previous.backup):Buffer.from(plannedChecksums(install.appRoot,originalContents).text);
  if(previous&&(sha256(source)!==previous.original||![previous.original,previous.patched].includes(sha256(Buffer.from(checksumPlan.originalText)))))fail('product.json 的备份或当前校验信息不符，已停止改写。');
  plan.push({rel:'product.json',file:productFile,before:Buffer.from(checksumPlan.originalText),text:checksumPlan.text,source,original:sha256(source),previous});
}
try {
  for (const item of plan) {
    const kept = item.previous?.backup && fs.existsSync(item.previous.backup)
      ? item.previous.backup
      : backupPath(info.dataFolderName, info.commit, item.rel, item.original);
    if (!fs.existsSync(kept)) {
      fs.mkdirSync(path.dirname(kept), { recursive: true });
      writeFileAtomic(kept, item.source);
    }
    if(sha256(fs.readFileSync(kept))!==item.original)throw Error('原始备份校验失败：'+item.rel);
    const patched = sha256(Buffer.from(item.text));
    files[item.rel] = {
      original: item.previous?.original ?? item.original,
      patched,
      backup: kept
    };
  }
  const nextRecord={
  installRoot: install.installRoot,
  cursorVersion: info.cursorVersion,
  commit: info.commit,
  locale: locale.id,
  packVersion: config.version,
  rewrittenAt: new Date().toISOString(),
  runtimeCacheBackups: [],
  files
  };
  applyFileTransaction({journalPath,appRoot:install.appRoot,ledgerPath:recPath,commit:info.commit,operations:[
    ...plan.map(item=>({file:item.file,bytes:Buffer.from(item.text),expectedBefore:sha256(item.before)})),
    {file:recPath,bytes:Buffer.from(JSON.stringify(nextRecord,null,2)+'\n'),expectedBefore:fs.existsSync(recPath)?sha256(fs.readFileSync(recPath)):null}
  ]});
} catch (err) { fail(err.message+'\n安装事务记录：'+journalPath); }
if(checksumPlan.changed)log.plain(`安装校验已更新（${checksumPlan.changed} 处）。`);
try { refreshScriptCaches(info); }
catch(error){fail('程序文件和恢复记录已完整写入，但缓存整理未完成：'+error.message+'。请排除原因后重试，或使用 --undo。');}

log.ok(`已改写 ${plan.length} 个文件，共 ${total} 处。`);
log.plain(`备份在 ${path.dirname(Object.values(files)[0].backup)}`);

completeSetup(install, info, locale);

log.plain('完全退出 Cursor 再打开。更新 Cursor 后重新执行 npm run translate。');
log.plain('还原程序文件：npm run translate -- --undo');
}
