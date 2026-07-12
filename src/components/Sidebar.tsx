import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  Globe2,
  MoreHorizontal,
  Plus,
  Trash2
} from "lucide-react";
import { ClotientCollection, ClotientRequest, Environment, HistoryItem, KeyValue } from "../types";
import { importPostmanCollection, exportToPostmanCollection } from "../utils/postmanParser";
import packageJson from "../../package.json";

interface SidebarProps {
  collections: ClotientCollection[];
  environments: Environment[];
  history: HistoryItem[];
  width: number;
  collapsed: boolean;
  resourceMetrics: ResourceMetrics;
  confirmBeforeDelete: boolean;
  activeRequest: ClotientRequest | null;
  activeEnv: Environment | null;
  onSelectRequest: (req: ClotientRequest) => void;
  onSelectEnv: (env: Environment | null) => void;
  onCreateCollection: (name: string) => void;
  onCreateFolder: (collectionId: string, name: string) => void;
  onCreateRequest: (collectionId: string, folderId: string | null, name: string) => void;
  onDeleteRequest: (collectionId: string, folderId: string | null, reqId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onImportCollection: (collection: ClotientCollection) => void;
  onUpdateEnvironments: (envs: Environment[]) => void;
  onClearHistory: () => void;
  onStartResize: (event: MouseEvent<HTMLDivElement>) => void;
  onToggleCollapsed: () => void;
}

export interface ResourceMetrics {
  memory: string;
  storage: string;
  load: string;
  delta: string;
  live: boolean;
}

const id = () => Math.random().toString(36).substring(2, 11);

function methodClass(method: string) {
  return `ct-method ${method}`;
}

function formatTime(timestamp: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Sidebar({
  collections,
  environments,
  history,
  width,
  collapsed,
  resourceMetrics,
  confirmBeforeDelete,
  activeRequest,
  activeEnv,
  onSelectRequest,
  onSelectEnv,
  onCreateCollection,
  onCreateFolder,
  onCreateRequest,
  onDeleteRequest,
  onDeleteCollection,
  onImportCollection,
  onUpdateEnvironments,
  onClearHistory,
  onStartResize,
  onToggleCollapsed
}: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [dialog, setDialog] = useState<{
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    danger?: boolean;
    onConfirm: (value?: string) => void;
  } | null>(null);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      collections.forEach((collection) => {
        if (next[collection.id] === undefined) next[collection.id] = true;
        collection.folders.forEach((folder) => {
          if (next[folder.id] === undefined) next[folder.id] = false;
        });
      });
      return next;
    });
  }, [collections]);

  const showPrompt = (title: string, placeholder: string, defaultValue: string, onConfirm: (value: string) => void) => {
    setDialog({
      title,
      placeholder,
      defaultValue,
      onConfirm: (value) => {
        if (value?.trim()) onConfirm(value.trim());
        setDialog(null);
      }
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    if (!confirmBeforeDelete) {
      onConfirm();
      return;
    }
    setDialog({
      title,
      message,
      danger: true,
      onConfirm: () => {
        onConfirm();
        setDialog(null);
      }
    });
  };

  const handleImportClick = () => {
    setShowCollectionMenu(false);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event: any) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        onImportCollection(importPostmanCollection(await file.text()));
      } catch (err: any) {
        showConfirm("Import failed", err.message || "Could not parse the selected Postman collection.", () => {});
      }
    };
    input.click();
  };

  const handleExport = (collection: ClotientCollection) => {
    setShowCollectionMenu(false);
    const postmanJson = exportToPostmanCollection(collection);
    const blob = new Blob([JSON.stringify(postmanJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${collection.name}.postman_collection.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const activeCollection =
    collections.find((collection) =>
      collection.requests.some((request) => request.id === activeRequest?.id) ||
      collection.folders.some((folder) => folder.requests.some((request) => request.id === activeRequest?.id))
    ) || collections[0];

  const deleteCollection = (collection: ClotientCollection) => {
    setShowCollectionMenu(false);
    showConfirm("Delete collection", `Delete "${collection.name}"?`, () => onDeleteCollection(collection.id));
  };

  if (collapsed) {
    return (
      <aside className="ct-sidebar collapsed shrink-0 h-full bg-white border-r border-slate-200 flex flex-col items-center select-none" style={{ width }}>
        <div className="h-[76px] w-full border-b border-slate-200 flex items-center justify-center">
          <img src="/logo.png" className="w-8 h-8 rounded-lg" alt="Clotient" />
        </div>
        <button className="ct-side-collapse-button mt-3" title="Expand sidebar" onClick={onToggleCollapsed}>
          <ChevronRight size={16} />
        </button>
        <button className="ct-side-rail-button mt-2" title="New collection" onClick={() => showPrompt("New collection", "Collection name", "New Collection", onCreateCollection)}>
          <Plus size={16} />
        </button>
        <div className="flex-1" />
        <span className="mb-4 h-2 w-2 rounded-full bg-emerald-500" title="Online" />
      </aside>
    );
  }

  return (
    <aside className="ct-sidebar shrink-0 h-full bg-white border-r border-slate-200 flex flex-col select-none" style={{ width }}>
      <div className="h-[76px] px-5 border-b border-slate-200 flex items-center gap-3">
        <img src="/logo.png" className="w-8 h-8 rounded-lg" alt="Clotient" />
        <div className="min-w-0">
          <div className="text-[22px] font-semibold tracking-tight text-slate-950 leading-none">Clotient</div>
        </div>
        <button className="ct-side-collapse-button ml-auto" title="Collapse sidebar" onClick={onToggleCollapsed}>
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="h-[94px] px-5 py-4 border-b border-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Workspace</span>
          <button className="ct-icon-button !h-8 !w-8" onClick={() => showPrompt("New collection", "Collection name", "New Collection", onCreateCollection)}>
            <Plus size={16} />
          </button>
        </div>
        <button className="w-full h-9 rounded-md flex items-center gap-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="flex-1 text-left truncate">{activeEnv?.name || "Local"}</span>
          <ChevronDown size={15} className="text-slate-400" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <Section
          title="Collections"
          right={
            <div className="flex items-center gap-2">
              <button className="text-slate-400 hover:text-blue-600" onClick={() => showPrompt("New collection", "Collection name", "New Collection", onCreateCollection)}>
                <Plus size={15} />
              </button>
              <div className="ct-sidebar-menu-wrap">
                <button className="text-slate-400 hover:text-blue-600" onClick={() => setShowCollectionMenu((value) => !value)}>
                  <MoreHorizontal size={16} />
                </button>
                {showCollectionMenu && (
                  <div className="ct-sidebar-menu">
                    <button onClick={() => { setShowCollectionMenu(false); showPrompt("New collection", "Collection name", "New Collection", onCreateCollection); }}>
                      <Plus size={14} /> New collection
                    </button>
                    <button onClick={handleImportClick}>
                      <Download size={14} /> Import Postman JSON
                    </button>
                    {activeCollection && (
                      <>
                        <div className="ct-sidebar-menu-label">{activeCollection.name}</div>
                        <button onClick={() => { setShowCollectionMenu(false); showPrompt("New request", "Request name", "/v1/users", (value) => onCreateRequest(activeCollection.id, null, value)); }}>
                          <Plus size={14} /> New request
                        </button>
                        <button onClick={() => { setShowCollectionMenu(false); showPrompt("New folder", "Folder name", "New Folder", (value) => onCreateFolder(activeCollection.id, value)); }}>
                          <Folder size={14} /> New folder
                        </button>
                        <button onClick={() => handleExport(activeCollection)}>
                          <Download size={14} /> Export Postman collection
                        </button>
                        <button className="danger" onClick={() => deleteCollection(activeCollection)}>
                          <Trash2 size={14} /> Delete collection
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          }
        >
          {collections.map((collection) => (
            <div key={collection.id} className="mb-1">
              <div className="group h-8 px-2 rounded-md flex items-center gap-2 hover:bg-slate-50">
                <button className="text-slate-500" onClick={() => setExpanded((prev) => ({ ...prev, [collection.id]: !prev[collection.id] }))}>
                  {expanded[collection.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <Folder size={16} className="text-slate-600" />
                <span className="flex-1 truncate text-sm font-semibold text-slate-800">{collection.name}</span>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button className="text-slate-400 hover:text-blue-600" title="New request" onClick={() => showPrompt("New request", "Request name", "/v1/users", (value) => onCreateRequest(collection.id, null, value))}>
                    <Plus size={14} />
                  </button>
                  <button className="text-slate-400 hover:text-blue-600" title="New folder" onClick={() => showPrompt("New folder", "Folder name", "New Folder", (value) => onCreateFolder(collection.id, value))}>
                    <Folder size={14} />
                  </button>
                  <button className="text-slate-400 hover:text-blue-600" title="Export" onClick={() => handleExport(collection)}>
                    <Download size={14} />
                  </button>
                  <button className="text-slate-400 hover:text-red-600" title="Delete" onClick={() => showConfirm("Delete collection", `Delete "${collection.name}"?`, () => onDeleteCollection(collection.id))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expanded[collection.id] && (
                <div className="ml-5 mt-1 space-y-1">
                  {collection.requests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      active={activeRequest?.id === request.id}
                      onSelect={() => onSelectRequest(request)}
                      onDelete={() => showConfirm("Delete request", `Delete "${request.name}"?`, () => onDeleteRequest(collection.id, null, request.id))}
                    />
                  ))}
                  {collection.folders.map((folder) => (
                    <div key={folder.id}>
                      <button
                        className="w-full h-8 px-1 rounded-md flex items-center gap-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => setExpanded((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                      >
                        {expanded[folder.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <Folder size={16} className="text-slate-600" />
                        <span className="truncate">{folder.name}</span>
                      </button>
                      {expanded[folder.id] && (
                        <div className="ml-5 space-y-1">
                          {folder.requests.map((request) => (
                            <RequestRow
                              key={request.id}
                              request={request}
                              active={activeRequest?.id === request.id}
                              onSelect={() => onSelectRequest(request)}
                              onDelete={() => showConfirm("Delete request", `Delete "${request.name}"?`, () => onDeleteRequest(collection.id, folder.id, request.id))}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section
          title="Environments"
          right={
            <button className="text-slate-400 hover:text-blue-600" onClick={() => setShowEnvModal(true)}>
              <Plus size={15} />
            </button>
          }
        >
          {environments.map((environment, index) => (
            <button
              key={environment.id}
              onClick={() => onSelectEnv(environment)}
              className={`w-full h-8 px-2 rounded-md flex items-center gap-3 text-sm ${
                activeEnv?.id === environment.id ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-red-500"][index % 4]}`} />
              <span className="truncate">{environment.name}</span>
            </button>
          ))}
        </Section>

        <Section
          title="History"
          right={
            history.length > 0 ? (
              <button className="text-xs text-slate-500 hover:text-red-600" onClick={onClearHistory}>Clear</button>
            ) : null
          }
        >
          {(history.length > 0 ? history.slice(0, 7) : demoHistory()).map((item) => (
            <button key={item.id} onClick={() => onSelectRequest(item.request)} className="w-full h-8 px-2 rounded-md flex items-center gap-3 text-sm text-slate-700 hover:bg-slate-50">
              <span className={methodClass(item.method)}>{item.method}</span>
              <span className="flex-1 truncate text-left">{displayPath(item.request)}</span>
              <span className="text-xs text-slate-400">{formatTime(item.timestamp)}</span>
            </button>
          ))}
        </Section>
      </div>

      <ResourcePanel metrics={resourceMetrics} />

      <div className="h-12 px-5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Online
        </span>
        <span>v{packageJson.version}</span>
      </div>

      <div className="ct-resize-handle ct-resize-handle-y" onMouseDown={onStartResize} title="Resize sidebar" />

      {showEnvModal && (
        <EnvironmentModal
          environments={environments}
          activeEnv={activeEnv}
          onClose={() => setShowEnvModal(false)}
          onSelectEnv={onSelectEnv}
          onUpdateEnvironments={onUpdateEnvironments}
        />
      )}
      {dialog && <PromptDialog {...dialog} onClose={() => setDialog(null)} />}
    </aside>
  );
}

function ResourcePanel({ metrics }: { metrics: ResourceMetrics }) {
  return (
    <div className="ct-resource-panel">
      <div className="ct-resource-head">
        <span>Resource use</span>
        <em>{metrics.live ? "Live" : "Est."}</em>
      </div>
      <div className="ct-resource-grid">
        <MetricPill label="Memory" value={metrics.memory} />
        <MetricPill label="Load" value={metrics.load} />
        <MetricPill label="Storage" value={metrics.storage} />
        <MetricPill label="Delta" value={metrics.delta} />
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-resource-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</span>
        {right}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RequestRow({ request, active, onSelect, onDelete }: { request: ClotientRequest; active: boolean; onSelect: () => void; onDelete: () => void }) {
  return (
    <div onClick={onSelect} className={`group h-8 px-2 rounded-md flex items-center gap-3 cursor-pointer ${active ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
      <span className={methodClass(request.method)}>{request.method}</span>
      <span className="flex-1 truncate text-sm">{displayPath(request)}</span>
      <button className="hidden group-hover:block text-slate-400 hover:text-red-600" onClick={(event) => { event.stopPropagation(); onDelete(); }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function displayPath(request: ClotientRequest) {
  if (request.name.startsWith("/")) return request.name;
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.name;
  }
}

function demoHistory(): HistoryItem[] {
  const base = Date.now();
  return [
    ["GET", "/v1/users", 2],
    ["POST", "/v1/auth/login", 5],
    ["GET", "/v1/users/:id", 12],
    ["PUT", "/v1/users/:id", 20],
    ["GET", "/v1/health", 35]
  ].map(([method, path, minutes]) => ({
    id: `${method}-${path}`,
    method: String(method),
    url: String(path),
    timestamp: base - Number(minutes) * 60_000,
    request: {
      id: `${method}-${path}-request`,
      name: String(path),
      method: method as ClotientRequest["method"],
      url: `http://localhost:3000${String(path).replace(":id", "usr_1")}`,
      headers: [],
      params: [],
      body: { type: "none", rawText: "", urlencoded: [], formData: [] },
      scripts: { preRequest: "", postRequest: "" },
      auth: { type: "none" }
    }
  }));
}

function PromptDialog({
  title,
  message,
  placeholder,
  defaultValue,
  danger,
  onConfirm,
  onClose
}: {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  danger?: boolean;
  onConfirm: (value?: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue || "");
  const isPrompt = placeholder !== undefined;

  return (
    <div className="ct-modal-backdrop">
      <div className="ct-modal max-w-sm">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="p-4 space-y-3">
          {message && <p className="text-sm text-slate-600">{message}</p>}
          {isPrompt && (
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onConfirm(value);
                if (event.key === "Escape") onClose();
              }}
              placeholder={placeholder}
              className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
            />
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button className="ct-secondary h-8 px-3 text-xs" onClick={onClose}>Cancel</button>
          <button className={`${danger ? "bg-red-600 border-red-600 hover:bg-red-700" : "ct-primary"} h-8 px-3 rounded-md text-xs font-semibold text-white`} onClick={() => onConfirm(value)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function EnvironmentModal({
  environments,
  activeEnv,
  onClose,
  onSelectEnv,
  onUpdateEnvironments
}: {
  environments: Environment[];
  activeEnv: Environment | null;
  onClose: () => void;
  onSelectEnv: (env: Environment | null) => void;
  onUpdateEnvironments: (envs: Environment[]) => void;
}) {
  const selected = activeEnv || environments[0] || null;

  const updateSelected = (next: Environment) => {
    onUpdateEnvironments(environments.map((env) => (env.id === next.id ? next : env)));
    onSelectEnv(next);
  };

  const addEnvironment = () => {
    const nextEnv: Environment = { id: id(), name: "New Environment", variables: [] };
    onUpdateEnvironments([...environments, nextEnv]);
    onSelectEnv(nextEnv);
  };

  const addVariable = () => {
    if (!selected) return;
    updateSelected({ ...selected, variables: [...selected.variables, { id: id(), key: "new_variable", value: "", enabled: true }] });
  };

  const updateVariable = (variableId: string, fields: Partial<KeyValue>) => {
    if (!selected) return;
    updateSelected({ ...selected, variables: selected.variables.map((variable) => (variable.id === variableId ? { ...variable, ...fields } : variable)) });
  };

  const deleteVariable = (variableId: string) => {
    if (!selected) return;
    updateSelected({ ...selected, variables: selected.variables.filter((variable) => variable.id !== variableId) });
  };

  return (
    <div className="ct-modal-backdrop">
      <div className="ct-modal">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe2 size={18} className="text-blue-600" />
            <h3 className="font-semibold text-slate-900">Environments</h3>
          </div>
          <button className="ct-secondary h-8 px-3 text-xs" onClick={onClose}>Done</button>
        </div>
        <div className="min-h-0 flex-1 grid grid-cols-[220px_1fr]">
          <div className="border-r border-slate-200 p-3 bg-slate-50">
            <button className="ct-primary h-8 w-full text-xs mb-3" onClick={addEnvironment}>New environment</button>
            <div className="space-y-1">
              {environments.map((environment) => (
                <button key={environment.id} className={`w-full h-8 px-2 rounded-md text-left text-sm font-medium ${selected?.id === environment.id ? "bg-white text-blue-700 border border-slate-200" : "text-slate-600 hover:bg-white"}`} onClick={() => onSelectEnv(environment)}>
                  {environment.name}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0 p-5 overflow-y-auto">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Name</label>
                  <input value={selected.name} onChange={(event) => updateSelected({ ...selected, name: event.target.value })} className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Variables</h4>
                  <button className="ct-secondary h-8 px-3 text-xs" onClick={addVariable}>Add variable</button>
                </div>
                <div className="ct-panel overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                      <tr>
                        <th className="w-10 p-2 text-center">On</th>
                        <th className="p-2 text-left">Key</th>
                        <th className="p-2 text-left">Value</th>
                        <th className="w-10 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {selected.variables.map((variable) => (
                        <tr key={variable.id} className="border-t border-slate-100">
                          <td className="p-2 text-center"><input type="checkbox" checked={variable.enabled} onChange={(event) => updateVariable(variable.id, { enabled: event.target.checked })} /></td>
                          <td className="p-2"><input value={variable.key} onChange={(event) => updateVariable(variable.id, { key: event.target.value })} className="w-full bg-transparent outline-none font-mono text-xs" /></td>
                          <td className="p-2"><input value={variable.value} onChange={(event) => updateVariable(variable.id, { value: event.target.value })} className="w-full bg-transparent outline-none font-mono text-xs text-slate-600" /></td>
                          <td className="p-2 text-center"><button className="text-slate-400 hover:text-red-600" onClick={() => deleteVariable(variable.id)}><Trash2 size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">Create an environment to store local variables.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
