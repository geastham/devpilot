module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/src/stores/horizonStore.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useHorizonStore",
    ()=>useHorizonStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-ssr] (ecmascript)");
;
;
const useHorizonStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["devtools"])((set, get)=>({
        // Initial state
        items: [],
        selectedItemId: null,
        isLoading: false,
        error: null,
        // Actions
        setItems: (items)=>set({
                items
            }),
        addItem: (title, zone, repo)=>{
            const newItem = {
                id: `item-${Date.now()}`,
                title,
                zone,
                repo,
                complexity: null,
                priority: 0,
                plan: null,
                linearTicketId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                conflictingFiles: []
            };
            set((state)=>({
                    items: [
                        ...state.items,
                        newItem
                    ]
                }));
        },
        updateItem: (id, updates)=>set((state)=>({
                    items: state.items.map((item)=>item.id === id ? {
                            ...item,
                            ...updates,
                            updatedAt: new Date()
                        } : item)
                })),
        deleteItem: (id)=>set((state)=>({
                    items: state.items.filter((item)=>item.id !== id),
                    selectedItemId: state.selectedItemId === id ? null : state.selectedItemId
                })),
        promoteItem: (id, targetZone)=>{
            set((state)=>({
                    items: state.items.map((item)=>item.id === id ? {
                            ...item,
                            zone: targetZone,
                            updatedAt: new Date()
                        } : item)
                }));
            // If promoting to REFINING, trigger plan generation
            if (targetZone === 'REFINING') {
                // TODO: Call API to generate plan
                console.log('Plan generation triggered for item:', id);
            }
        },
        dispatchItem: async (id)=>{
            set({
                isLoading: true,
                error: null
            });
            try {
                // TODO: Call dispatch API
                // const response = await fetch(`/api/fleet/dispatch/${id}`, { method: 'POST' });
                // Remove from horizon (it's now in the fleet)
                set((state)=>({
                        items: state.items.filter((item)=>item.id !== id),
                        isLoading: false
                    }));
            } catch (error) {
                set({
                    error: error instanceof Error ? error.message : 'Failed to dispatch',
                    isLoading: false
                });
            }
        },
        approvePlan: async (id)=>{
            set({
                isLoading: true,
                error: null
            });
            try {
                // TODO: Call approve API
                // Move to READY
                set((state)=>({
                        items: state.items.map((item)=>item.id === id ? {
                                ...item,
                                zone: 'READY',
                                updatedAt: new Date()
                            } : item),
                        isLoading: false
                    }));
            } catch (error) {
                set({
                    error: error instanceof Error ? error.message : 'Failed to approve plan',
                    isLoading: false
                });
            }
        },
        requestReplan: async (id, constraint)=>{
            set({
                isLoading: true,
                error: null
            });
            try {
                // TODO: Call replan API with constraint
                console.log('Replanning with constraint:', constraint);
                set({
                    isLoading: false
                });
            } catch (error) {
                set({
                    error: error instanceof Error ? error.message : 'Failed to replan',
                    isLoading: false
                });
            }
        },
        updateTaskModel: (itemId, taskId, model)=>set((state)=>({
                    items: state.items.map((item)=>{
                        if (item.id !== itemId || !item.plan) return item;
                        const updateTasks = (tasks)=>tasks.map((task)=>task.id === taskId ? {
                                    ...task,
                                    modelOverride: model
                                } : task);
                        return {
                            ...item,
                            plan: {
                                ...item.plan,
                                workstreams: item.plan.workstreams.map((ws)=>({
                                        ...ws,
                                        tasks: updateTasks(ws.tasks)
                                    })),
                                sequentialTasks: updateTasks(item.plan.sequentialTasks)
                            },
                            updatedAt: new Date()
                        };
                    })
                })),
        updateTaskComplexity: (itemId, taskId, complexity)=>set((state)=>({
                    items: state.items.map((item)=>{
                        if (item.id !== itemId || !item.plan) return item;
                        const updateTasks = (tasks)=>tasks.map((task)=>task.id === taskId ? {
                                    ...task,
                                    complexity
                                } : task);
                        return {
                            ...item,
                            plan: {
                                ...item.plan,
                                workstreams: item.plan.workstreams.map((ws)=>({
                                        ...ws,
                                        tasks: updateTasks(ws.tasks)
                                    })),
                                sequentialTasks: updateTasks(item.plan.sequentialTasks)
                            },
                            updatedAt: new Date()
                        };
                    })
                })),
        reorderItems: (zone, fromIndex, toIndex)=>set((state)=>{
                const zoneItems = state.items.filter((item)=>item.zone === zone);
                const [movedItem] = zoneItems.splice(fromIndex, 1);
                zoneItems.splice(toIndex, 0, movedItem);
                // Update priorities
                const updatedZoneItems = zoneItems.map((item, index)=>({
                        ...item,
                        priority: index
                    }));
                // Merge back with other zones
                const otherItems = state.items.filter((item)=>item.zone !== zone);
                return {
                    items: [
                        ...otherItems,
                        ...updatedZoneItems
                    ]
                };
            }),
        setSelectedItem: (id)=>set({
                selectedItemId: id
            }),
        setLoading: (isLoading)=>set({
                isLoading
            }),
        setError: (error)=>set({
                error
            }),
        // Selectors
        getItemsByZone: (zone)=>get().items.filter((item)=>item.zone === zone),
        getItemById: (id)=>get().items.find((item)=>item.id === id)
    }), {
    name: 'horizon-store'
}));
}),
"[project]/src/lib/utils/index.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "calculateSavingsPercent",
    ()=>calculateSavingsPercent,
    "cn",
    ()=>cn,
    "formatCurrency",
    ()=>formatCurrency,
    "formatHours",
    ()=>formatHours,
    "formatMinutes",
    ()=>formatMinutes,
    "formatRelativeTime",
    ()=>formatRelativeTime,
    "formatTime",
    ()=>formatTime,
    "generateId",
    ()=>generateId,
    "getComplexityColor",
    ()=>getComplexityColor,
    "getModelColor",
    ()=>getModelColor,
    "getRunwayStatusColor",
    ()=>getRunwayStatusColor,
    "getRunwayStatusFromHours",
    ()=>getRunwayStatusFromHours,
    "getStatusClass",
    ()=>getStatusClass,
    "getZoneCardClass",
    ()=>getZoneCardClass,
    "stringToColor",
    ()=>stringToColor,
    "truncate",
    ()=>truncate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/clsx/dist/clsx.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-ssr] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}
