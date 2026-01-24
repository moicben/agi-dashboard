(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[turbopack]/browser/dev/hmr-client/hmr-client.ts [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/// <reference path="../../../shared/runtime-types.d.ts" />
/// <reference path="../../runtime/base/dev-globals.d.ts" />
/// <reference path="../../runtime/base/dev-protocol.d.ts" />
/// <reference path="../../runtime/base/dev-extensions.ts" />
__turbopack_context__.s([
    "connect",
    ()=>connect,
    "setHooks",
    ()=>setHooks,
    "subscribeToUpdate",
    ()=>subscribeToUpdate
]);
function connect({ addMessageListener, sendMessage, onUpdateError = console.error }) {
    addMessageListener((msg)=>{
        switch(msg.type){
            case 'turbopack-connected':
                handleSocketConnected(sendMessage);
                break;
            default:
                try {
                    if (Array.isArray(msg.data)) {
                        for(let i = 0; i < msg.data.length; i++){
                            handleSocketMessage(msg.data[i]);
                        }
                    } else {
                        handleSocketMessage(msg.data);
                    }
                    applyAggregatedUpdates();
                } catch (e) {
                    console.warn('[Fast Refresh] performing full reload\n\n' + "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" + 'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' + 'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' + 'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' + 'Fast Refresh requires at least one parent function component in your React tree.');
                    onUpdateError(e);
                    location.reload();
                }
                break;
        }
    });
    const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS;
    if (queued != null && !Array.isArray(queued)) {
        throw new Error('A separate HMR handler was already registered');
    }
    globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = {
        push: ([chunkPath, callback])=>{
            subscribeToChunkUpdate(chunkPath, sendMessage, callback);
        }
    };
    if (Array.isArray(queued)) {
        for (const [chunkPath, callback] of queued){
            subscribeToChunkUpdate(chunkPath, sendMessage, callback);
        }
    }
}
const updateCallbackSets = new Map();
function sendJSON(sendMessage, message) {
    sendMessage(JSON.stringify(message));
}
function resourceKey(resource) {
    return JSON.stringify({
        path: resource.path,
        headers: resource.headers || null
    });
}
function subscribeToUpdates(sendMessage, resource) {
    sendJSON(sendMessage, {
        type: 'turbopack-subscribe',
        ...resource
    });
    return ()=>{
        sendJSON(sendMessage, {
            type: 'turbopack-unsubscribe',
            ...resource
        });
    };
}
function handleSocketConnected(sendMessage) {
    for (const key of updateCallbackSets.keys()){
        subscribeToUpdates(sendMessage, JSON.parse(key));
    }
}
// we aggregate all pending updates until the issues are resolved
const chunkListsWithPendingUpdates = new Map();
function aggregateUpdates(msg) {
    const key = resourceKey(msg.resource);
    let aggregated = chunkListsWithPendingUpdates.get(key);
    if (aggregated) {
        aggregated.instruction = mergeChunkListUpdates(aggregated.instruction, msg.instruction);
    } else {
        chunkListsWithPendingUpdates.set(key, msg);
    }
}
function applyAggregatedUpdates() {
    if (chunkListsWithPendingUpdates.size === 0) return;
    hooks.beforeRefresh();
    for (const msg of chunkListsWithPendingUpdates.values()){
        triggerUpdate(msg);
    }
    chunkListsWithPendingUpdates.clear();
    finalizeUpdate();
}
function mergeChunkListUpdates(updateA, updateB) {
    let chunks;
    if (updateA.chunks != null) {
        if (updateB.chunks == null) {
            chunks = updateA.chunks;
        } else {
            chunks = mergeChunkListChunks(updateA.chunks, updateB.chunks);
        }
    } else if (updateB.chunks != null) {
        chunks = updateB.chunks;
    }
    let merged;
    if (updateA.merged != null) {
        if (updateB.merged == null) {
            merged = updateA.merged;
        } else {
            // Since `merged` is an array of updates, we need to merge them all into
            // one, consistent update.
            // Since there can only be `EcmascriptMergeUpdates` in the array, there is
            // no need to key on the `type` field.
            let update = updateA.merged[0];
            for(let i = 1; i < updateA.merged.length; i++){
                update = mergeChunkListEcmascriptMergedUpdates(update, updateA.merged[i]);
            }
            for(let i = 0; i < updateB.merged.length; i++){
                update = mergeChunkListEcmascriptMergedUpdates(update, updateB.merged[i]);
            }
            merged = [
                update
            ];
        }
    } else if (updateB.merged != null) {
        merged = updateB.merged;
    }
    return {
        type: 'ChunkListUpdate',
        chunks,
        merged
    };
}
function mergeChunkListChunks(chunksA, chunksB) {
    const chunks = {};
    for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)){
        const chunkUpdateB = chunksB[chunkPath];
        if (chunkUpdateB != null) {
            const mergedUpdate = mergeChunkUpdates(chunkUpdateA, chunkUpdateB);
            if (mergedUpdate != null) {
                chunks[chunkPath] = mergedUpdate;
            }
        } else {
            chunks[chunkPath] = chunkUpdateA;
        }
    }
    for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)){
        if (chunks[chunkPath] == null) {
            chunks[chunkPath] = chunkUpdateB;
        }
    }
    return chunks;
}
function mergeChunkUpdates(updateA, updateB) {
    if (updateA.type === 'added' && updateB.type === 'deleted' || updateA.type === 'deleted' && updateB.type === 'added') {
        return undefined;
    }
    if (updateA.type === 'partial') {
        invariant(updateA.instruction, 'Partial updates are unsupported');
    }
    if (updateB.type === 'partial') {
        invariant(updateB.instruction, 'Partial updates are unsupported');
    }
    return undefined;
}
function mergeChunkListEcmascriptMergedUpdates(mergedA, mergedB) {
    const entries = mergeEcmascriptChunkEntries(mergedA.entries, mergedB.entries);
    const chunks = mergeEcmascriptChunksUpdates(mergedA.chunks, mergedB.chunks);
    return {
        type: 'EcmascriptMergedUpdate',
        entries,
        chunks
    };
}
function mergeEcmascriptChunkEntries(entriesA, entriesB) {
    return {
        ...entriesA,
        ...entriesB
    };
}
function mergeEcmascriptChunksUpdates(chunksA, chunksB) {
    if (chunksA == null) {
        return chunksB;
    }
    if (chunksB == null) {
        return chunksA;
    }
    const chunks = {};
    for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)){
        const chunkUpdateB = chunksB[chunkPath];
        if (chunkUpdateB != null) {
            const mergedUpdate = mergeEcmascriptChunkUpdates(chunkUpdateA, chunkUpdateB);
            if (mergedUpdate != null) {
                chunks[chunkPath] = mergedUpdate;
            }
        } else {
            chunks[chunkPath] = chunkUpdateA;
        }
    }
    for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)){
        if (chunks[chunkPath] == null) {
            chunks[chunkPath] = chunkUpdateB;
        }
    }
    if (Object.keys(chunks).length === 0) {
        return undefined;
    }
    return chunks;
}
function mergeEcmascriptChunkUpdates(updateA, updateB) {
    if (updateA.type === 'added' && updateB.type === 'deleted') {
        // These two completely cancel each other out.
        return undefined;
    }
    if (updateA.type === 'deleted' && updateB.type === 'added') {
        const added = [];
        const deleted = [];
        const deletedModules = new Set(updateA.modules ?? []);
        const addedModules = new Set(updateB.modules ?? []);
        for (const moduleId of addedModules){
            if (!deletedModules.has(moduleId)) {
                added.push(moduleId);
            }
        }
        for (const moduleId of deletedModules){
            if (!addedModules.has(moduleId)) {
                deleted.push(moduleId);
            }
        }
        if (added.length === 0 && deleted.length === 0) {
            return undefined;
        }
        return {
            type: 'partial',
            added,
            deleted
        };
    }
    if (updateA.type === 'partial' && updateB.type === 'partial') {
        const added = new Set([
            ...updateA.added ?? [],
            ...updateB.added ?? []
        ]);
        const deleted = new Set([
            ...updateA.deleted ?? [],
            ...updateB.deleted ?? []
        ]);
        if (updateB.added != null) {
            for (const moduleId of updateB.added){
                deleted.delete(moduleId);
            }
        }
        if (updateB.deleted != null) {
            for (const moduleId of updateB.deleted){
                added.delete(moduleId);
            }
        }
        return {
            type: 'partial',
            added: [
                ...added
            ],
            deleted: [
                ...deleted
            ]
        };
    }
    if (updateA.type === 'added' && updateB.type === 'partial') {
        const modules = new Set([
            ...updateA.modules ?? [],
            ...updateB.added ?? []
        ]);
        for (const moduleId of updateB.deleted ?? []){
            modules.delete(moduleId);
        }
        return {
            type: 'added',
            modules: [
                ...modules
            ]
        };
    }
    if (updateA.type === 'partial' && updateB.type === 'deleted') {
        // We could eagerly return `updateB` here, but this would potentially be
        // incorrect if `updateA` has added modules.
        const modules = new Set(updateB.modules ?? []);
        if (updateA.added != null) {
            for (const moduleId of updateA.added){
                modules.delete(moduleId);
            }
        }
        return {
            type: 'deleted',
            modules: [
                ...modules
            ]
        };
    }
    // Any other update combination is invalid.
    return undefined;
}
function invariant(_, message) {
    throw new Error(`Invariant: ${message}`);
}
const CRITICAL = [
    'bug',
    'error',
    'fatal'
];
function compareByList(list, a, b) {
    const aI = list.indexOf(a) + 1 || list.length;
    const bI = list.indexOf(b) + 1 || list.length;
    return aI - bI;
}
const chunksWithIssues = new Map();
function emitIssues() {
    const issues = [];
    const deduplicationSet = new Set();
    for (const [_, chunkIssues] of chunksWithIssues){
        for (const chunkIssue of chunkIssues){
            if (deduplicationSet.has(chunkIssue.formatted)) continue;
            issues.push(chunkIssue);
            deduplicationSet.add(chunkIssue.formatted);
        }
    }
    sortIssues(issues);
    hooks.issues(issues);
}
function handleIssues(msg) {
    const key = resourceKey(msg.resource);
    let hasCriticalIssues = false;
    for (const issue of msg.issues){
        if (CRITICAL.includes(issue.severity)) {
            hasCriticalIssues = true;
        }
    }
    if (msg.issues.length > 0) {
        chunksWithIssues.set(key, msg.issues);
    } else if (chunksWithIssues.has(key)) {
        chunksWithIssues.delete(key);
    }
    emitIssues();
    return hasCriticalIssues;
}
const SEVERITY_ORDER = [
    'bug',
    'fatal',
    'error',
    'warning',
    'info',
    'log'
];
const CATEGORY_ORDER = [
    'parse',
    'resolve',
    'code generation',
    'rendering',
    'typescript',
    'other'
];
function sortIssues(issues) {
    issues.sort((a, b)=>{
        const first = compareByList(SEVERITY_ORDER, a.severity, b.severity);
        if (first !== 0) return first;
        return compareByList(CATEGORY_ORDER, a.category, b.category);
    });
}
const hooks = {
    beforeRefresh: ()=>{},
    refresh: ()=>{},
    buildOk: ()=>{},
    issues: (_issues)=>{}
};
function setHooks(newHooks) {
    Object.assign(hooks, newHooks);
}
function handleSocketMessage(msg) {
    sortIssues(msg.issues);
    handleIssues(msg);
    switch(msg.type){
        case 'issues':
            break;
        case 'partial':
            // aggregate updates
            aggregateUpdates(msg);
            break;
        default:
            // run single update
            const runHooks = chunkListsWithPendingUpdates.size === 0;
            if (runHooks) hooks.beforeRefresh();
            triggerUpdate(msg);
            if (runHooks) finalizeUpdate();
            break;
    }
}
function finalizeUpdate() {
    hooks.refresh();
    hooks.buildOk();
    // This is used by the Next.js integration test suite to notify it when HMR
    // updates have been completed.
    // TODO: Only run this in test environments (gate by `process.env.__NEXT_TEST_MODE`)
    if (globalThis.__NEXT_HMR_CB) {
        globalThis.__NEXT_HMR_CB();
        globalThis.__NEXT_HMR_CB = null;
    }
}
function subscribeToChunkUpdate(chunkListPath, sendMessage, callback) {
    return subscribeToUpdate({
        path: chunkListPath
    }, sendMessage, callback);
}
function subscribeToUpdate(resource, sendMessage, callback) {
    const key = resourceKey(resource);
    let callbackSet;
    const existingCallbackSet = updateCallbackSets.get(key);
    if (!existingCallbackSet) {
        callbackSet = {
            callbacks: new Set([
                callback
            ]),
            unsubscribe: subscribeToUpdates(sendMessage, resource)
        };
        updateCallbackSets.set(key, callbackSet);
    } else {
        existingCallbackSet.callbacks.add(callback);
        callbackSet = existingCallbackSet;
    }
    return ()=>{
        callbackSet.callbacks.delete(callback);
        if (callbackSet.callbacks.size === 0) {
            callbackSet.unsubscribe();
            updateCallbackSets.delete(key);
        }
    };
}
function triggerUpdate(msg) {
    const key = resourceKey(msg.resource);
    const callbackSet = updateCallbackSets.get(key);
    if (!callbackSet) {
        return;
    }
    for (const callback of callbackSet.callbacks){
        callback(msg);
    }
    if (msg.type === 'notFound') {
        // This indicates that the resource which we subscribed to either does not exist or
        // has been deleted. In either case, we should clear all update callbacks, so if a
        // new subscription is created for the same resource, it will send a new "subscribe"
        // message to the server.
        // No need to send an "unsubscribe" message to the server, it will have already
        // dropped the update stream before sending the "notFound" message.
        updateCallbackSets.delete(key);
    }
}
}),
"[project]/components/Sidebar.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Sidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
;
function Sidebar({ views, activeViewId, collapsed, onToggle, onSelect }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: `sidebar${collapsed ? ' collapsed' : ''}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "sidebar-header",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "sidebar-title",
                        children: collapsed ? 'VM' : 'VNC Monitor'
                    }, void 0, false, {
                        fileName: "[project]/components/Sidebar.jsx",
                        lineNumber: 5,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "sidebar-toggle",
                        onClick: onToggle,
                        children: collapsed ? '→' : '←'
                    }, void 0, false, {
                        fileName: "[project]/components/Sidebar.jsx",
                        lineNumber: 6,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/Sidebar.jsx",
                lineNumber: 4,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "sidebar-nav",
                children: views.map((view)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: `sidebar-item${activeViewId === view.id ? ' active' : ''}`,
                        onClick: ()=>onSelect(view.id),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "sidebar-item-label",
                            children: view.label
                        }, void 0, false, {
                            fileName: "[project]/components/Sidebar.jsx",
                            lineNumber: 18,
                            columnNumber: 25
                        }, this)
                    }, view.id, false, {
                        fileName: "[project]/components/Sidebar.jsx",
                        lineNumber: 12,
                        columnNumber: 21
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/Sidebar.jsx",
                lineNumber: 10,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/Sidebar.jsx",
        lineNumber: 3,
        columnNumber: 9
    }, this);
}
_c = Sidebar;
var _c;
__turbopack_context__.k.register(_c, "Sidebar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/Layout.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Layout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Sidebar$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/Sidebar.jsx [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
function Layout({ views, activeView, onSelectView, children }) {
    _s();
    const [sidebarCollapsed, setSidebarCollapsed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(false);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "dashboard",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Sidebar$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
                views: views,
                activeViewId: activeView.id,
                collapsed: sidebarCollapsed,
                onToggle: ()=>setSidebarCollapsed((prev)=>!prev),
                onSelect: onSelectView
            }, void 0, false, {
                fileName: "[project]/components/Layout.jsx",
                lineNumber: 9,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "dashboard-main",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "dashboard-content",
                    children: children
                }, void 0, false, {
                    fileName: "[project]/components/Layout.jsx",
                    lineNumber: 17,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/Layout.jsx",
                lineNumber: 16,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/Layout.jsx",
        lineNumber: 8,
        columnNumber: 9
    }, this);
}
_s(Layout, "RBWGVlQtqnwMoScoawcFwyZtGjQ=");
_c = Layout;
var _c;
__turbopack_context__.k.register(_c, "Layout");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/ViewShell.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ViewShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
;
function ViewShell({ title, meta, actions, filters, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "view-shell",
        children: [
            filters ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "view-section",
                children: filters
            }, void 0, false, {
                fileName: "[project]/components/ViewShell.jsx",
                lineNumber: 4,
                columnNumber: 24
            }, this) : null,
            actions ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "view-section",
                children: actions
            }, void 0, false, {
                fileName: "[project]/components/ViewShell.jsx",
                lineNumber: 5,
                columnNumber: 24
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "view-content",
                children: children
            }, void 0, false, {
                fileName: "[project]/components/ViewShell.jsx",
                lineNumber: 6,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/ViewShell.jsx",
        lineNumber: 3,
        columnNumber: 9
    }, this);
}
_c = ViewShell;
var _c;
__turbopack_context__.k.register(_c, "ViewShell");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/api.js [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CONFIG_API_URL",
    ()=>CONFIG_API_URL,
    "CONTAINERS_API_URL",
    ()=>CONTAINERS_API_URL,
    "MEETINGS_API_URL",
    ()=>MEETINGS_API_URL,
    "fetchConfig",
    ()=>fetchConfig,
    "fetchContainers",
    ()=>fetchContainers,
    "fetchMeetings",
    ()=>fetchMeetings
]);
const CONFIG_API_URL = '/api/config';
const CONTAINERS_API_URL = '/api/instances';
const MEETINGS_API_URL = '/api/meetings';
async function parseJsonResponse(response) {
    if (!response.ok) {
        const errorData = await response.json().catch(()=>({}));
        const errorMessage = errorData.message || errorData.error || `Erreur HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
    }
    return response.json();
}
async function fetchConfig() {
    const response = await fetch(CONFIG_API_URL);
    const config = await parseJsonResponse(response);
    if (!config.incusServer || !config.ipPrefix) {
        throw new Error('Configuration incomplète reçue du serveur');
    }
    return config;
}
async function fetchContainers() {
    const response = await fetch(CONTAINERS_API_URL);
    const data = await parseJsonResponse(response);
    return data.containers || [];
}
async function fetchMeetings(startDate, endDate) {
    const response = await fetch(`${MEETINGS_API_URL}?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
    const data = await parseJsonResponse(response);
    return data.meetings || [];
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/utils.js [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "REFRESH_INTERVAL",
    ()=>REFRESH_INTERVAL,
    "buildVncUrl",
    ()=>buildVncUrl,
    "extractHostname",
    ()=>extractHostname,
    "getCurrentMakassarTime",
    ()=>getCurrentMakassarTime,
    "getMakassarTime",
    ()=>getMakassarTime,
    "isSameDay",
    ()=>isSameDay,
    "normalizeBaseUrl",
    ()=>normalizeBaseUrl
]);
const REFRESH_INTERVAL = 30000;
function extractHostname(url) {
    try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        return urlObj.hostname;
    } catch  {
        return url.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
    }
}
function normalizeBaseUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://${url}`;
}
function buildVncUrl(incusServer, ip) {
    const baseUrl = normalizeBaseUrl(incusServer);
    const host = extractHostname(baseUrl);
    if (!baseUrl || !ip) return '';
    return `${baseUrl}/vnc.html#host=${host}&port=443&autoconnect=true&scaling=local&path=websockify?token=${ip}`;
}
function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function getMakassarTime(date) {
    const utcTime = date.getTime() - date.getTimezoneOffset() * 60000;
    const makassarOffsetMs = 8 * 60 * 60 * 1000;
    return new Date(utcTime + makassarOffsetMs);
}
function getCurrentMakassarTime() {
    return getMakassarTime(new Date());
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/views/ContainersView.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ContainersView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ViewShell$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/ViewShell.jsx [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/api.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/utils.js [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
;
const DEV_CONTAINERS = new Set([
    'c-template',
    'b-template',
    'wireguard',
    'android',
    'c-test'
]);
function getContainersToDisplay(containers, mode) {
    if (mode === 'dev') {
        return containers.filter((container)=>DEV_CONTAINERS.has(container.name));
    }
    return containers.filter((container)=>!DEV_CONTAINERS.has(container.name) && container.status === 'Running');
}
function getContainersToPreload(containers) {
    return containers.filter((container)=>DEV_CONTAINERS.has(container.name) || !DEV_CONTAINERS.has(container.name) && container.status === 'Running');
}
function ContainersView() {
    _s();
    const [config, setConfig] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [containers, setContainers] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [mode, setMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])('all');
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [timeUntilRefresh, setTimeUntilRefresh] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$js__$5b$client$5d$__$28$ecmascript$29$__["REFRESH_INTERVAL"] / 1000);
    const refreshTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const refreshIntervalRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const modeSwitcherRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const containersToDisplay = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ContainersView.useMemo[containersToDisplay]": ()=>getContainersToDisplay(containers, mode)
    }["ContainersView.useMemo[containersToDisplay]"], [
        containers,
        mode
    ]);
    const containersToPreload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ContainersView.useMemo[containersToPreload]": ()=>getContainersToPreload(containers)
    }["ContainersView.useMemo[containersToPreload]"], [
        containers
    ]);
    const loadInitialData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ContainersView.useCallback[loadInitialData]": async ()=>{
            setLoading(true);
            setError(null);
            try {
                const loadedConfig = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$js__$5b$client$5d$__$28$ecmascript$29$__["fetchConfig"])();
                setConfig(loadedConfig);
                const loadedContainers = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$js__$5b$client$5d$__$28$ecmascript$29$__["fetchContainers"])();
                setContainers(loadedContainers);
            } catch (err) {
                setError(err.message);
            } finally{
                setLoading(false);
            }
        }
    }["ContainersView.useCallback[loadInitialData]"], []);
    const refreshContainers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ContainersView.useCallback[refreshContainers]": async ()=>{
            try {
                const newContainers = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$js__$5b$client$5d$__$28$ecmascript$29$__["fetchContainers"])();
                setContainers(newContainers);
                setTimeUntilRefresh(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$js__$5b$client$5d$__$28$ecmascript$29$__["REFRESH_INTERVAL"] / 1000);
            } catch (err) {
                console.error('Erreur lors du rafraîchissement automatique:', err);
            }
        }
    }["ContainersView.useCallback[refreshContainers]"], []);
    const stopTimers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ContainersView.useCallback[stopTimers]": ()=>{
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        }
    }["ContainersView.useCallback[stopTimers]"], []);
    const startTimers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ContainersView.useCallback[startTimers]": ()=>{
            stopTimers();
            setTimeUntilRefresh(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$js__$5b$client$5d$__$28$ecmascript$29$__["REFRESH_INTERVAL"] / 1000);
            refreshTimerRef.current = setInterval({
                "ContainersView.useCallback[startTimers]": ()=>{
                    setTimeUntilRefresh({
                        "ContainersView.useCallback[startTimers]": (prev)=>prev > 0 ? prev - 1 : 0
                    }["ContainersView.useCallback[startTimers]"]);
                }
            }["ContainersView.useCallback[startTimers]"], 1000);
            refreshIntervalRef.current = setInterval({
                "ContainersView.useCallback[startTimers]": ()=>{
                    refreshContainers();
                }
            }["ContainersView.useCallback[startTimers]"], __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$js__$5b$client$5d$__$28$ecmascript$29$__["REFRESH_INTERVAL"]);
        }
    }["ContainersView.useCallback[startTimers]"], [
        refreshContainers,
        stopTimers
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ContainersView.useEffect": ()=>{
            loadInitialData();
        }
    }["ContainersView.useEffect"], [
        loadInitialData
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ContainersView.useEffect": ()=>{
            if (!config) return;
            startTimers();
            const handleVisibilityChange = {
                "ContainersView.useEffect.handleVisibilityChange": ()=>{
                    if (document.hidden) {
                        stopTimers();
                    } else {
                        startTimers();
                    }
                }
            }["ContainersView.useEffect.handleVisibilityChange"];
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return ({
                "ContainersView.useEffect": ()=>{
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    stopTimers();
                }
            })["ContainersView.useEffect"];
        }
    }["ContainersView.useEffect"], [
        config,
        startTimers,
        stopTimers
    ]);
    const headerMeta = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                children: [
                    containersToDisplay.length,
                    "/",
                    containers.length,
                    " containers"
                ]
            }, void 0, true, {
                fileName: "[project]/components/views/ContainersView.jsx",
                lineNumber: 120,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                children: [
                    "Refresh dans ",
                    timeUntilRefresh,
                    "s"
                ]
            }, void 0, true, {
                fileName: "[project]/components/views/ContainersView.jsx",
                lineNumber: 121,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
    const modeSwitcher = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mode-switcher",
        ref: modeSwitcherRef,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
            type: "button",
            className: "mode-switcher-btn",
            "data-mode": mode,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "mode-switcher-indicator"
                }, void 0, false, {
                    fileName: "[project]/components/views/ContainersView.jsx",
                    lineNumber: 128,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: `mode-option${mode === 'all' ? ' active' : ''}`,
                    "data-mode": "all",
                    onClick: ()=>setMode('all'),
                    children: "All"
                }, void 0, false, {
                    fileName: "[project]/components/views/ContainersView.jsx",
                    lineNumber: 129,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: `mode-option${mode === 'dev' ? ' active' : ''}`,
                    "data-mode": "dev",
                    onClick: ()=>setMode('dev'),
                    children: "Dev"
                }, void 0, false, {
                    fileName: "[project]/components/views/ContainersView.jsx",
                    lineNumber: 136,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/views/ContainersView.jsx",
            lineNumber: 127,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/views/ContainersView.jsx",
        lineNumber: 126,
        columnNumber: 9
    }, this);
    const updateModeIndicator = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ContainersView.useCallback[updateModeIndicator]": ()=>{
            const switcher = modeSwitcherRef.current;
            if (!switcher) return;
            const options = switcher.querySelectorAll('.mode-option');
            const indicator = switcher.querySelector('.mode-switcher-indicator');
            if (!indicator || options.length === 0) return;
            options.forEach({
                "ContainersView.useCallback[updateModeIndicator]": (option, index)=>{
                    if (option.dataset.mode === mode) {
                        let left = 0;
                        for(let i = 0; i < index; i += 1){
                            left += options[i].offsetWidth;
                        }
                        indicator.style.width = `${option.offsetWidth}px`;
                        indicator.style.transform = `translateX(${left}px)`;
                    }
                }
            }["ContainersView.useCallback[updateModeIndicator]"]);
        }
    }["ContainersView.useCallback[updateModeIndicator]"], [
        mode
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ContainersView.useEffect": ()=>{
            updateModeIndicator();
            window.addEventListener('resize', updateModeIndicator);
            return ({
                "ContainersView.useEffect": ()=>window.removeEventListener('resize', updateModeIndicator)
            })["ContainersView.useEffect"];
        }
    }["ContainersView.useEffect"], [
        updateModeIndicator
    ]);
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ViewShell$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
            title: "Containers",
            meta: headerMeta,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "loading",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "spinner"
                    }, void 0, false, {
                        fileName: "[project]/components/views/ContainersView.jsx",
                        lineNumber: 177,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: "Chargement..."
                    }, void 0, false, {
                        fileName: "[project]/components/views/ContainersView.jsx",
                        lineNumber: 178,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/views/ContainersView.jsx",
                lineNumber: 176,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/views/ContainersView.jsx",
            lineNumber: 175,
            columnNumber: 13
        }, this);
    }
    if (error) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ViewShell$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
            title: "Containers",
            meta: headerMeta,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "error",
                children: [
                    "Erreur lors du chargement: ",
                    error
                ]
            }, void 0, true, {
                fileName: "[project]/components/views/ContainersView.jsx",
                lineNumber: 187,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/components/views/ContainersView.jsx",
            lineNumber: 186,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ViewShell$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
        title: "Containers",
        meta: headerMeta,
        filters: modeSwitcher,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "grid",
            children: containersToPreload.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "empty-state",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        children: "Aucun container"
                    }, void 0, false, {
                        fileName: "[project]/components/views/ContainersView.jsx",
                        lineNumber: 197,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: mode === 'dev' ? 'Aucun container dev disponible' : 'Aucun container disponible (mode All)'
                    }, void 0, false, {
                        fileName: "[project]/components/views/ContainersView.jsx",
                        lineNumber: 198,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/views/ContainersView.jsx",
                lineNumber: 196,
                columnNumber: 21
            }, this) : containersToPreload.map((container)=>{
                const isVisible = containersToDisplay.some((item)=>item.name === container.name);
                const hiddenStyle = isVisible ? {} : {
                    display: 'block',
                    position: 'absolute',
                    left: '-9999px',
                    top: '0',
                    opacity: 0,
                    pointerEvents: 'none'
                };
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `grid-item${isVisible ? '' : ' hidden'}`,
                    "data-container-name": container.name,
                    style: hiddenStyle,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid-item-header",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: container.name
                                }, void 0, false, {
                                    fileName: "[project]/components/views/ContainersView.jsx",
                                    lineNumber: 227,
                                    columnNumber: 37
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "ip",
                                    children: container.ip
                                }, void 0, false, {
                                    fileName: "[project]/components/views/ContainersView.jsx",
                                    lineNumber: 228,
                                    columnNumber: 37
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/views/ContainersView.jsx",
                            lineNumber: 226,
                            columnNumber: 33
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("iframe", {
                            src: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2e$js__$5b$client$5d$__$28$ecmascript$29$__["buildVncUrl"])(config?.incusServer, container.ip),
                            className: "grid-item-iframe",
                            title: container.name,
                            allow: "fullscreen",
                            loading: "eager"
                        }, void 0, false, {
                            fileName: "[project]/components/views/ContainersView.jsx",
                            lineNumber: 230,
                            columnNumber: 33
                        }, this)
                    ]
                }, container.name, true, {
                    fileName: "[project]/components/views/ContainersView.jsx",
                    lineNumber: 220,
                    columnNumber: 29
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/components/views/ContainersView.jsx",
            lineNumber: 194,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/views/ContainersView.jsx",
        lineNumber: 193,
        columnNumber: 9
    }, this);
}
_s(ContainersView, "fXOJE4/m5j3Nwxb+3UGfLbNXJOE=");
_c = ContainersView;
var _c;
__turbopack_context__.k.register(_c, "ContainersView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/MeetingPopup.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MeetingPopup
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/index.js [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
function MeetingPopup({ meeting, onClose }) {
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MeetingPopup.useEffect": ()=>{
            const handleEscape = {
                "MeetingPopup.useEffect.handleEscape": (e)=>{
                    if (e.key === 'Escape') {
                        onClose();
                    }
                }
            }["MeetingPopup.useEffect.handleEscape"];
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
            return ({
                "MeetingPopup.useEffect": ()=>{
                    document.removeEventListener('keydown', handleEscape);
                    document.body.style.overflow = '';
                }
            })["MeetingPopup.useEffect"];
        }
    }["MeetingPopup.useEffect"], [
        onClose
    ]);
    if (!meeting) return null;
    const identity = meeting.identities;
    const bookerName = identity?.fullname || meeting.participant_email || 'Inconnu';
    const company = identity?.company || '';
    const email = identity?.email || meeting.participant_email || '';
    const formatDate = (dateString)=>{
        const date = new Date(dateString);
        return date.toLocaleString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC'
        });
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "meeting-popup",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "meeting-popup-overlay",
                onClick: onClose
            }, void 0, false, {
                fileName: "[project]/components/MeetingPopup.jsx",
                lineNumber: 40,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "meeting-popup-content",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "meeting-popup-close",
                        onClick: onClose,
                        children: "×"
                    }, void 0, false, {
                        fileName: "[project]/components/MeetingPopup.jsx",
                        lineNumber: 42,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "meeting-popup-header",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            className: "meeting-popup-title",
                            children: meeting.meeting_title || 'Meeting'
                        }, void 0, false, {
                            fileName: "[project]/components/MeetingPopup.jsx",
                            lineNumber: 46,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/MeetingPopup.jsx",
                        lineNumber: 45,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "meeting-popup-body",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "meeting-popup-info",
                            children: [
                                meeting.internal_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Internal ID"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 54,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-value",
                                            children: meeting.internal_id
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 55,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 53,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Date et heure"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 59,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-value",
                                            children: formatDate(meeting.meeting_start_at)
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 60,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 58,
                                    columnNumber: 25
                                }, this),
                                meeting.created_at && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Date de création"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 66,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-value",
                                            children: formatDate(meeting.created_at)
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 67,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 65,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Organisateur"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 73,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-value",
                                            children: [
                                                bookerName,
                                                company ? ` (${company})` : ''
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 74,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 72,
                                    columnNumber: 25
                                }, this),
                                email && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Email"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 81,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-value",
                                            children: email
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 82,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 80,
                                    columnNumber: 29
                                }, this),
                                meeting.meeting_url && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Lien du meeting"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 87,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                            id: "meetingPopupUrl",
                                            className: "meeting-popup-link",
                                            href: meeting.meeting_url,
                                            target: "_blank",
                                            rel: "noopener noreferrer",
                                            children: meeting.meeting_url
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 88,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 86,
                                    columnNumber: 29
                                }, this),
                                meeting.comment && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "meeting-popup-field",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-label",
                                            children: "Commentaire"
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 101,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "meeting-popup-value",
                                            children: meeting.comment
                                        }, void 0, false, {
                                            fileName: "[project]/components/MeetingPopup.jsx",
                                            lineNumber: 102,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/MeetingPopup.jsx",
                                    lineNumber: 100,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/MeetingPopup.jsx",
                            lineNumber: 51,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/MeetingPopup.jsx",
                        lineNumber: 50,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/MeetingPopup.jsx",
                lineNumber: 41,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/MeetingPopup.jsx",
        lineNumber: 39,
        columnNumber: 9
    }, this);
}
_s(MeetingPopup, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = MeetingPopup;
var _c;
__turbopack_context__.k.register(_c, "MeetingPopup");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/Calendar.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$fullcalendar$2f$react$2f$dist$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@fullcalendar/react/dist/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$fullcalendar$2f$timegrid$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@fullcalendar/timegrid/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$fullcalendar$2f$core$2f$locales$2f$fr$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@fullcalendar/core/locales/fr.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$MeetingPopup$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/MeetingPopup.jsx [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
;
;
const MEETINGS_API_URL = '/api/meetings';
const SLOT_MIN_TIME = '00:00:00';
const SLOT_MAX_TIME = '24:00:00';
const SLOT_DURATION_MINUTES = 30;
function timeToMinutes(timeStr) {
    // "HH:MM" or "HH:MM:SS"
    const parts = String(timeStr).split(':').map((n)=>parseInt(n, 10));
    const [h = 0, m = 0] = parts;
    return h * 60 + m;
}
function Calendar({ currentDate, onDateChange }) {
    _s();
    const calendarRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const calendarWrapperRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [events, setEvents] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [meetingsData, setMeetingsData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [selectedMeeting, setSelectedMeeting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [calendarHeight, setCalendarHeight] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [currentViewDate, setCurrentViewDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])({
        "Calendar.useState": ()=>{
            // Initialiser avec aujourd'hui en UTC
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            return today;
        }
    }["Calendar.useState"]);
    // Fonction pour charger les meetings
    const loadMeetings = async (startDate, endDate)=>{
        if (!startDate || !endDate) return;
        setLoading(true);
        setError(null);
        try {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            const response = await fetch(`${MEETINGS_API_URL}?start=${startDate.toISOString()}&end=${end.toISOString()}`);
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            const data = await response.json();
            const meetings = data.meetings || [];
            // Stocker les données complètes pour la popup
            setMeetingsData(meetings);
            // Convertir les meetings en format FullCalendar
            const calendarEvents = meetings.map((meeting)=>{
                const start = new Date(meeting.meeting_start_at);
                const duration = meeting.meeting_duration_minutes || 30;
                const end = new Date(start.getTime() + duration * 60 * 1000);
                const identity = meeting.identities;
                const bookerName = identity?.fullname || meeting.participant_email || 'Inconnu';
                const company = identity?.company || '';
                const title = meeting.meeting_title || 'Meeting';
                return {
                    id: meeting.id,
                    title: `${title} - ${bookerName}${company ? ` (${company})` : ''}`,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    extendedProps: {
                        meetingId: meeting.id,
                        meetingTitle: title,
                        bookerName,
                        company,
                        meetingUrl: meeting.meeting_url,
                        comment: meeting.comment
                    }
                };
            });
            setEvents(calendarEvents);
        } catch (err) {
            console.error('Erreur lors de la récupération des meetings:', err);
            setError(err.message);
            setEvents([]);
        } finally{
            setLoading(false);
        }
    };
    // Calculer la date de fin de la vue (aujourd'hui + 3 jours) en UTC
    const getViewEndDate = ()=>{
        const end = new Date(currentViewDate);
        end.setUTCDate(currentViewDate.getUTCDate() + 3);
        end.setUTCHours(23, 59, 59, 999);
        return end;
    };
    // Calculer la hauteur disponible pour le calendrier
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Calendar.useEffect": ()=>{
            let resizeObserver = null;
            const updateCalendarHeight = {
                "Calendar.useEffect.updateCalendarHeight": ()=>{
                    if (calendarWrapperRef.current) {
                        const wrapper = calendarWrapperRef.current;
                        // Trouver le conteneur parent dashboard-content
                        const dashboardContent = wrapper.closest('.dashboard-content');
                        if (dashboardContent) {
                            const contentRect = dashboardContent.getBoundingClientRect();
                            // Soustraire le padding (20px top + 28px bottom = 48px) et la hauteur des contrôles de navigation (~60px)
                            const availableHeight = contentRect.height - 48 - 60;
                            if (availableHeight > 0) {
                                setCalendarHeight(Math.max(400, availableHeight));
                            }
                        }
                    }
                }
            }["Calendar.useEffect.updateCalendarHeight"];
            // Attendre que le DOM soit prêt et que le composant soit monté
            const timeoutId = setTimeout({
                "Calendar.useEffect.timeoutId": ()=>{
                    updateCalendarHeight();
                    // Utiliser ResizeObserver pour détecter les changements de taille
                    if (calendarWrapperRef.current) {
                        const dashboardContent = calendarWrapperRef.current.closest('.dashboard-content');
                        if (dashboardContent) {
                            resizeObserver = new ResizeObserver({
                                "Calendar.useEffect.timeoutId": ()=>{
                                    updateCalendarHeight();
                                }
                            }["Calendar.useEffect.timeoutId"]);
                            resizeObserver.observe(dashboardContent);
                        }
                    }
                }
            }["Calendar.useEffect.timeoutId"], 100);
            window.addEventListener('resize', updateCalendarHeight);
            return ({
                "Calendar.useEffect": ()=>{
                    clearTimeout(timeoutId);
                    window.removeEventListener('resize', updateCalendarHeight);
                    if (resizeObserver) {
                        resizeObserver.disconnect();
                    }
                }
            })["Calendar.useEffect"];
        }
    }["Calendar.useEffect"], []);
    // Forcer une hauteur uniforme de chaque slot (remplit toute la hauteur)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Calendar.useEffect": ()=>{
            if (calendarRef.current && calendarHeight) {
                const calendarApi = calendarRef.current.getApi();
                const rootEl = calendarRef.current.el;
                const slotCount = Math.max(1, Math.round((timeToMinutes(SLOT_MAX_TIME) - timeToMinutes(SLOT_MIN_TIME)) / SLOT_DURATION_MINUTES));
                let cancelled = false;
                const applyUniformSlotHeights = {
                    "Calendar.useEffect.applyUniformSlotHeights": ()=>{
                        if (cancelled || !rootEl) return;
                        // 1) S'assurer que la taille de base est à jour
                        calendarApi.updateSize();
                        // 2) Mesurer la hauteur réelle disponible pour la grille horaire
                        requestAnimationFrame({
                            "Calendar.useEffect.applyUniformSlotHeights": ()=>{
                                if (cancelled) return;
                                const timegridBody = rootEl.querySelector('.fc-timegrid-body');
                                const bodyRect = timegridBody?.getBoundingClientRect();
                                const bodyHeight = bodyRect?.height || 0;
                                if (!bodyHeight) return;
                                const slotPx = '50';
                                rootEl.style.setProperty('--vnc-timegrid-slot-count', String(slotCount));
                                rootEl.style.setProperty('--vnc-timegrid-slot-height', `${slotPx}px`);
                                // 3) Forcer FullCalendar à recalculer les coords avec les nouvelles hauteurs
                                requestAnimationFrame({
                                    "Calendar.useEffect.applyUniformSlotHeights": ()=>{
                                        if (cancelled) return;
                                        calendarApi.updateSize();
                                    }
                                }["Calendar.useEffect.applyUniformSlotHeights"]);
                            }
                        }["Calendar.useEffect.applyUniformSlotHeights"]);
                    }
                }["Calendar.useEffect.applyUniformSlotHeights"];
                const timeoutId = setTimeout(applyUniformSlotHeights, 0);
                return ({
                    "Calendar.useEffect": ()=>{
                        cancelled = true;
                        clearTimeout(timeoutId);
                    }
                })["Calendar.useEffect"];
            }
        }
    }["Calendar.useEffect"], [
        calendarHeight,
        currentViewDate
    ]);
    // Charger les meetings quand la date change
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Calendar.useEffect": ()=>{
            const startDate = currentViewDate;
            const endDate = getViewEndDate();
            loadMeetings(startDate, endDate);
        }
    }["Calendar.useEffect"], [
        currentViewDate
    ]);
    // Gérer le changement de date dans FullCalendar
    const handleDatesSet = (dateInfo)=>{
        const start = new Date(dateInfo.start);
        start.setUTCHours(0, 0, 0, 0);
        // Mettre à jour la date de vue si elle a changé
        if (start.getTime() !== currentViewDate.getTime()) {
            setCurrentViewDate(start);
            if (onDateChange) {
                onDateChange(start);
            }
        }
    };
    // Naviguer vers une date spécifique
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Calendar.useEffect": ()=>{
            if (calendarRef.current && currentDate) {
                const calendarApi = calendarRef.current.getApi();
                const targetDate = new Date(currentDate);
                targetDate.setUTCHours(0, 0, 0, 0);
                calendarApi.gotoDate(targetDate);
                setCurrentViewDate(targetDate);
            }
        }
    }["Calendar.useEffect"], [
        currentDate
    ]);
    // Navigation précédent/suivant
    const navigateDays = (days)=>{
        const newDate = new Date(currentViewDate);
        newDate.setUTCDate(currentViewDate.getUTCDate() + days);
        newDate.setUTCHours(0, 0, 0, 0);
        if (calendarRef.current) {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.gotoDate(newDate);
        }
        setCurrentViewDate(newDate);
        if (onDateChange) {
            onDateChange(newDate);
        }
    };
    // Aller à aujourd'hui
    const goToToday = ()=>{
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (calendarRef.current) {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.gotoDate(today);
        }
        setCurrentViewDate(today);
        if (onDateChange) {
            onDateChange(today);
        }
    };
    // Gérer le clic sur un event
    const handleEventClick = (clickInfo)=>{
        const meetingId = clickInfo.event.extendedProps.meetingId;
        const meeting = meetingsData.find((m)=>m.id === meetingId);
        if (meeting) {
            setSelectedMeeting(meeting);
        }
    };
    // Formater la plage de dates affichée
    const formatDateRange = ()=>{
        const start = new Date(currentViewDate);
        const end = new Date(currentViewDate);
        end.setUTCDate(currentViewDate.getUTCDate() + 3);
        const options = {
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC'
        };
        const startStr = start.toLocaleDateString('fr-FR', options);
        const endStr = end.toLocaleDateString('fr-FR', options);
        // Vérifier si aujourd'hui est dans la plage (en UTC)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const startUTC = new Date(start);
        startUTC.setUTCHours(0, 0, 0, 0);
        const endUTC = new Date(end);
        endUTC.setUTCHours(23, 59, 59, 999);
        const isTodayInRange = today >= startUTC && today <= endUTC;
        if (isTodayInRange && startUTC.getTime() === today.getTime()) {
            return `Aujourd'hui - ${endStr}`;
        }
        return `${startStr} - ${endStr}`;
    };
    // Compter les événements par jour
    const getEventCountForDay = (dayDate)=>{
        const dayStart = new Date(dayDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayDate);
        dayEnd.setUTCHours(23, 59, 59, 999);
        return events.filter((event)=>{
            const eventStart = new Date(event.start);
            return eventStart >= dayStart && eventStart <= dayEnd;
        }).length;
    };
    // Personnaliser le contenu de l'en-tête de jour
    const dayHeaderContent = (dayInfo)=>{
        const eventCount = getEventCountForDay(dayInfo.date);
        // Extraire seulement le jour de la semaine et capitaliser la première lettre
        const dayOfWeekRaw = dayInfo.date.toLocaleDateString('fr-FR', {
            weekday: 'long',
            timeZone: 'UTC'
        });
        const dayOfWeek = dayOfWeekRaw.charAt(0).toUpperCase() + dayOfWeekRaw.slice(1);
        if (eventCount > 0) {
            return {
                html: `
          <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
            <div style="font-size: 12px; font-weight: 500; color: #fff;">${dayOfWeek}</div>
            <div style="font-size: 11px; color: #999; font-weight: 400;">${eventCount}</div>
          </div>
        `
            };
        }
        // Si pas d'événements, retourner juste le jour de la semaine capitalisé
        return dayOfWeek;
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: calendarWrapperRef,
        className: "calendar-wrapper",
        style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            height: '100%'
        },
        children: [
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "calendar-error",
                style: {
                    background: '#1a0a0a',
                    color: '#ff6666',
                    padding: '16px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    border: '1px solid #2a1a1a',
                    fontSize: '14px'
                },
                children: [
                    "Erreur: ",
                    error
                ]
            }, void 0, true, {
                fileName: "[project]/components/Calendar.jsx",
                lineNumber: 339,
                columnNumber: 9
            }, this),
            loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "loading",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "spinner"
                    }, void 0, false, {
                        fileName: "[project]/components/Calendar.jsx",
                        lineNumber: 354,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: "Chargement du planning..."
                    }, void 0, false, {
                        fileName: "[project]/components/Calendar.jsx",
                        lineNumber: 355,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/Calendar.jsx",
                lineNumber: 353,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '0 24px'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>navigateDays(-1),
                        className: "calendar-nav-btn",
                        style: {
                            background: '#1a1a1a',
                            color: '#e0e0e0',
                            border: '1px solid #2a2a2a',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            transition: 'all 0.2s ease'
                        },
                        onMouseEnter: (e)=>{
                            e.target.style.background = '#222';
                            e.target.style.borderColor = '#333';
                        },
                        onMouseLeave: (e)=>{
                            e.target.style.background = '#1a1a1a';
                            e.target.style.borderColor = '#2a2a2a';
                        },
                        children: "←"
                    }, void 0, false, {
                        fileName: "[project]/components/Calendar.jsx",
                        lineNumber: 368,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: goToToday,
                        className: "calendar-today-btn",
                        style: {
                            background: '#1a1a1a',
                            color: '#e0e0e0',
                            border: '1px solid #2a2a2a',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            transition: 'all 0.2s ease',
                            fontWeight: 500
                        },
                        onMouseEnter: (e)=>{
                            e.target.style.background = '#222';
                            e.target.style.borderColor = '#333';
                        },
                        onMouseLeave: (e)=>{
                            e.target.style.background = '#1a1a1a';
                            e.target.style.borderColor = '#2a2a2a';
                        },
                        children: "Aujourd'hui"
                    }, void 0, false, {
                        fileName: "[project]/components/Calendar.jsx",
                        lineNumber: 394,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: '13px',
                            color: '#999',
                            minWidth: '200px',
                            textAlign: 'center'
                        },
                        children: formatDateRange()
                    }, void 0, false, {
                        fileName: "[project]/components/Calendar.jsx",
                        lineNumber: 421,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>navigateDays(1),
                        className: "calendar-nav-btn",
                        style: {
                            background: '#1a1a1a',
                            color: '#e0e0e0',
                            border: '1px solid #2a2a2a',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            transition: 'all 0.2s ease'
                        },
                        onMouseEnter: (e)=>{
                            e.target.style.background = '#222';
                            e.target.style.borderColor = '#333';
                        },
                        onMouseLeave: (e)=>{
                            e.target.style.background = '#1a1a1a';
                            e.target.style.borderColor = '#2a2a2a';
                        },
                        children: "→"
                    }, void 0, false, {
                        fileName: "[project]/components/Calendar.jsx",
                        lineNumber: 430,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/Calendar.jsx",
                lineNumber: 360,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    height: calendarHeight ? `${calendarHeight}px` : '100%'
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$fullcalendar$2f$react$2f$dist$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"], {
                    ref: calendarRef,
                    plugins: [
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$fullcalendar$2f$timegrid$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"]
                    ],
                    initialView: "timeGridFourDay",
                    locale: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$fullcalendar$2f$core$2f$locales$2f$fr$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"],
                    headerToolbar: false,
                    allDaySlot: false,
                    slotMinTime: SLOT_MIN_TIME,
                    slotMaxTime: SLOT_MAX_TIME,
                    slotDuration: "00:30:00",
                    slotLabelInterval: "01:00:00",
                    height: calendarHeight || 'auto',
                    events: events,
                    datesSet: handleDatesSet,
                    initialDate: currentViewDate,
                    timeZone: "UTC",
                    views: {
                        timeGridFourDay: {
                            type: 'timeGrid',
                            duration: {
                                days: 4
                            },
                            buttonText: '4 jours'
                        }
                    },
                    validRange: (nowDate)=>{
                        // Permettre le défilement dans le passé et le futur
                        return {
                            start: null,
                            end: null
                        };
                    },
                    eventClick: handleEventClick,
                    eventContent: (eventInfo)=>{
                        const { meetingTitle, bookerName, company } = eventInfo.event.extendedProps;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "fc-event-main-frame",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "fc-event-title-text",
                                    children: meetingTitle
                                }, void 0, false, {
                                    fileName: "[project]/components/Calendar.jsx",
                                    lineNumber: 493,
                                    columnNumber: 15
                                }, void 0),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "fc-event-booker-text",
                                    children: [
                                        bookerName,
                                        company ? ` • ${company}` : ''
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/Calendar.jsx",
                                    lineNumber: 496,
                                    columnNumber: 15
                                }, void 0)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/Calendar.jsx",
                            lineNumber: 492,
                            columnNumber: 13
                        }, void 0);
                    },
                    eventTimeFormat: {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: 'UTC'
                    },
                    slotLabelFormat: {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: 'UTC'
                    },
                    dayHeaderFormat: {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC'
                    },
                    dayHeaderContent: dayHeaderContent,
                    nowIndicator: true,
                    eventDisplay: "block",
                    eventOverlap: true,
                    eventConstraint: {
                        start: '00:00',
                        end: '24:00'
                    }
                }, void 0, false, {
                    fileName: "[project]/components/Calendar.jsx",
                    lineNumber: 458,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/Calendar.jsx",
                lineNumber: 457,
                columnNumber: 7
            }, this),
            selectedMeeting && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$MeetingPopup$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
                meeting: selectedMeeting,
                onClose: ()=>setSelectedMeeting(null)
            }, void 0, false, {
                fileName: "[project]/components/Calendar.jsx",
                lineNumber: 526,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/Calendar.jsx",
        lineNumber: 333,
        columnNumber: 5
    }, this);
}
_s(Calendar, "efcpC7Ru1Bs6+bD9d0g4wBaavlE=");
_c = Calendar;
const __TURBOPACK__default__export__ = Calendar;
var _c;
__turbopack_context__.k.register(_c, "Calendar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/views/CalendarView.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CalendarView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ViewShell$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/ViewShell.jsx [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Calendar$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/Calendar.jsx [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
function CalendarView() {
    _s();
    const [currentDate, setCurrentDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const meta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "CalendarView.useMemo[meta]": ()=>{
            if (!currentDate) {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    children: "Chargement du planning…"
                }, void 0, false, {
                    fileName: "[project]/components/views/CalendarView.jsx",
                    lineNumber: 10,
                    columnNumber: 20
                }, this);
            }
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                children: currentDate.toLocaleDateString('fr-FR')
            }, void 0, false, {
                fileName: "[project]/components/views/CalendarView.jsx",
                lineNumber: 12,
                columnNumber: 16
            }, this);
        }
    }["CalendarView.useMemo[meta]"], [
        currentDate
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$ViewShell$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
        title: "Calendar",
        meta: meta,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Calendar$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
            currentDate: currentDate,
            onDateChange: setCurrentDate
        }, void 0, false, {
            fileName: "[project]/components/views/CalendarView.jsx",
            lineNumber: 17,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/views/CalendarView.jsx",
        lineNumber: 16,
        columnNumber: 9
    }, this);
}
_s(CalendarView, "sUVvx6bH/6tL7bu7D9a/UlBLfto=");
_c = CalendarView;
var _c;
__turbopack_context__.k.register(_c, "CalendarView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/views/registry.js [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_VIEW_ID",
    ()=>DEFAULT_VIEW_ID,
    "viewRegistry",
    ()=>viewRegistry
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$ContainersView$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/views/ContainersView.jsx [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$CalendarView$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/views/CalendarView.jsx [client] (ecmascript)");
;
;
const viewRegistry = [
    {
        id: 'containers',
        label: 'Containers',
        title: 'Containers',
        description: 'Suivi VNC en temps réel',
        Component: __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$ContainersView$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"]
    },
    {
        id: 'calendar',
        label: 'Calendar',
        title: 'Calendar',
        description: 'Planning et réunions',
        Component: __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$CalendarView$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"]
    }
];
const DEFAULT_VIEW_ID = 'containers';
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/pages/index.jsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$head$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/head.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$router$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/router.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Layout$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/Layout.jsx [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$registry$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/views/registry.js [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
;
;
function DashboardPage() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$router$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const queryView = typeof router.query.view === 'string' ? router.query.view : null;
    const activeView = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DashboardPage.useMemo[activeView]": ()=>{
            const fallbackView = __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$registry$2e$js__$5b$client$5d$__$28$ecmascript$29$__["viewRegistry"].find({
                "DashboardPage.useMemo[activeView]": (view)=>view.id === __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$registry$2e$js__$5b$client$5d$__$28$ecmascript$29$__["DEFAULT_VIEW_ID"]
            }["DashboardPage.useMemo[activeView]"]) || __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$registry$2e$js__$5b$client$5d$__$28$ecmascript$29$__["viewRegistry"][0];
            if (!queryView) return fallbackView;
            return __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$registry$2e$js__$5b$client$5d$__$28$ecmascript$29$__["viewRegistry"].find({
                "DashboardPage.useMemo[activeView]": (view)=>view.id === queryView
            }["DashboardPage.useMemo[activeView]"]) || fallbackView;
        }
    }["DashboardPage.useMemo[activeView]"], [
        queryView
    ]);
    const handleSelectView = (viewId)=>{
        router.push({
            pathname: '/',
            query: {
                view: viewId
            }
        }, undefined, {
            shallow: true
        });
    };
    const ActiveComponent = activeView.Component;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$head$2e$js__$5b$client$5d$__$28$ecmascript$29$__["default"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("title", {
                    children: "VNC Viewer Dashboard"
                }, void 0, false, {
                    fileName: "[project]/pages/index.jsx",
                    lineNumber: 34,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/pages/index.jsx",
                lineNumber: 33,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Layout$2e$jsx__$5b$client$5d$__$28$ecmascript$29$__["default"], {
                views: __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$views$2f$registry$2e$js__$5b$client$5d$__$28$ecmascript$29$__["viewRegistry"],
                activeView: activeView,
                onSelectView: handleSelectView,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActiveComponent, {}, void 0, false, {
                    fileName: "[project]/pages/index.jsx",
                    lineNumber: 37,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/pages/index.jsx",
                lineNumber: 36,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(DashboardPage, "HjeqoSx2Ns4abrC59LnF0PsAyds=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$router$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = DashboardPage;
var _c;
__turbopack_context__.k.register(_c, "DashboardPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[next]/entry/page-loader.ts { PAGE => \"[project]/pages/index.jsx [client] (ecmascript)\" } [client] (ecmascript)", ((__turbopack_context__, module, exports) => {

const PAGE_PATH = "/";
(window.__NEXT_P = window.__NEXT_P || []).push([
    PAGE_PATH,
    ()=>{
        return __turbopack_context__.r("[project]/pages/index.jsx [client] (ecmascript)");
    }
]);
// @ts-expect-error module.hot exists
if (module.hot) {
    // @ts-expect-error module.hot exists
    module.hot.dispose(function() {
        window.__NEXT_P.push([
            PAGE_PATH
        ]);
    });
}
}),
"[hmr-entry]/hmr-entry.js { ENTRY => \"[project]/pages/index\" }", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.r("[next]/entry/page-loader.ts { PAGE => \"[project]/pages/index.jsx [client] (ecmascript)\" } [client] (ecmascript)");
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__f1a505c6._.js.map