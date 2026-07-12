import { useState, useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Code2, Database, Plus, RotateCcw, Search, Settings, Trash2, X } from "lucide-react";
import packageJson from "../package.json";
import "./App.css";
import Sidebar from "./components/Sidebar";
import type { ResourceMetrics } from "./components/Sidebar";
import RequestBuilder from "./components/RequestBuilder";
import ResponseViewer from "./components/ResponseViewer";
import CodeGenerator from "./components/CodeGenerator";
import { ClotientCollection, ClotientRequest, Environment, HistoryItem, HttpResponsePayload } from "./types";
import { executeScript, SandboxContext } from "./utils/scriptSandbox";
import { resolveVariables } from "./utils/envResolver";

const uuid = () => Math.random().toString(36).substring(2, 11);
const storageKey = (fileName: string) => `clotient:${fileName}`;
const REPOSITORY_URL = "https://github.com/Irfan-Ahmad-byte/clotient";
const hasTauriRuntime = () => typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const SIDEBAR_MIN = 245;
const SIDEBAR_MAX = 380;
const RESPONSE_MIN = 420;
const RESPONSE_MAX = 760;
const BUILDER_MIN = 560;
const CONSOLE_MIN = 96;
const CONSOLE_MAX = 280;
const readStoredNumber = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const value = Number(localStorage.getItem(storageKey(key)));
  return Number.isFinite(value) ? value : fallback;
};

interface LocalHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body_type: string;
  body_text: string | null;
  form_data: [string, string][] | null;
  timeout_ms: number;
}

interface LocalHttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  time_ms: number;
  size_bytes: number;
  content_type: string;
}

interface AppSettings {
  autoSave: boolean;
  requestTimeoutMs: number;
  compactResponse: boolean;
  confirmBeforeDelete: boolean;
}

interface SaveNotice {
  type: "idle" | "saving" | "saved" | "error";
  message: string;
  detail?: string;
}

const defaultSettings: AppSettings = {
  autoSave: true,
  requestTimeoutMs: 30000,
  compactResponse: false,
  confirmBeforeDelete: true
};

async function loadAppData(fileName: string) {
  if (hasTauriRuntime()) {
    return invoke<string>("load_data", { fileName });
  }
  return localStorage.getItem(storageKey(fileName)) || "";
}

async function saveAppData(fileName: string, content: string) {
  if (hasTauriRuntime()) {
    await invoke("save_data", { fileName, content });
    return;
  }
  localStorage.setItem(storageKey(fileName), content);
}

async function sendHttpRequest(req: LocalHttpRequest): Promise<LocalHttpResponse> {
  if (hasTauriRuntime()) {
    return invoke<LocalHttpResponse>("send_http_request", { req });
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), req.timeout_ms || 30000);
  const headers = new Headers(req.headers);
  let body: BodyInit | undefined;

  if (req.body_type === "json" || req.body_type === "raw") {
    body = req.body_text || undefined;
  } else if (req.body_type === "urlencoded" && req.form_data) {
    const params = new URLSearchParams();
    req.form_data.forEach(([key, value]) => params.append(key, value));
    body = params;
  } else if (req.body_type === "form-data" && req.form_data) {
    const form = new FormData();
    req.form_data.forEach(([key, value]) => form.append(key, value));
    body = form;
  }

  const startedAt = performance.now();
  try {
    const response = await fetch(req.url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      signal: controller.signal
    });
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      status: response.status,
      status_text: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      time_ms: Math.round(performance.now() - startedAt),
      size_bytes: new TextEncoder().encode(responseBody).length,
      content_type: response.headers.get("content-type") || "text/plain"
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function estimateLocalStorageBytes() {
  if (typeof localStorage === "undefined") return 0;
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("clotient:")) continue;
    total += new TextEncoder().encode(`${key}${localStorage.getItem(key) || ""}`).length;
  }
  return total;
}

function estimateJsonBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

const createNewBlankRequest = (name: string = "New Request"): ClotientRequest => ({
  id: uuid(),
  name,
  method: "GET",
  url: "http://localhost:3000/v1/users",
  headers: [],
  params: [],
  body: { type: "none", rawText: "", urlencoded: [], formData: [] },
  scripts: { preRequest: "", postRequest: "" },
  auth: { type: "none" }
});

const defaultCollections: ClotientCollection[] = [
  {
    id: uuid(),
    name: "Users API",
    folders: [
      {
        id: uuid(),
        name: "Auth API",
        requests: [
          {
            id: uuid(),
            name: "/v1/auth/login",
            method: "POST",
            url: "http://localhost:3000/v1/auth/login",
            headers: [{ id: uuid(), key: "Content-Type", value: "application/json", enabled: true }],
            params: [],
            body: {
              type: "json",
              rawText: `{\n  "email": "jane.cooper@example.com",\n  "password": "{{password}}"\n}`,
              urlencoded: [],
              formData: []
            },
            scripts: {
              preRequest: "",
              postRequest: `cs.assert(cs.response.status < 500, "Server responded");`
            },
            auth: { type: "none" }
          }
        ]
      },
      {
        id: uuid(),
        name: "System API",
        requests: [
          {
            id: uuid(),
            name: "/v1/health",
            method: "GET",
            url: "http://localhost:3000/v1/health",
            headers: [],
            params: [],
            body: { type: "none", rawText: "", urlencoded: [], formData: [] },
            scripts: { preRequest: "", postRequest: "" },
            auth: { type: "none" }
          }
        ]
      }
    ],
    requests: [
      {
        id: uuid(),
        name: "/v1/users",
        method: "GET",
        url: "http://localhost:3000/v1/users?page=1&limit=20&sort=created_at&order=desc",
        headers: [{ id: uuid(), key: "Accept", value: "application/json", enabled: true }],
        params: [
          { id: uuid(), key: "page", value: "1", description: "Page number", enabled: true },
          { id: uuid(), key: "limit", value: "20", description: "Items per page", enabled: true },
          { id: uuid(), key: "sort", value: "created_at", description: "Sort field", enabled: false },
          { id: uuid(), key: "order", value: "desc", description: "Sort order", enabled: false }
        ],
        body: { type: "none", rawText: "", urlencoded: [], formData: [] },
        scripts: {
          preRequest: `cs.log("Preparing users request");`,
          postRequest: `cs.assert(cs.response.status === 200, "Response status should be 200 OK");`
        },
        auth: { type: "none" }
      },
      {
        id: uuid(),
        name: "/v1/users/:id",
        method: "PUT",
        url: "http://localhost:3000/v1/users/usr_1",
        headers: [
          { id: uuid(), key: "Content-Type", value: "application/json", enabled: true },
          { id: uuid(), key: "Authorization", value: "Bearer {{token}}", enabled: true }
        ],
        params: [],
        body: {
          type: "json",
          rawText: `{\n  "name": "Jane Cooper",\n  "role": "admin"\n}`,
          urlencoded: [],
          formData: []
        },
        scripts: { preRequest: "", postRequest: "" },
        auth: { type: "bearer", bearerToken: "{{token}}" }
      }
    ]
  }
];