function formatHours(hours) {
    if (hours >= 1) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
}
function formatMinutes(minutes) {
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${minutes}m`;
}
function getComplexityColor(complexity) {
    const colors = {
        S: 'complexity-s',
        M: 'complexity-m',
        L: 'complexity-l',
        XL: 'complexity-xl'
    };
    return colors[complexity];
}
function getModelColor(model) {
    const colors = {
        haiku: 'badge-haiku',
        sonnet: 'badge-sonnet',
        opus: 'badge-opus'
    };
    return colors[model];
}
function getZoneCardClass(zone) {
    const classes = {
        READY: 'card-ready',
        REFINING: 'card-refining',
        SHAPING: 'card-shaping',
        DIRECTIONAL: 'card-directional'
    };
    return classes[zone];
}
function getStatusClass(status) {
    const classes = {
        active: 'status-active',
        'needs-spec': 'status-needs-spec',
        complete: 'status-complete',
        error: 'status-error'
    };
    return classes[status];
}
function getRunwayStatusColor(status) {
    const colors = {
        healthy: 'text-accent-green',
        amber: 'text-accent-amber',
        critical: 'text-accent-red'
    };
    return colors[status];
}
function getRunwayStatusFromHours(hours) {
    if (hours >= 4) return 'healthy';
    if (hours >= 2) return 'amber';
    return 'critical';
}
function stringToColor(str) {
    let hash = 0;
    for(let i = 0; i < str.length; i++){
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Generate a hue based on the hash
    const hue = Math.abs(hash % 360);
    // Use fixed saturation and lightness for consistency
    return `hsl(${hue}, 70%, 55%)`;
}
function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'yesterday';
    return `${diffDay} days ago`;
}
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}
function generateId() {
    return Math.random().toString(36).substring(2, 15);
}
function calculateSavingsPercent(actual, baseline) {
    if (baseline === 0) return 0;
    return Math.round((baseline - actual) / baseline * 100);
}
}),
"[project]/src/stores/fleetStore.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useFleetSSE",
    ()=>useFleetSSE,
    "useFleetStore",
    ()=>useFleetStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils/index.ts [app-ssr] (ecmascript)");
;
;
;
// ============================================================================
// Default values
// ============================================================================
const defaultScore = {
    total: 0,
    fleetUtilization: 0,
    runwayHealth: 0,
    planAccuracy: 0,
    costEfficiency: 0,
    velocityTrend: 0,
    leaderboardRank: null
};
const useFleetStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["devtools"])((set, get)=>({
        // Initial state
        sessions: [],
        runwayHours: 0,
        runwayStatus: 'healthy',
        conductorScore: defaultScore,
        avgVelocityTasksPerHour: 0,
        planningVelocityPerHour: 0,
        velocityRatio: 0,
        activityEvents: [],
        isConnected: false,
        // Actions
        setSessions: (sessions)=>set({
                sessions
            }),
        updateSession: (sessionId, updates)=>set((state)=>({
                    sessions: state.sessions.map((session)=>session.id === sessionId ? {
                            ...session,
                            ...updates
                        } : session)
                })),
        addSession: (session)=>set((state)=>({
                    sessions: [
                        ...state.sessions,
                        session
                    ]
                })),
        removeSession: (sessionId)=>set((state)=>({
                    sessions: state.sessions.filter((s)=>s.id !== sessionId)
                })),
        setRunway: (hours)=>set({
                runwayHours: hours,
                runwayStatus: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRunwayStatusFromHours"])(hours)
            }),
        setScore: (score)=>set({
                conductorScore: score
            }),
        addActivityEvent: (event)=>set((state)=>({
                    activityEvents: [
                        event,
                        ...state.activityEvents
                    ].slice(0, 100)
                })),
        setActivityEvents: (events)=>set({
                activityEvents: events
            }),
        setConnected: (connected)=>set({
                isConnected: connected
            }),
        // Selectors
        getSessionById: (id)=>get().sessions.find((s)=>s.id === id),
        getActiveSessionsCount: ()=>get().sessions.filter((s)=>s.status === 'active').length,
        getSessionsByRepo: (repo)=>get().sessions.filter((s)=>s.repo === repo),
        getSessionsNeedingSpec: ()=>get().sessions.filter((s)=>s.status === 'active' && s.progressPercent >= 70),
        getIdleImminentSessions: ()=>get().sessions.filter((s)=>s.status === 'active' && s.progressPercent >= 90)
    }), {
    name: 'fleet-store'
}));
function useFleetSSE() {
    const { setConnected, updateSession, addActivityEvent, setRunway, addSession, removeSession } = useFleetStore();
    const connect = ()=>{
        const eventSource = new EventSource('/api/events/stream');
        eventSource.onopen = ()=>{
            setConnected(true);
        };
        eventSource.onerror = ()=>{
            setConnected(false);
            // Reconnect after 5 seconds
            setTimeout(connect, 5000);
        };
        eventSource.onmessage = (event)=>{
            const data = JSON.parse(event.data);
            switch(data.type){
                case 'session_progress':
                    updateSession(data.sessionId, {
                        progressPercent: data.progress
                    });
                    break;
                case 'session_complete':
                    updateSession(data.sessionId, {
                        status: 'complete'
                    });
                    break;
                case 'session_needs_spec':
                    updateSession(data.sessionId, {
                        status: 'needs-spec'
                    });
                    break;
                case 'runway_update':
                    setRunway(data.runwayHours);
                    break;
                case 'activity':
                    addActivityEvent(data.event);
                    break;
                default:
                    console.log('Unknown event type:', data.type);
            }
        };
        return eventSource;
    };
    return {
        connect
    };
}
}),
"[project]/src/stores/uiStore.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useKeyboardShortcuts",
    ()=>useKeyboardShortcuts,
    "useUIStore",
    ()=>useUIStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-ssr] (ecmascript)");
;
;
const useUIStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["devtools"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
        // Layout
        layoutVariant: 'gradient-strip',
        setLayoutVariant: (variant)=>set({
                layoutVariant: variant
            }),
        // Panels
        isAssistPanelOpen: false,
        isFleetPanelOpen: false,
        isConfidencePanelOpen: false,
        confidencePanelItemId: null,
        isDiffViewOpen: false,
        diffViewItemId: null,
        // Panel actions
        toggleAssistPanel: ()=>set((state)=>({
                    isAssistPanelOpen: !state.isAssistPanelOpen
                })),
        toggleFleetPanel: ()=>set((state)=>({
                    isFleetPanelOpen: !state.isFleetPanelOpen
                })),
        openConfidencePanel: (itemId)=>set({
                isConfidencePanelOpen: true,
                confidencePanelItemId: itemId
            }),
        closeConfidencePanel: ()=>set({
                isConfidencePanelOpen: false,
                confidencePanelItemId: null
            }),
        openDiffView: (itemId)=>set({
                isDiffViewOpen: true,
                diffViewItemId: itemId
            }),
        closeDiffView: ()=>set({
                isDiffViewOpen: false,
                diffViewItemId: null
            }),
        // Quick Capture
        quickCaptureValue: '',
        quickCaptureZone: 'DIRECTIONAL',
        setQuickCaptureValue: (value)=>set({
                quickCaptureValue: value
            }),
        setQuickCaptureZone: (zone)=>set({
                quickCaptureZone: zone
            }),
        cycleQuickCaptureZone: ()=>set((state)=>{
                const zones = [
                    'DIRECTIONAL',
                    'SHAPING',
                    'REFINING'
                ];
                const currentIndex = zones.indexOf(state.quickCaptureZone);
                const nextIndex = (currentIndex + 1) % zones.length;
                return {
                    quickCaptureZone: zones[nextIndex]
                };
            }),
        // Command Palette
        isCommandPaletteOpen: false,
        openCommandPalette: ()=>set({
                isCommandPaletteOpen: true
            }),
        closeCommandPalette: ()=>set({
                isCommandPaletteOpen: false
            }),
        toggleCommandPalette: ()=>set((state)=>({
                    isCommandPaletteOpen: !state.isCommandPaletteOpen
                })),
        // Floating HUD
        hudState: 'minimized',
        setHudState: (state)=>set({
                hudState: state
            }),
        // Assist suggestions
        assistSuggestions: [],
        inlineResponse: null,
        inlineResponseChips: [],
        addAssistSuggestion: (suggestion)=>set((state)=>({
                    assistSuggestions: [
                        suggestion,
                        ...state.assistSuggestions
                    ].slice(0, 20)
                })),
        removeAssistSuggestion: (id)=>set((state)=>({
                    assistSuggestions: state.assistSuggestions.filter((s)=>s.id !== id)
                })),
        setInlineResponse: (message, chips = [])=>set({
                inlineResponse: message,
                inlineResponseChips: chips
            }),
        clearInlineResponse: ()=>set({
                inlineResponse: null,
                inlineResponseChips: []
            }),
        // Quiet mode
        isQuietMode: false,
        toggleQuietMode: ()=>set((state)=>({
                    isQuietMode: !state.isQuietMode
                }))
    }), {
    name: 'devpilot-ui',
    partialize: (state)=>({
            layoutVariant: state.layoutVariant,
            isQuietMode: state.isQuietMode
        })
}), {
    name: 'ui-store'
}));
function useKeyboardShortcuts() {
    const { toggleCommandPalette, cycleQuickCaptureZone } = useUIStore();
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
}),
"[project]/src/stores/index.ts [app-ssr] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
// Zustand stores barrel export
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$horizonStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/horizonStore.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$fleetStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/fleetStore.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$uiStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/uiStore.ts [app-ssr] (ecmascript)");
;
;
;
}),
"[project]/src/lib/mockData.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "mockActivityEvents",
    ()=>mockActivityEvents,
    "mockConductorScore",
    ()=>mockConductorScore,
    "mockHorizonItems",
    ()=>mockHorizonItems,
    "mockSessions",
    ()=>mockSessions
]);
// ============================================================================
// Mock Horizon Items
// ============================================================================
const createPlan = (id)=>({
        id: `plan-${id}`,
        version: 1,
        previousPlan: null,
        workstreams: [
            {
                id: `ws-${id}-a`,
                label: 'Workstream A',
                repo: 'ng-pipelines',
                workerCount: 2,
                tasks: [
                    {
                        id: `task-${id}-1`,
                        label: 'Add attribution_engine.py scaffold',
                        model: 'haiku',
                        modelOverride: null,
                        complexity: 'S',
                        estimatedCostUsd: 0.02,
                        filePaths: [
                            'src/attribution_engine.py'
                        ],
                        conflictWarning: null,
                        dependsOn: []
                    },
                    {
                        id: `task-${id}-2`,
                        label: 'Implement reward model logic',
                        model: 'sonnet',
                        modelOverride: null,
                        complexity: 'M',
                        estimatedCostUsd: 0.08,
                        filePaths: [
                            'src/reward_model.py'
                        ],
                        conflictWarning: 'in-flight: ENG-391',
                        dependsOn: [
                            `task-${id}-1`
                        ]
                    },
                    {
                        id: `task-${id}-3`,
                        label: 'Update DAG registry',
                        model: 'haiku',
                        modelOverride: null,
                        complexity: 'S',
                        estimatedCostUsd: 0.02,
                        filePaths: [
                            'config/dag_registry.yaml'
                        ],
                        conflictWarning: null,
                        dependsOn: []
                    }
                ]
            },
            {
                id: `ws-${id}-b`,
                label: 'Workstream B',
                repo: 'ng-core',
                workerCount: 1,
                tasks: [
                    {
                        id: `task-${id}-4`,
                        label: 'BQ schema migration',
                        model: 'sonnet',
                        modelOverride: null,
                        complexity: 'M',
                        estimatedCostUsd: 0.08,
                        filePaths: [
                            'schema/migrations/001_attribution.sql'
                        ],
                        conflictWarning: null,
                        dependsOn: []
                    },
                    {
                        id: `task-${id}-5`,
                        label: 'Create dimension tables',
                        model: 'haiku',
                        modelOverride: null,
                        complexity: 'S',
                        estimatedCostUsd: 0.02,
                        filePaths: [
                            'schema/dimensions.sql'
                        ],
                        conflictWarning: null,
                        dependsOn: [
                            `task-${id}-4`
                        ]
                    }
                ]
            }
        ],
        sequentialTasks: [
            {
                id: `task-${id}-6`,
                label: 'Integration tests',
                model: 'sonnet',
                modelOverride: null,
                complexity: 'M',
                estimatedCostUsd: 0.08,
                filePaths: [
                    'tests/integration/test_attribution.py'
                ],
                conflictWarning: null,
                dependsOn: []
            }
        ],
        estimatedCostUsd: 0.30,
        baselineCostUsd: 0.48,
        acceptanceCriteria: [
            'Attribution engine processes events within 100ms p99',
            'All dimension tables have appropriate indexes',
            'Integration tests pass with 95%+ coverage'
        ],
        filesTouched: [
            {
                path: 'src/attribution_engine.py',
                status: 'available'
            },
            {
                path: 'src/reward_model.py',
                status: 'in-flight',
                inFlightVia: 'ENG-391'
            },
            {
                path: 'config/dag_registry.yaml',
                status: 'available'
            },
            {
                path: 'schema/migrations/001_attribution.sql',
                status: 'available'
            },
            {
                path: 'schema/dimensions.sql',
                status: 'recently-modified'
            },
            {
                path: 'tests/integration/test_attribution.py',
                status: 'available'
            }
        ],
        fleetContextSnapshot: {
            availableWorkers: {
                'ng-pipelines': 2,
                'ng-core': 1
            },
            avoidedFiles: [
                'src/persona_assignment.py'
            ],
            deferredReason: null
        },
        memorySessionsUsed: [
            {
                date: new Date('2026-03-04'),
                ticketId: 'ENG-381',
                summary: 'Similar attribution work',
                constraintApplied: 'Do not modify lock_manager.py in same session'
            }
        ],
        confidenceSignals: {
            parallelization: 'HIGH',
            conflictRisk: 'MEDIUM',
            complexityCalibration: 'HIGH',
            costEstimateAccuracy: 'HIGH'
        },
        generatedAt: new Date()
    });
const mockHorizonItems = [
    // READY
    {
        id: 'item-1',
        title: 'Multi-touch Attribution Modeling',
        zone: 'READY',
        repo: 'ng-pipelines',
        complexity: 'M',
        priority: 0,
        plan: createPlan('1'),
        linearTicketId: 'ENG-394',
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: []
    },
    {
        id: 'item-2',
        title: 'User Segmentation Pipeline v2',
        zone: 'READY',
        repo: 'ng-core',
        complexity: 'L',
        priority: 1,
        plan: createPlan('2'),
        linearTicketId: 'ENG-396',
        createdAt: new Date('2026-03-08'),
        updatedAt: new Date(),
        conflictingFiles: []
    },
    // REFINING
    {
        id: 'item-3',
        title: 'Persona Lock Threshold Optimization',
        zone: 'REFINING',
        repo: 'ng-pipelines',
        complexity: 'M',
        priority: 0,
        plan: createPlan('3'),
        linearTicketId: 'ENG-395',
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: [
            {
                path: 'src/persona_assignment.py',
                activeSessionId: 'session-1',
                linearTicketId: 'ENG-391',
                estimatedMinutesRemaining: 45
            }
        ]
    },
    // SHAPING
    {
        id: 'item-4',
        title: 'Reward Model v2 Refinement',
        zone: 'SHAPING',
        repo: 'ng-pipelines',
        complexity: null,
        priority: 0,
        plan: null,
        linearTicketId: null,
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: [
            {
                path: 'src/reward_model.py',
                activeSessionId: 'session-1',
                linearTicketId: 'ENG-391',
                estimatedMinutesRemaining: 45
            }
        ]
    },
    {
        id: 'item-5',
        title: 'DAG Execution Parallelization',
        zone: 'SHAPING',
        repo: 'ng-core',
        complexity: null,
        priority: 1,
        plan: null,
        linearTicketId: null,
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: []
    },
    // DIRECTIONAL
    {
        id: 'item-6',
        title: 'Improve persona lock threshold logic',
        zone: 'DIRECTIONAL',
        repo: 'ng-pipelines',
        complexity: null,
        priority: 0,
        plan: null,
        linearTicketId: null,
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: []
    },
    {
        id: 'item-7',
        title: 'Add telemetry to attribution service',
        zone: 'DIRECTIONAL',
        repo: 'ng-core',
        complexity: null,
        priority: 1,
        plan: null,
        linearTicketId: null,
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: []
    },
    {
        id: 'item-8',
        title: 'Investigate BQ query performance',
        zone: 'DIRECTIONAL',
        repo: 'ng-pipelines',
        complexity: null,
        priority: 2,
        plan: null,
        linearTicketId: null,
        createdAt: new Date('2026-03-09'),
        updatedAt: new Date(),
        conflictingFiles: []
    }
];
const mockSessions = [
    {
        id: 'session-1',
        repo: 'ng-pipelines',
        linearTicketId: 'ENG-391',
        ticketTitle: 'Reward Model v1 Implementation',
        currentWorkstream: 'Workstream A: refactoring r_gcn_model.py',
        progressPercent: 78,
        elapsedMinutes: 42,
        estimatedRemainingMinutes: 12,
        status: 'active',
        inFlightFiles: [
            'src/reward_model.py',
            'src/persona_assignment.py'
        ],
        completedTasks: [
            {
                label: 'Add base model class',
                completedAt: new Date(Date.now() - 15 * 60000)
            },
            {
                label: 'Implement feature extraction',
                completedAt: new Date(Date.now() - 8 * 60000)
            },
            {
                label: 'Add unit tests',
                completedAt: new Date(Date.now() - 3 * 60000)
            }
        ]
    },
    {
        id: 'session-2',
        repo: 'ng-core',
        linearTicketId: 'ENG-389',
        ticketTitle: 'Schema Migration Framework',
        currentWorkstream: 'Workstream B: updating migration tools',
        progressPercent: 42,
        elapsedMinutes: 28,
        estimatedRemainingMinutes: 40,
        status: 'active',
        inFlightFiles: [
            'schema/migrations/framework.py'
        ],
        completedTasks: [
            {
                label: 'Create migration base',
                completedAt: new Date(Date.now() - 20 * 60000)
            }
        ]
    },
    {
        id: 'session-3',
        repo: 'ng-pipelines',
        linearTicketId: 'ENG-393',
        ticketTitle: 'Event Processing Optimization',
        currentWorkstream: 'Workstream A: profiling hot paths',
        progressPercent: 91,
        elapsedMinutes: 85,
        estimatedRemainingMinutes: 8,
        status: 'active',
        inFlightFiles: [
            'src/event_processor.py'
        ],
        completedTasks: [
            {
                label: 'Profile baseline',
                completedAt: new Date(Date.now() - 60 * 60000)
            },
            {
                label: 'Implement batching',
                completedAt: new Date(Date.now() - 40 * 60000)
            },
            {
                label: 'Add caching layer',
                completedAt: new Date(Date.now() - 25 * 60000)
            },
            {
                label: 'Update benchmarks',
                completedAt: new Date(Date.now() - 10 * 60000)
            }
        ]
    }
];
const mockConductorScore = {
    total: 847,
    fleetUtilization: 220,
    runwayHealth: 185,
    planAccuracy: 162,
    costEfficiency: 180,
    velocityTrend: 100,
    leaderboardRank: 8
};
const mockActivityEvents = [
    {
        id: 'event-1',
        type: 'session_complete',
        message: 'ENG-391 · Workstream A complete — 3 tasks done',
        repo: 'ng-pipelines',
        ticketId: 'ENG-391',
        createdAt: new Date(Date.now() - 10 * 60000)
    },
    {
        id: 'event-2',
        type: 'item_dispatched',
        message: 'ENG-389 dispatched — Ruflo hive spawned',
        repo: 'ng-core',
        ticketId: 'ENG-389',
        createdAt: new Date(Date.now() - 13 * 60000)
    },
    {
        id: 'event-3',
        type: 'plan_ready',
        message: 'Plan generated: ENG-394 · 2 workstreams · ~$0.26',
        ticketId: 'ENG-394',
        createdAt: new Date(Date.now() - 15 * 60000)
    },
    {
        id: 'event-4',
        type: 'session_complete',
        message: 'ENG-388 complete ✓',
        repo: 'arthaus',
        ticketId: 'ENG-388',
        createdAt: new Date(Date.now() - 23 * 60000)
    },
    {
        id: 'event-5',
        type: 'runway_update',
        message: 'Runway update: 4.2h → 3.8h',
        createdAt: new Date(Date.now() - 25 * 60000)
    },
    {
        id: 'event-6',
        type: 'session_needs_spec',
        message: 'ENG-393 at 90% — needs next spec',
        repo: 'ng-pipelines',
        ticketId: 'ENG-393',
        createdAt: new Date(Date.now() - 30 * 60000)
    },
    {
        id: 'event-7',
        type: 'plan_approved',
        message: 'Plan approved: ENG-393 · Conductor approved',
        ticketId: 'ENG-393',
        createdAt: new Date(Date.now() - 45 * 60000)
    },
    {
        id: 'event-8',
        type: 'score_update',
        message: 'Conductor Score: 842 → 847 (+5)',
        createdAt: new Date(Date.now() - 60 * 60000)
    }
];
}),
"[project]/src/components/providers/DataProvider.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DataProvider",
    ()=>DataProvider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/stores/index.ts [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$horizonStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/horizonStore.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$fleetStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/fleetStore.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$mockData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/mockData.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
function DataProvider({ children }) {
    const setItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$horizonStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useHorizonStore"])((state)=>state.setItems);
    const setSessions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$fleetStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useFleetStore"])((state)=>state.setSessions);
    const setScore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$fleetStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useFleetStore"])((state)=>state.setScore);
    const setRunway = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$fleetStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useFleetStore"])((state)=>state.setRunway);
    const setActivityEvents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$fleetStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useFleetStore"])((state)=>state.setActivityEvents);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        // Initialize stores with mock data
        setItems(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$mockData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mockHorizonItems"]);
        setSessions(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$mockData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mockSessions"]);
        setScore(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$mockData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mockConductorScore"]);
        setRunway(4.2); // 4.2 hours runway
        setActivityEvents(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$mockData$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mockActivityEvents"]);
    }, [
        setItems,
        setSessions,
        setScore,
        setRunway,
        setActivityEvents
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: children
    }, void 0, false);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__a02a24c0._.js.map