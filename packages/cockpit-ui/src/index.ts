/**
 * The DevPilot cockpit's plan-rendering surface.
 *
 * These components were written for the local cockpit and lived only there,
 * which meant the hosted plane could route work, track status and manage
 * connections — but could not show a customer the thing they were paying for.
 * Extracting them makes the hosted cockpit the *same* cockpit rather than a
 * second implementation that drifts.
 *
 * Everything here is presentational: give it a plan, it renders. There is no
 * data fetching, no store, and no knowledge of where the plan came from, which
 * is what lets one component serve a local SQLite read and a mirrored row on
 * the hosted plane.
 *
 * Consumers must add the palette, or the tokens these use resolve to nothing:
 *
 *   presets: [require('@devpilot.sh/cockpit-ui/theme')]
 */

export { DAGVisualization } from './components/DAGVisualization';
export { CriticalPathIndicator } from './components/CriticalPathIndicator';
export { WaveProgressBar } from './components/WaveProgressBar';
export { WaveTableView } from './components/WaveTableView';
export { ModelBadge, ComplexityBadge } from './components/badges';

export { plainText, pluralize } from './plan-text';
export { cn } from './cn';
export { formatMinutes, getComplexityColor, getModelColor, stringToColor } from './format';
