import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clipboard, Clock3, FileJson2, List, Search, ShieldCheck, XCircle } from "lucide-react";
import { HttpResponsePayload } from "../types";

interface ResponseViewerProps {
  response: HttpResponsePayload | null;
  loading: boolean;
  logs: string[];
  assertions: { passed: boolean; message: string }[];
  errorMsg?: string;
  compact?: boolean;
}

type ResponseTab = "json" | "headers" | "cookies" | "timeline";

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function prettyBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function statusTone(status: number) {
  if (status >= 200 && status < 300) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (status >= 300 && status < 400) return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-red-50 text-red-700 border-red-100";
}

export default function ResponseViewer({ response, loading, logs, assertions, errorMsg, compact = false }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<ResponseTab>("json");
  const [query, setQuery] = useState("");

  const body = response ? prettyBody(response.body) : "";
  const visibleBody = query ? highlightLines(body, query) : body;
  const cookies = useMemo(() => {
    if (!response) return [];
    return Object.entries(response.headers).filter(([key]) => key.toLowerCase() === "set-cookie");
  }, [response]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-white">
        <div className="w-9 h-9 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-sm font-semibold text-slate-700">Sending request...</div>
        <div className="mt-1 text-xs">Waiting for the local runner</div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-white">
        <div className="ct-panel p-6 max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-900">Request failed</h3>
          <p className="mt-2 text-xs font-mono text-red-700 bg-red-50 border border-red-100 rounded-md p-3 break-words text-left">
            {errorMsg}
          </p>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-white">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <FileJson2 size={26} className="text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900">No response yet</h3>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Send a request to inspect the response body, headers, cookies, timeline, logs, and test assertions.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { id: ResponseTab; label: string; count?: number }[] = [
    { id: "json", label: "JSON" },
    { id: "headers", label: "Headers", count: Object.keys(response.headers).length },
    { id: "cookies", label: "Cookies", count: cookies.length },
    { id: "timeline", label: "Timeline" }
  ];

  return (
    <section className={`h-full min-h-0 flex flex-col bg-white ${compact ? "ct-response-compact" : ""}`}>
      <div className="px-5 pt-5 pb-4 border-b border-slate-200 ct-response-summary">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`h-9 px-3 rounded-md border text-sm font-bold flex items-center ${statusTone(response.status)}`}>
              {response.status} {response.statusText}
            </span>
            <span className="text-sm font-semibold text-slate-700">{response.timeMs} ms</span>
            <span className="text-sm font-semibold text-slate-700">{formatSize(response.sizeBytes)}</span>
          </div>
          <span className="text-xs text-slate-500">Just now</span>
        </div>
      </div>

      <div className="h-12 px-5 border-b border-slate-200 flex items-end justify-between gap-4">
        <div className="flex items-end gap-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-12 border-b-2 text-sm font-semibold flex items-center gap-2 ${
                activeTab === tab.id ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-slate-100 text-[11px] text-slate-600 flex items-center justify-center">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {activeTab === "json" && (
          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find"
                className="h-8 w-32 rounded-md border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-blue-400"
              />
            </div>
            <button
              className="ct-icon-button !h-8 !w-8"
              title="Copy response"
              onClick={() => navigator.clipboard?.writeText(body)}
            >
              <Clipboard size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4 bg-slate-50/60 ct-response-body">
        {activeTab === "json" && (
          <pre className="h-full ct-panel overflow-auto p-4 text-xs leading-relaxed font-mono text-slate-800 bg-white">
            <code>{visibleBody}</code>
          </pre>
        )}

        {activeTab === "headers" && (
          <DataTable
            empty="No response headers."
            rows={Object.entries(response.headers)}
          />
        )}

        {activeTab === "cookies" && (
          <DataTable
            empty="No cookies returned."
            rows={cookies}
          />
        )}

        {activeTab === "timeline" && (
          <div className="h-full min-h-0 grid grid-rows-[auto_1fr] gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Metric icon={<Clock3 size={15} />} label="Duration" value={`${response.timeMs} ms`} />
              <Metric icon={<List size={15} />} label="Headers" value={String(Object.keys(response.headers).length)} />
              <Metric icon={<ShieldCheck size={15} />} label="Tests" value={`${assertions.filter((a) => a.passed).length}/${assertions.length}`} />
            </div>
            <div className="grid grid-cols-2 gap-4 min-h-0">
              <div className="ct-panel min-h-0 overflow-auto">
                <div className="px-3 py-2 border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400">Console</div>
                <div className="p-3 space-y-2 text-xs font-mono">
                  {logs.length === 0 ? (
                    <div className="text-slate-500 font-sans">No console logs.</div>
                  ) : logs.map((log, index) => (
                    <div key={index} className="text-slate-700 break-words">
                      <span className="text-blue-600 mr-2">[{index + 1}]</span>{log}
                    </div>
                  ))}
                </div>
              </div>
              <div className="ct-panel min-h-0 overflow-auto">
                <div className="px-3 py-2 border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400">Tests</div>
                <div className="p-3 space-y-2">
                  {assertions.length === 0 ? (
                    <div className="text-sm text-slate-500">No tests ran.</div>
                  ) : assertions.map((assertion, index) => (
                    <div key={index} className={`flex items-start gap-2 text-sm ${assertion.passed ? "text-emerald-700" : "text-red-700"}`}>
                      {assertion.passed ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
                      <span>{assertion.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function highlightLines(body: string, query: string) {
  if (!query.trim()) return body;
  return body
    .split("\n")
    .filter((line) => line.toLowerCase().includes(query.toLowerCase()))
    .join("\n");
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="ct-panel p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DataTable({ rows, empty }: { rows: [string, string][]; empty: string }) {
  if (rows.length === 0) {
    return <div className="h-full ct-panel flex items-center justify-center text-sm text-slate-500">{empty}</div>;
  }

  return (
    <div className="h-full ct-panel overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-400">
          <tr>
            <th className="p-3 text-left w-1/3">Key</th>
            <th className="p-3 text-left">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, value], index) => (
            <tr key={`${key}-${index}`} className="border-t border-slate-100">
              <td className="p-3 font-mono text-xs text-blue-700 align-top">{key}</td>
              <td className="p-3 font-mono text-xs text-slate-700 break-all">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
