import * as react_jsx_runtime from 'react/jsx-runtime';
import { WavePlan, WaveTask, DependencyEdge, Complexity } from '@devpilot.sh/core/db';
import { ParsedWavePlan, CriticalPathResult, WaveProgress, ParsedTask } from '@devpilot.sh/core/wave-planner';
import { ClassValue } from 'clsx';

interface DAGVisualizationProps {
    wavePlan: WavePlan;
    waveTasks: WaveTask[];
    dependencyEdges: DependencyEdge[];
    criticalPath: string[];
    onTaskClick?: (taskCode: string) => void;
    /**
     * What the agent on each task is doing right now, keyed by task code.
     *
     * Optional: a plan being reviewed has no agents, and a graph with no live
     * data must still render as a plan. When present it is what makes a node
     * breathe, name the file it is editing, and admit when it has gone quiet.
     */
    live?: Record<string, LiveTaskState>;
}
interface LiveTaskState {
    sessionStatus?: string;
    progressPercent?: number;
    telemetry?: {
        toolCalls?: number;
        filesTouched?: string[];
        lastAction?: {
            tool: string;
            path?: string;
        };
        idleMs?: number;
        costUsd?: number;
    } | null;
}
declare function DAGVisualization({ wavePlan, waveTasks, dependencyEdges, criticalPath, onTaskClick, live, }: DAGVisualizationProps): react_jsx_runtime.JSX.Element;

interface CriticalPathIndicatorProps {
    wavePlan: ParsedWavePlan;
    criticalPath?: CriticalPathResult;
    waveProgress?: Map<number, WaveProgress>;
    currentWaveIndex?: number;
    className?: string;
}
declare function CriticalPathIndicator({ wavePlan, criticalPath, waveProgress, currentWaveIndex, className, }: CriticalPathIndicatorProps): react_jsx_runtime.JSX.Element;

interface WaveProgressBarProps {
    wavePlan: ParsedWavePlan;
    waveProgress?: Map<number, WaveProgress>;
    currentWaveIndex?: number;
    className?: string;
}
declare function WaveProgressBar({ wavePlan, waveProgress, currentWaveIndex, className, }: WaveProgressBarProps): react_jsx_runtime.JSX.Element;

interface TableTask extends ParsedTask {
    waveIndex: number;
    waveLabel: string;
    status: 'pending' | 'active' | 'complete' | 'failed';
    isOnCriticalPath: boolean;
}
interface WaveTableViewProps {
    wavePlan: ParsedWavePlan;
    waveProgress?: Map<number, WaveProgress>;
    currentWaveIndex?: number;
    onTaskClick?: (task: TableTask) => void;
    className?: string;
}
declare function WaveTableView({ wavePlan, waveProgress, currentWaveIndex, onTaskClick, className, }: WaveTableViewProps): react_jsx_runtime.JSX.Element;

/**
 * A model name in either casing the codebase actually produces.
 *
 * `@devpilot.sh/core/db` declares the enum as 'HAIKU' | 'SONNET' | 'OPUS'
 * (what is stored), while the planner's `ParsedTask.recommendedModel` is
 * 'haiku' | 'sonnet' | 'opus' (what the model writes in its plan table). Both
 * reach these components depending on whether the plan came from the database
 * or straight from a run, and the cockpit's badge silently assumed the lower
 * case one — which typechecked only because the app declared its own `Model`
 * separately from core's.
 *
 * Rather than pick a winner and break one caller, normalise at the edge.
 */
type ModelName = 'HAIKU' | 'SONNET' | 'OPUS' | 'haiku' | 'sonnet' | 'opus';
/**
 * Presentation helpers the shared components need.
 *
 * Copied from the cockpit's `lib/utils` rather than imported from it: a package
 * that reaches back into the application consuming it is not a package. These
 * are pure and small, and the badge class names they return are defined by the
 * consumer's stylesheet, not here.
 */
declare function formatMinutes(minutes: number): string;
declare function getComplexityColor(complexity: Complexity): string;
declare function getModelColor(model: ModelName): string;
/** Stable hue per string, so the same repo is always the same colour. */
declare function stringToColor(str: string): string;

interface ModelBadgeProps {
    model: ModelName;
    className?: string;
}
declare function ModelBadge({ model, className }: ModelBadgeProps): react_jsx_runtime.JSX.Element;
interface ComplexityBadgeProps {
    complexity: Complexity;
    className?: string;
}
declare function ComplexityBadge({ complexity, className }: ComplexityBadgeProps): react_jsx_runtime.JSX.Element;

/**
 * Display helpers for text the planner wrote.
 *
 * Task labels and descriptions come straight out of the model's plan table,
 * where emphasis and code spans are markdown. Nothing that renders them is a
 * markdown renderer — SVG <text> nodes, one-line summaries, sidebar lists — so
 * the asterisks and backticks were drawn literally: a critical-path entry read
 * `**Public contract.** \`FormatBytesOptions\``.
 *
 * Stripping rather than rendering is deliberate. These are labels, not prose:
 * the emphasis marked a word inside a sentence that is no longer there, and a
 * bold run in a 20-character truncated node label communicates nothing.
 */
declare function plainText(value: string): string;
/** `1 task` / `2 tasks` — the plural bug this repo keeps re-growing by hand. */
declare function pluralize(count: number, noun: string, plural?: string): string;

/**
 * Local copy of the cockpit's `cn`.
 *
 * Importing it from the app would invert the dependency — the package would
 * depend on the application that consumes it. It is four lines; duplicating it
 * is cheaper than the coupling.
 */
declare function cn(...inputs: ClassValue[]): string;

export { ComplexityBadge, CriticalPathIndicator, DAGVisualization, type LiveTaskState, ModelBadge, WaveProgressBar, WaveTableView, cn, formatMinutes, getComplexityColor, getModelColor, plainText, pluralize, stringToColor };