const defaultEnvironments: Environment[] = [
  {
    id: uuid(),
    name: "Local",
    variables: [
      { id: uuid(), key: "host", value: "http://localhost:3000", enabled: true },
      { id: uuid(), key: "token", value: "local_dev_token", enabled: true },
      { id: uuid(), key: "password", value: "local-password", enabled: true }
    ]
  }
];

const demoResponse: HttpResponsePayload = {
  status: 200,
  statusText: "OK",
  headers: {
    "content-type": "application/json",
    "cache-control": "no-cache",
    "x-request-id": "req_local_demo",
    "set-cookie": "session=demo; Path=/; HttpOnly"
  },
  body: JSON.stringify(
    {
      data: [
        {
          id: "usr_1",
          name: "Jane Cooper",
          email: "jane.cooper@example.com",
          role: "admin",
          created_at: "2024-05-20T14:23:11.000Z"
        },
        {
          id: "usr_2",
          name: "Cody Fisher",
          email: "cody.fisher@example.com",
          role: "user",
          created_at: "2024-05-20T14:23:11.000Z"
        }
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 125,
        pages: 7
      }
    },
    null,
    2
  ),
  timeMs: 184,
  sizeBytes: 12400,
  contentType: "application/json"
};

function isOldBuiltInDemo(collections: ClotientCollection[]) {
  return collections.length === 1 && collections[0]?.name === "HTTPBin Demo API";
}

function isDefaultUsersRequest(request: ClotientRequest | null) {
  return request?.name === "/v1/users" && request.url.includes("/v1/users");
}

function useResourceMetrics({
  collections,
  environments,
  history,
  logs,
  response,
  loading,
  errorMsg
}: {
  collections: ClotientCollection[];
  environments: Environment[];
  history: HistoryItem[];
  logs: string[];
  response: HttpResponsePayload | null;
  loading: boolean;
  errorMsg: string;
}): ResourceMetrics {
  const previousStorage = useRef<number | null>(null);
  const [metrics, setMetrics] = useState<ResourceMetrics>({
    memory: "0 B",
    storage: "0 B",
    load: "0%",
    delta: "+0 B",
    live: false
  });

  useEffect(() => {
    let cancelled = false;

    const sample = async () => {
      const memoryInfo = (performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;
      const estimatedDataBytes = estimateJsonBytes({ collections, environments, history, logs, response, errorMsg });
      const memoryBytes = memoryInfo?.usedJSHeapSize || estimatedDataBytes;

      let storageEstimate: StorageEstimate | null = null;
      try {
        storageEstimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
      } catch {
        storageEstimate = null;
      }
      const storageBytes = storageEstimate?.usage || estimateLocalStorageBytes();
      const previous = previousStorage.current ?? storageBytes;
      previousStorage.current = storageBytes;

      const recentRequests = history.filter((item) => Date.now() - item.timestamp < 60_000).length;
      const responseWeight = response ? Math.min(18, response.timeMs / 60 + response.sizeBytes / 100_000) : 0;
      const logWeight = Math.min(18, logs.length * 2 + (errorMsg ? 10 : 0));
      const loadScore = clamp(Math.round((loading ? 42 : 4) + recentRequests * 6 + responseWeight + logWeight), 0, 100);

      if (!cancelled) {
        setMetrics({
          memory: formatBytes(memoryBytes),
          storage: formatBytes(storageBytes),
          load: `${loadScore}%`,
          delta: `${storageBytes >= previous ? "+" : "-"}${formatBytes(Math.abs(storageBytes - previous))}`,
          live: Boolean(memoryInfo || storageEstimate)
        });
      }
    };

    sample();
    const interval = window.setInterval(sample, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [collections, environments, history, logs, response, loading, errorMsg]);

  return metrics;
}

export default function App() {
  // Navigation & Active state
  const [collections, setCollections] = useState<ClotientCollection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeRequest, setActiveRequest] = useState<ClotientRequest | null>(null);
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [saveNotice, setSaveNotice] = useState<SaveNotice>({ type: "idle", message: "All changes local" });
  const [sidebarWidth, setSidebarWidth] = useState(() => clamp(readStoredNumber("layout:sidebarWidth", 305), SIDEBAR_MIN, SIDEBAR_MAX));
  const [responseWidth, setResponseWidth] = useState(() => clamp(readStoredNumber("layout:responseWidth", 610), RESPONSE_MIN, RESPONSE_MAX));
  const [consoleHeight, setConsoleHeight] = useState(() => clamp(readStoredNumber("layout:consoleHeight", 150), CONSOLE_MIN, CONSOLE_MAX));

  // App load states
  const [loadingApp, setLoadingApp] = useState(true);
  const [loaded, setLoaded] = useState(false);

  // Request runtime states
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [response, setResponse] = useState<HttpResponsePayload | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [assertions, setAssertions] = useState<{ passed: boolean; message: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  // Cancellation reference
  const activeRequestId = useRef<string | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);

  // App-level Custom prompt dialog modal
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptConfig, setPromptConfig] = useState<{
    title: string;
    message: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm: (val: string) => void;
  } | null>(null);

  // Snippets Generator states
  const [showCodeGenModal, setShowCodeGenModal] = useState(false);

  // 1. Initial Load from Local Storage on Mount
  useEffect(() => {
    document.title = `Clotient Studio - v${packageJson.version}`;
    async function loadData() {
      try {
        const collectionsStr = await loadAppData("collections.json");
        const environmentsStr = await loadAppData("environments.json");
        const historyStr = await loadAppData("history.json");
        const settingsStr = await loadAppData("settings.json");

        const parsedCollections = collectionsStr ? JSON.parse(collectionsStr) : defaultCollections;
        const parsedEnvironments = environmentsStr ? JSON.parse(environmentsStr) : defaultEnvironments;
        const loadedCollections = isOldBuiltInDemo(parsedCollections) ? defaultCollections : parsedCollections;
        const loadedEnvironments = isOldBuiltInDemo(parsedCollections) ? defaultEnvironments : parsedEnvironments;
        const loadedHistory = historyStr ? JSON.parse(historyStr) : [];
        const loadedSettings = settingsStr ? { ...defaultSettings, ...JSON.parse(settingsStr) } : defaultSettings;

        setCollections(loadedCollections);
        setEnvironments(loadedEnvironments);
        setHistory(loadedHistory);
        setSettings(loadedSettings);

        // Set default active request
        let initialRequest: ClotientRequest | null = null;
        if (loadedCollections.length > 0) {
          if (loadedCollections[0].requests.length > 0) {
            initialRequest = loadedCollections[0].requests[0];
          } else if (loadedCollections[0].folders.length > 0 && loadedCollections[0].folders[0].requests.length > 0) {
            initialRequest = loadedCollections[0].folders[0].requests[0];
          } else {
            initialRequest = createNewBlankRequest();
          }
        } else {
          initialRequest = createNewBlankRequest();
        }
        setActiveRequest(initialRequest);
        if (initialRequest) {
          setOpenTabIds([initialRequest.id]);
        }
        if (isDefaultUsersRequest(initialRequest)) {
          setResponse(demoResponse);
          setLogs(["GET http://localhost:3000/v1/users?page=1&limit=20&sort=created_at&order=desc", "Response received", "JSON parsed", "Request completed"]);
          setAssertions([{ passed: true, message: "Response status should be 200 OK" }]);
        }

        // Set active environment
        if (loadedEnvironments.length > 0) {
          setActiveEnv(loadedEnvironments[0]);
        }
      } catch (e) {
        // Fallback to defaults
        setCollections(defaultCollections);
        setEnvironments(defaultEnvironments);
        setHistory([]);
        setSettings(defaultSettings);
        setActiveRequest(defaultCollections[0].requests[0]);
        setOpenTabIds([defaultCollections[0].requests[0].id]);
        if (defaultEnvironments.length > 0) {
          setActiveEnv(defaultEnvironments[0]);
        }
      } finally {
        setLoadingApp(false);
        setLoaded(true);
      }
    }
    loadData();
  }, []);

  // 2. Auto-save changes to disk on data modifications
  useEffect(() => {
    if (!loaded || !settings.autoSave) return;
    async function saveData() {
      try {
        await saveAppData("collections.json", JSON.stringify(collections));
        setSaveNotice({ type: "saved", message: "Auto-saved locally" });
      } catch (e) {
        console.error("Save collections failed", e);
        setSaveNotice({ type: "error", message: "Auto-save failed", detail: e instanceof Error ? e.message : String(e) });
      }
    }
    saveData();
  }, [collections, loaded, settings.autoSave]);

  useEffect(() => {
    if (!loaded || !settings.autoSave) return;
    async function saveData() {
      try {
        await saveAppData("environments.json", JSON.stringify(environments));
        setSaveNotice({ type: "saved", message: "Auto-saved locally" });
      } catch (e) {
        console.error("Save environments failed", e);
        setSaveNotice({ type: "error", message: "Auto-save failed", detail: e instanceof Error ? e.message : String(e) });
      }
    }
    saveData();
  }, [environments, loaded, settings.autoSave]);

  useEffect(() => {
    if (!loaded || !settings.autoSave) return;
    async function saveData() {
      try {
        await saveAppData("history.json", JSON.stringify(history));
        setSaveNotice({ type: "saved", message: "Auto-saved locally" });
      } catch (e) {
        console.error("Save history failed", e);
        setSaveNotice({ type: "error", message: "Auto-save failed", detail: e instanceof Error ? e.message : String(e) });
      }
    }
    saveData();
  }, [history, loaded, settings.autoSave]);

  useEffect(() => {
    if (!loaded) return;
    async function saveData() {
      try {
        await saveAppData("settings.json", JSON.stringify(settings));
      } catch (e) {
        console.error("Save settings failed", e);
        setSaveNotice({ type: "error", message: "Settings save failed", detail: e instanceof Error ? e.message : String(e) });
      }
    }
    saveData();
  }, [settings, loaded]);

  useEffect(() => {
    localStorage.setItem(storageKey("layout:sidebarWidth"), String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(storageKey("layout:responseWidth"), String(responseWidth));
  }, [responseWidth]);

  useEffect(() => {
    localStorage.setItem(storageKey("layout:consoleHeight"), String(consoleHeight));
  }, [consoleHeight]);

  useEffect(() => {
    const normalizeResponseWidth = () => {
      const mainWidth = mainRef.current?.clientWidth || window.innerWidth - sidebarWidth;
      const maxForViewport = Math.min(RESPONSE_MAX, Math.max(RESPONSE_MIN, mainWidth - BUILDER_MIN));
      setResponseWidth((current) => clamp(current, RESPONSE_MIN, maxForViewport));
    };

    normalizeResponseWidth();
    window.addEventListener("resize", normalizeResponseWidth);
    return () => window.removeEventListener("resize", normalizeResponseWidth);
  }, [sidebarWidth]);

  const resourceMetrics = useResourceMetrics({
    collections,
    environments,
    history,
    logs,
    response,
    loading: loadingRequest,
    errorMsg
  });

  const beginResize = (event: ReactMouseEvent, onMove: (deltaX: number, deltaY: number) => void, cursor = "col-resize") => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
    };
    const handleUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleSidebarResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    const startWidth = sidebarWidth;
    beginResize(event, (deltaX) => {
      setSidebarWidth(clamp(startWidth + deltaX, SIDEBAR_MIN, SIDEBAR_MAX));
    }, "col-resize");
  };

  const handleResponseResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    const startWidth = responseWidth;
    const mainWidth = mainRef.current?.clientWidth || window.innerWidth - sidebarWidth;
    beginResize(event, (deltaX) => {
      setResponseWidth(clamp(startWidth - deltaX, RESPONSE_MIN, Math.min(RESPONSE_MAX, Math.max(RESPONSE_MIN, mainWidth - BUILDER_MIN))));
    }, "col-resize");
  };

  const handleConsoleResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    const startHeight = consoleHeight;
    beginResize(event, (_deltaX, deltaY) => {
      setConsoleHeight(clamp(startHeight - deltaY, CONSOLE_MIN, CONSOLE_MAX));
    }, "row-resize");
  };

  const handleOpenRepository = async () => {
    if (hasTauriRuntime()) {
      await openUrl(REPOSITORY_URL);
      return;
    }
    window.open(REPOSITORY_URL, "_blank", "noopener,noreferrer");
  };

  const handleResetLayout = () => {
    setSidebarWidth(305);
    setResponseWidth(610);
    setConsoleHeight(150);
    localStorage.removeItem(storageKey("layout:sidebarWidth"));
    localStorage.removeItem(storageKey("layout:responseWidth"));
    localStorage.removeItem(storageKey("layout:consoleHeight"));
    setSaveNotice({ type: "saved", message: "Layout reset" });
  };

  const handleClearRuntimeCache = async () => {
    setHistory([]);
    clearRequestRuntime();
    try {
      await saveAppData("history.json", JSON.stringify([]));
      setSaveNotice({ type: "saved", message: "Runtime cache cleared" });
    } catch (e) {
      setSaveNotice({ type: "error", message: "Clear cache failed", detail: e instanceof Error ? e.message : String(e) });
    }
  };

  // Handler to update selected request details in collections mapping
  const handleActiveRequestChange = (updated: ClotientRequest) => {
    setActiveRequest(updated);

    setCollections((prevCollections) =>
      prevCollections.map((c) => {
        // If request is at the collection top-level
        const hasReqAtTop = c.requests.some((r) => r.id === updated.id);
        if (hasReqAtTop) {
          return {
            ...c,
            requests: c.requests.map((r) => (r.id === updated.id ? updated : r))
          };
        }

        // If request is inside a folder
        const hasReqInFolder = c.folders.some((f) => f.requests.some((r) => r.id === updated.id));
        if (hasReqInFolder) {
          return {
            ...c,
            folders: c.folders.map((f) => ({
              ...f,
              requests: f.requests.map((r) => (r.id === updated.id ? updated : r))
            }))
          };
        }

        return c;
      })
    );
  };

  const clearRequestRuntime = () => {
    setResponse(null);
    setLogs([]);
    setAssertions([]);
    setErrorMsg("");
  };

  const handleManualSave = async () => {
    setSaveNotice({ type: "saving", message: "Saving changes..." });
    try {
      await Promise.all([
        saveAppData("collections.json", JSON.stringify(collections)),
        saveAppData("environments.json", JSON.stringify(environments)),
        saveAppData("history.json", JSON.stringify(history)),
        saveAppData("settings.json", JSON.stringify(settings))
      ]);
      setSaveNotice({ type: "saved", message: "Saved locally", detail: new Date().toLocaleTimeString() });
    } catch (e) {
      setSaveNotice({ type: "error", message: "Save failed", detail: e instanceof Error ? e.message : String(e) });
    }
  };

  // 3. Main Query Dispatcher
  const handleSendRequest = async () => {
    if (!activeRequest) return;

    setLoadingRequest(true);
    setResponse(null);
    setLogs([]);
    setAssertions([]);
    setErrorMsg("");

    const reqId = uuid();
    activeRequestId.current = reqId;

    let requestCopy = JSON.parse(JSON.stringify(activeRequest)) as ClotientRequest;
    const runLogs: string[] = [];
    const runAssertions: { passed: boolean; message: string }[] = [];

    // Local environment copy that scripts can read/write to
    const envVars: Record<string, string> = {};
    if (activeEnv) {
      activeEnv.variables.forEach((v) => {
        if (v.enabled && v.key) envVars[v.key] = v.value;
      });
    }

    const sandboxEnv: SandboxContext["env"] = {
      get: (key) => envVars[key] || "",
      set: (key, value) => {
        envVars[key] = value;
        runLogs.push(`cs.env.set: Set variable "${key}" = "${value}"`);
      }
    };

    const sandboxRequest: SandboxContext["request"] = {
      headers: {
        add: (k, v) => {
          requestCopy.headers.push({ id: uuid(), key: k, value: v, enabled: true });
          runLogs.push(`cs.request.headers.add: Added header "${k}: ${v}"`);
        },
        remove: (k) => {
          requestCopy.headers = requestCopy.headers.filter((h) => h.key.toLowerCase() !== k.toLowerCase());
          runLogs.push(`cs.request.headers.remove: Removed header "${k}"`);
        }
      }
    };

    // A. Pre-request Script Sandbox run
    if (requestCopy.scripts.preRequest) {
      runLogs.push("--- Running Pre-request Script ---");
      const preResult = executeScript(requestCopy.scripts.preRequest, {
        env: sandboxEnv,
        request: sandboxRequest
      });
      runLogs.push(...preResult.logs);
      runAssertions.push(...preResult.assertions);
    }

    // B. Resolve Environment Variables
    const url = resolveVariables(requestCopy.url, activeEnv, envVars);

    // Validation 1: Unresolved environment variables keys remaining in URL path
    if (/\{\{[^}]+\}\}/.test(url)) {
      const matches = url.match(/\{\{([^}]+)\}\}/g);
      setErrorMsg(`Validation Error: Unresolved environment variables: ${matches?.join(", ")}. Please define or enable them in your environment settings.`);
      setLoadingRequest(false);
      activeRequestId.current = null;
      return;
    }

    // Validation 2: Ensure URL parses cleanly
    try {
      new URL(url);
    } catch {
      setErrorMsg(`Validation Error: "${url}" is not a valid absolute URL. Please ensure it starts with http:// or https://`);
      setLoadingRequest(false);
      activeRequestId.current = null;
      return;
    }

    // Resolve Headers
    const headersMap: Record<string, string> = {};
    requestCopy.headers.forEach((h) => {
      if (h.enabled && h.key) {
        headersMap[h.key] = resolveVariables(h.value, activeEnv, envVars);
      }
    });

    // Resolve Auth structures
    if (requestCopy.auth.type === "bearer" && requestCopy.auth.bearerToken) {
      const resolvedToken = resolveVariables(requestCopy.auth.bearerToken, activeEnv, envVars);
      headersMap["Authorization"] = `Bearer ${resolvedToken}`;
    } else if (requestCopy.auth.type === "basic" && requestCopy.auth.basicUsername) {
      const u = resolveVariables(requestCopy.auth.basicUsername, activeEnv, envVars);
      const p = resolveVariables(requestCopy.auth.basicPassword || "", activeEnv, envVars);
      // base64 encoding basic credentials
      headersMap["Authorization"] = `Basic ${btoa(`${u}:${p}`)}`;
    }

    // Resolve Request payload details
    let bodyText: string | null = null;
    let formDataList: [string, string][] | null = null;

    if (requestCopy.body.type === "json" || requestCopy.body.type === "raw") {
      bodyText = resolveVariables(requestCopy.body.rawText, activeEnv, envVars);
    } else if (requestCopy.body.type === "urlencoded" && requestCopy.body.urlencoded) {
      formDataList = requestCopy.body.urlencoded
        .filter((x) => x.enabled && x.key)
        .map((x) => [x.key, resolveVariables(x.value, activeEnv, envVars)]);
    } else if (requestCopy.body.type === "form-data" && requestCopy.body.formData) {
      formDataList = requestCopy.body.formData
        .filter((x) => x.enabled && x.key)
        .map((x) => [x.key, resolveVariables(x.value, activeEnv, envVars)]);
    }

    // C. Dispatch Request to Rust Backend Command
    try {
      const rustRes = await sendHttpRequest({
        url,
        method: requestCopy.method,
        headers: headersMap,
        body_type: requestCopy.body.type,
        body_text: bodyText,
        form_data: formDataList,
        timeout_ms: settings.requestTimeoutMs
      });

      // Abort updating UI states if request was cancelled
      if (activeRequestId.current !== reqId) {
        return;
      }

      const responsePayload: HttpResponsePayload = {
        status: rustRes.status,
        statusText: rustRes.status_text,
        headers: rustRes.headers,
        body: rustRes.body,
        timeMs: rustRes.time_ms,
        sizeBytes: rustRes.size_bytes,
        contentType: rustRes.content_type
      };

      setResponse(responsePayload);

      // D. Post-request Script (Tests/Assertions) Sandbox run
      if (requestCopy.scripts.postRequest) {
        runLogs.push("--- Running Post-request Script ---");
        const postResult = executeScript(requestCopy.scripts.postRequest, {
          env: sandboxEnv,
          request: sandboxRequest,
          response: {
            status: responsePayload.status,
            json: () => JSON.parse(responsePayload.body),
            text: () => responsePayload.body
          }
        });
        runLogs.push(...postResult.logs);
        runAssertions.push(...postResult.assertions);
      }

      // E. Append to History list
      const newHistoryItem: HistoryItem = {
        id: uuid(),
        url: requestCopy.url,
        method: requestCopy.method,
        timestamp: Date.now(),
        request: JSON.parse(JSON.stringify(activeRequest)), // store original query config
        response: responsePayload
      };
      setHistory((prevHistory) => [newHistoryItem, ...prevHistory].slice(0, 100)); // cap at 100 history items

      // F. If variables were updated in Sandbox environment, sync them back to the active environment!
      if (activeEnv) {
        const updatedVariables = activeEnv.variables.map((v) => {
          if (envVars[v.key] !== undefined) {
            return { ...v, value: envVars[v.key] };
          }
          return v;
        });

        // Add newly set variables not in activeEnv list
        Object.keys(envVars).forEach((key) => {
          if (!activeEnv.variables.some((v) => v.key === key)) {
            updatedVariables.push({
              id: uuid(),
              key,
              value: envVars[key],
              enabled: true
            });
          }
        });

        setEnvironments((prevEnvs) =>
          prevEnvs.map((e) => (e.id === activeEnv.id ? { ...e, variables: updatedVariables } : e))
        );
        setActiveEnv({ ...activeEnv, variables: updatedVariables });
      }

      setLogs(runLogs);
      setAssertions(runAssertions);
    } catch (err: any) {
      if (activeRequestId.current !== reqId) {
        return;
      }
      setErrorMsg(err.toString());
      setLogs(runLogs);
      setAssertions(runAssertions);
    } finally {
      if (activeRequestId.current === reqId) {
        setLoadingRequest(false);
      }
    }
  };

  const handleCancelRequest = () => {
    activeRequestId.current = null;
    setLoadingRequest(false);
    setErrorMsg("Request cancelled by user");
  };

  const handleCreateEnvVar = (key: string) => {
    if (!activeEnv) return;
    setPromptConfig({
      title: "Create Environment Variable",
      message: `Specify initial value for variable "${key}":`,
      placeholder: "Variable Value",
      defaultValue: "",
      onConfirm: (enteredValue: string) => {
        const newVar = {
          id: uuid(),
          key,
          value: enteredValue,
          enabled: true
        };
        const updatedVars = [...activeEnv.variables, newVar];
        setEnvironments((prevEnvs) =>
          prevEnvs.map((e) => (e.id === activeEnv.id ? { ...e, variables: updatedVars } : e))
        );
        setActiveEnv({ ...activeEnv, variables: updatedVars });
        setPromptOpen(false);
      }
    });
    setPromptOpen(true);
  };

  // Collections CRUD handlers
  const handleCreateCollection = (name: string) => {
    const newColl: ClotientCollection = {
      id: uuid(),
      name,
      requests: [],
      folders: []
    };
    setCollections([...collections, newColl]);
  };

  const handleDeleteCollection = (id: string) => {
    setCollections(collections.filter((c) => c.id !== id));
  };

  const handleCreateFolder = (collectionId: string, name: string) => {
    setCollections(
      collections.map((c) => {
        if (c.id !== collectionId) return c;
        return {
          ...c,
          folders: [...c.folders, { id: uuid(), name, requests: [] }]
        };
      })
    );
  };

  const handleCreateRequest = (collectionId: string, folderId: string | null, name: string) => {
    const newReq = createNewBlankRequest(name);
    setCollections(
      collections.map((c) => {
        if (c.id !== collectionId) return c;

        if (folderId === null) {
          return {
            ...c,
            requests: [...c.requests, newReq]
          };
        } else {
          return {
            ...c,
            folders: c.folders.map((f) => (f.id === folderId ? { ...f, requests: [...f.requests, newReq] } : f))
          };
        }
      })
    );
    setActiveRequest(newReq);
    setOpenTabIds((prev) => [newReq.id, ...prev.filter((id) => id !== newReq.id)].slice(0, 8));
    clearRequestRuntime();
  };

  const handleDeleteRequest = (collectionId: string, folderId: string | null, reqId: string) => {
    setCollections(
      collections.map((c) => {
        if (c.id !== collectionId) return c;

        if (folderId === null) {
          return {
            ...c,
            requests: c.requests.filter((r) => r.id !== reqId)
          };
        } else {
          return {
            ...c,
            folders: c.folders.map((f) =>
              f.id === folderId ? { ...f, requests: f.requests.filter((r) => r.id !== reqId) } : f
            )
          };
        }
      })
    );
    setOpenTabIds((prev) => prev.filter((id) => id !== reqId));
    if (activeRequest?.id === reqId) {
      setActiveRequest(null);
      clearRequestRuntime();
    }
  };

  const handleImportCollection = (imported: ClotientCollection) => {
    setCollections([...collections, imported]);
    if (imported.requests.length > 0) {
      setActiveRequest(imported.requests[0]);
      setOpenTabIds((prev) => [imported.requests[0].id, ...prev.filter((id) => id !== imported.requests[0].id)].slice(0, 8));
    } else if (imported.folders.length > 0 && imported.folders[0].requests.length > 0) {
      setActiveRequest(imported.folders[0].requests[0]);
      setOpenTabIds((prev) => [imported.folders[0].requests[0].id, ...prev.filter((id) => id !== imported.folders[0].requests[0].id)].slice(0, 8));
    }
  };

  const searchableRequests = collections.flatMap((collection) => [
    ...collection.requests.map((request) => ({
      request,
      path: collection.name
    })),
    ...collection.folders.flatMap((folder) =>
      folder.requests.map((request) => ({
        request,
        path: `${collection.name} / ${folder.name}`
      }))
    )
  ]);
  const requestMetaById = new Map(searchableRequests.map((item) => [item.request.id, item]));
  const openTabs = openTabIds
    .map((tabId) => requestMetaById.get(tabId))
    .filter((tab): tab is { request: ClotientRequest; path: string } => Boolean(tab));

  const activateRequest = (request: ClotientRequest) => {
    setActiveRequest(request);
    setOpenTabIds((prev) => [request.id, ...prev.filter((id) => id !== request.id)].slice(0, 8));
    clearRequestRuntime();
  };

  const closeTab = (requestId: string) => {
    setOpenTabIds((prev) => {
      const next = prev.filter((id) => id !== requestId);
      if (activeRequest?.id === requestId) {
        const nextActiveId = next[0];
        const nextActive = nextActiveId ? requestMetaById.get(nextActiveId)?.request || null : null;
        setActiveRequest(nextActive);
        clearRequestRuntime();
      }
      return next;
    });
  };

  const globalResults = globalSearch.trim()
    ? searchableRequests
        .filter(({ request, path }) =>
          `${request.name} ${request.method} ${request.url} ${path}`.toLowerCase().includes(globalSearch.toLowerCase())
        )
        .slice(0, 8)
    : [];

  if (loadingApp) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f6f8fb] text-[#172033] select-none">
        <div className="text-center font-sans">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-md font-semibold text-slate-700">Opening Clotient...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="ct-app">
      {/* Sidebar Panel */}
      <Sidebar
        collections={collections}
        environments={environments}
        history={history}
        width={sidebarWidth}
        resourceMetrics={resourceMetrics}
        confirmBeforeDelete={settings.confirmBeforeDelete}
        activeRequest={activeRequest}
        activeEnv={activeEnv}
        onSelectRequest={activateRequest}
        onSelectEnv={setActiveEnv}
        onCreateCollection={handleCreateCollection}
        onCreateFolder={handleCreateFolder}
        onCreateRequest={handleCreateRequest}
        onDeleteRequest={handleDeleteRequest}
        onDeleteCollection={handleDeleteCollection}
        onImportCollection={handleImportCollection}
        onUpdateEnvironments={setEnvironments}
        onClearHistory={() => setHistory([])}
        onStartResize={handleSidebarResize}
      />

      {/* Main Request Workspace Panel */}
      <div className="ct-main" ref={mainRef}>
        <header className="ct-topbar">
          <div className="ct-tab-strip">
            {openTabs.length > 0 ? (
              openTabs.map(({ request, path }, index) => (
                <button
                  key={`${request.id}-${index}`}
                  className={`ct-request-tab ${request.id === activeRequest?.id ? "active" : ""}`}
                  title={`${path} · ${request.url}`}
                  onClick={() => activateRequest(request)}
                >
                  <span className={`ct-method ${request.method}`}>{request.method}</span>
                  <span className="truncate">{request.name || request.url}</span>
                  <span
                    className="ct-tab-close"
                    title="Close tab"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(request.id);
                    }}
                  >
                    <X size={13} />
                  </span>
                </button>
              ))
            ) : (
              <div className="ct-request-tab text-slate-500">No request selected</div>
            )}
            <button
              className="ct-icon-button"
              title="Create request in first collection"
              onClick={() => {
                const firstCollection = collections[0];
                if (firstCollection) {
                  handleCreateRequest(firstCollection.id, null, "New Request");
                } else {
                  handleCreateCollection("My API");
                }
              }}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="ct-top-actions">
            <div className="ct-search">
              <Search size={15} className="ct-search-icon" />
              <input
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setShowGlobalSearch(true);
                }}
                onFocus={() => setShowGlobalSearch(true)}
                onBlur={() => setTimeout(() => setShowGlobalSearch(false), 160)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && globalResults[0]) {
                    activateRequest(globalResults[0].request);
                    setGlobalSearch("");
                    setShowGlobalSearch(false);
                  }
                }}
                placeholder="Search requests"
              />
              <span className="ct-kbd">Ctrl K</span>
              {showGlobalSearch && globalResults.length > 0 && (
                <div className="ct-search-popover">
                  {globalResults.map(({ request, path }) => (
                    <button
                      key={request.id}
                      className="ct-search-result"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        activateRequest(request);
                        setGlobalSearch("");
                        setShowGlobalSearch(false);
                      }}
                    >
                      <span className={`ct-method ${request.method}`}>{request.method}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{request.name}</span>
                        <span className="block truncate text-[11px] text-slate-500">{path}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="ct-badge ct-link-badge" onClick={handleOpenRepository} title="Open Clotient repository">
              <Code2 size={15} />
              Open Source
            </button>
            <button className="ct-icon-button" title="Local settings" onClick={() => setShowSettingsModal(true)}>
              <Settings size={16} />
            </button>
          </div>
        </header>

        <div className="ct-content">
        <div className="ct-workspace" style={{ gridTemplateColumns: `minmax(0, 1fr) ${responseWidth}px` }}>
        {activeRequest ? (
          <>
            {/* Upper: Request Builder */}
            <div className="ct-builder-pane">
              <RequestBuilder
                request={activeRequest}
                onChange={handleActiveRequestChange}
                onSave={handleManualSave}
                saveStatus={saveNotice.type}
                saveMessage={saveNotice.detail ? `${saveNotice.message}: ${saveNotice.detail}` : saveNotice.message}
                onSend={handleSendRequest}
                onGenerateCode={() => setShowCodeGenModal(true)}
                loading={loadingRequest}
                activeEnv={activeEnv}
                onCancel={handleCancelRequest}
                onCreateEnvVar={handleCreateEnvVar}
              />
            </div>

            {/* Right: Response Viewer */}
            <div className="ct-response-pane">
              <div className="ct-resize-handle ct-response-resize" onMouseDown={handleResponseResize} title="Resize response panel" />
              <ResponseViewer
                response={response}
                loading={loadingRequest}
                logs={logs}
                assertions={assertions}
                errorMsg={errorMsg}
                compact={settings.compactResponse}
              />
            </div>
          </>
        ) : (
          <div className="ct-empty">
            <div className="ct-empty-card">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <img src="/logo.png" className="w-10 h-10 rounded-lg" alt="Clotient Logo" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">Clotient</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                A lightweight, local-first open-source API client. Create or select a request from the sidebar to begin.
              </p>
              <button
                className="ct-primary h-10 px-4"
                onClick={() => {
                  const firstCollection = collections[0];
                  if (firstCollection) handleCreateRequest(firstCollection.id, null, "New Request");
                  else handleCreateCollection("My API");
                }}
              >
                New request
              </button>
            </div>
          </div>
        )}
        </div>
        <BottomConsole
          response={response}
          logs={logs}
          assertions={assertions}
          history={history}
          errorMsg={errorMsg}
          loading={loadingRequest}
          height={consoleHeight}
          onStartResize={handleConsoleResize}
          onClearLogs={() => {
            setLogs([]);
            setAssertions([]);
            setErrorMsg("");
          }}
        />
        </div>
      </div>

      {/* Code Snippets Modal */}
      {showCodeGenModal && activeRequest && (
        <CodeGenerator
          request={activeRequest}
          activeEnv={activeEnv}
          onClose={() => setShowCodeGenModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          metrics={resourceMetrics}
          saveNotice={saveNotice}
          onChange={setSettings}
          onSave={handleManualSave}
          onResetLayout={handleResetLayout}
          onClearRuntimeCache={handleClearRuntimeCache}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Custom dialog prompt overlay modal */}
      {promptOpen && promptConfig && (
        <div className="ct-modal-backdrop">
          <div className="ct-modal max-w-sm">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center select-none">
              <h4 className="text-slate-900 font-semibold">{promptConfig.title}</h4>
              <button onClick={() => setPromptOpen(false)} className="text-slate-400 hover:text-slate-900 cursor-pointer">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed select-text">{promptConfig.message}</p>
              <input
                type="text"
                id="app-prompt-input"
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs outline-none text-slate-800 focus:border-blue-500 font-medium"
                placeholder={promptConfig.placeholder}
                defaultValue={promptConfig.defaultValue}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (document.getElementById("app-prompt-input") as HTMLInputElement)?.value || "";
                    promptConfig.onConfirm(val);
                  } else if (e.key === "Escape") {
                    setPromptOpen(false);
                  }
                }}
              />
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5 select-none">
              <button
                onClick={() => setPromptOpen(false)}
                className="ct-secondary px-3.5 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = (document.getElementById("app-prompt-input") as HTMLInputElement)?.value || "";
                  promptConfig.onConfirm(val);
                }}
                className="ct-primary px-3.5 py-1.5 text-xs"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomConsole({
  response,
  logs,
  assertions,
  history,
  errorMsg,
  loading,
  height,
  onStartResize,
  onClearLogs
}: {
  response: HttpResponsePayload | null;
  logs: string[];
  assertions: { passed: boolean; message: string }[];
  history: HistoryItem[];
  errorMsg: string;
  loading: boolean;
  height: number;
  onStartResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onClearLogs: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"console" | "logs">("console");
  const [level, setLevel] = useState<"all" | "info" | "success" | "error" | "test">("all");
  const [collapsed, setCollapsed] = useState(false);
  const latest = history[0];
  const now = new Date().toLocaleTimeString();

  const consoleRows: ConsoleRow[] = [
    latest
      ? {
          time: new Date(latest.timestamp).toLocaleTimeString(),
          event: `${latest.method} ${latest.url}`,
          meta: latest.response ? `${latest.response.status} · ${latest.response.timeMs} ms` : "Sent",
          level: latest.response && latest.response.status >= 400 ? "error" : "success"
        }
      : {
          time: "--:--:--",
          event: "Console ready",
          meta: "Local workspace",
          level: "info"
        },
    loading
      ? {
          time: now,
          event: "Request in progress",
          meta: "Waiting",
          level: "info"
        }
      : errorMsg
        ? {
            time: now,
            event: "Request failed",
            meta: errorMsg,
            level: "error"
          }
        : null,
    response
      ? {
          time: now,
          event: "Response received",
          meta: `${response.timeMs} ms · ${formatBytes(response.sizeBytes)}`,
          level: response.status >= 400 ? "error" : "success"
        }
      : {
          time: "--:--:--",
          event: "Response pending",
          meta: "Send a request",
          level: "info"
        },
    {
      time: now,
      event: logs.length > 0 ? `${logs.length} console log${logs.length === 1 ? "" : "s"}` : "Console empty",
      meta: assertions.length > 0 ? `${assertions.filter((a) => a.passed).length}/${assertions.length} tests` : "No tests",
      level: assertions.some((assertion) => !assertion.passed) ? "error" : assertions.length > 0 ? "test" : "info"
    }
  ].filter(Boolean) as ConsoleRow[];

  const logRows: ConsoleRow[] = [
    ...logs.map((log, index) => ({
      time: now,
      event: log,
      meta: `log ${index + 1}`,
      level: log.toLowerCase().includes("error") || log.toLowerCase().includes("failed") ? "error" : "info"
    } satisfies ConsoleRow)),
    ...assertions.map((assertion, index) => ({
      time: now,
      event: assertion.message,
      meta: `test ${index + 1}`,
      level: assertion.passed ? "test" : "error"
    } satisfies ConsoleRow)),
    ...(errorMsg
      ? [{
          time: now,
          event: errorMsg,
          meta: "error",
          level: "error"
        } satisfies ConsoleRow]
      : []),
    ...history.slice(0, 10).map((item) => ({
      time: new Date(item.timestamp).toLocaleTimeString(),
      event: `${item.method} ${item.url}`,
      meta: item.response ? `${item.response.status} · ${item.response.timeMs} ms` : "sent",
      level: item.response && item.response.status >= 400 ? "error" : "success"
    } satisfies ConsoleRow))
  ];

  const activeRows = activeTab === "console" ? consoleRows : logRows;
  const visibleRows = level === "all" ? activeRows : activeRows.filter((row) => row.level === level);

  return (
    <div className={`ct-console ${collapsed ? "collapsed" : ""}`} style={{ height: collapsed ? 38 : height }}>
      {!collapsed && <div className="ct-resize-handle ct-console-resize" onMouseDown={onStartResize} title="Resize console" />}
      <div className="ct-console-head">
        <div className="flex items-center gap-4">
          <button className={activeTab === "console" ? "active" : ""} onClick={() => setActiveTab("console")}>Console</button>
          <button className={activeTab === "logs" ? "active" : ""} onClick={() => setActiveTab("logs")}>Logs</button>
        </div>
        <div className="ct-console-actions">
          <label>
            <span>Level</span>
            <select value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>
              <option value="all">All Levels</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="test">Tests</option>
            </select>
          </label>
          <button className="ct-console-icon" onClick={onClearLogs} title="Clear current logs">
            <Trash2 size={14} />
          </button>
          <button
            className="ct-console-icon"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "Expand console" : "Collapse console"}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      {!collapsed && <div className="ct-console-body">
        {visibleRows.length === 0 ? (
          <div className="ct-console-empty">No {activeTab === "logs" ? "logs" : "console events"} for this filter.</div>
        ) : visibleRows.map((row, index) => (
          <div key={`${row.time}-${row.event}-${index}`} className={`ct-console-row ${row.level}`}>
            <span>{row.time}</span>
            <strong>{row.event}</strong>
            <em>{row.meta}</em>
          </div>
        ))}
      </div>}
    </div>
  );
}

type ConsoleRow = {
  time: string;
  event: string;
  meta: string;
  level: "info" | "success" | "error" | "test";
};

function SettingsModal({
  settings,
  metrics,
  saveNotice,
  onChange,
  onSave,
  onResetLayout,
  onClearRuntimeCache,
  onClose
}: {
  settings: AppSettings;
  metrics: ResourceMetrics;
  saveNotice: SaveNotice;
  onChange: (settings: AppSettings) => void;
  onSave: () => void;
  onResetLayout: () => void;
  onClearRuntimeCache: () => void;
  onClose: () => void;
}) {
  const update = (fields: Partial<AppSettings>) => onChange({ ...settings, ...fields });

  return (
    <div className="ct-modal-backdrop">
      <div className="ct-modal ct-settings-modal">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-blue-600" />
            <h3 className="font-semibold text-slate-900">Settings</h3>
          </div>
          <button className="ct-icon-button !h-8 !w-8" onClick={onClose}>✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 bg-slate-50/70 space-y-4">
          <div className="ct-panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Save behavior
            </div>
            <SettingRow
              title="Auto-save"
              detail="Collections, environments, history, and settings save automatically."
              control={
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(event) => update({ autoSave: event.target.checked })}
                />
              }
            />
            <SettingRow
              title="Request timeout"
              detail="Used by the request runner before cancelling a slow request."
              control={
                <input
                  type="number"
                  min={1000}
                  max={120000}
                  step={1000}
                  value={settings.requestTimeoutMs}
                  onChange={(event) => update({ requestTimeoutMs: clamp(Number(event.target.value) || 30000, 1000, 120000) })}
                  className="ct-settings-number"
                />
              }
            />
            <div className={`ct-save-state ${saveNotice.type}`}>
              {saveNotice.type === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
              <span>{saveNotice.detail ? `${saveNotice.message}: ${saveNotice.detail}` : saveNotice.message}</span>
            </div>
          </div>

          <div className="ct-panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database size={16} className="text-blue-600" />
              Interface and data
            </div>
            <SettingRow
              title="Compact response viewer"
              detail="Reduce padding in the response panel for more visible response content."
              control={
                <input
                  type="checkbox"
                  checked={settings.compactResponse}
                  onChange={(event) => update({ compactResponse: event.target.checked })}
                />
              }
            />
            <SettingRow
              title="Confirm before delete"
              detail="Ask before removing collections or requests from the sidebar."
              control={
                <input
                  type="checkbox"
                  checked={settings.confirmBeforeDelete}
                  onChange={(event) => update({ confirmBeforeDelete: event.target.checked })}
                />
              }
            />
            <div className="ct-settings-actions">
              <button className="ct-secondary h-9 px-3 flex items-center gap-2" onClick={onResetLayout}>
                <RotateCcw size={15} /> Reset layout
              </button>
              <button className="ct-secondary h-9 px-3 flex items-center gap-2" onClick={onClearRuntimeCache}>
                <Trash2 size={15} /> Clear runtime cache
              </button>
            </div>
          </div>

          <div className="ct-panel p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">Current footprint</div>
            <div className="ct-settings-metrics">
              <MetricPillCompact label="Memory" value={metrics.memory} />
              <MetricPillCompact label="Load" value={metrics.load} />
              <MetricPillCompact label="Storage" value={metrics.storage} />
              <MetricPillCompact label="Delta" value={metrics.delta} />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-white flex justify-end gap-2">
          <button className="ct-secondary h-9 px-4" onClick={onSave}>Save now</button>
          <button className="ct-primary h-9 px-4" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ title, detail, control }: { title: string; detail: string; control: React.ReactNode }) {
  return (
    <div className="ct-setting-row">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500 leading-relaxed">{detail}</div>
      </div>
      {control}
    </div>
  );
}

function MetricPillCompact({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-settings-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
