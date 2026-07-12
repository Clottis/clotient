import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Code2, Save, Send, StopCircle, Trash2 } from "lucide-react";
import { BodyType, ClotientRequest, Environment, KeyValue } from "../types";

interface RequestBuilderProps {
  request: ClotientRequest;
  onChange: (req: ClotientRequest) => void;
  onSave: () => void;
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  saveMessage: string;
  onSend: () => void;
  onGenerateCode: () => void;
  loading: boolean;
  activeEnv: Environment | null;
  onCancel: () => void;
  onCreateEnvVar?: (key: string, value: string) => void;
}

type TabType = "params" | "auth" | "headers" | "body" | "scripts";

const newRow = (): KeyValue => ({
  id: Math.random().toString(36).substring(2, 11),
  key: "",
  value: "",
  enabled: true,
  description: ""
});

function methodClass(method: string) {
  return `ct-method ${method}`;
}

function withTrailingRow(list: KeyValue[]) {
  const rows = [...list];
  const last = rows[rows.length - 1];
  if (!last || last.key.trim() || last.value.trim()) rows.push(newRow());
  return rows;
}

export default function RequestBuilder({
  request,
  onChange,
  onSave,
  saveStatus,
  saveMessage,
  onSend,
  onGenerateCode,
  loading,
  activeEnv,
  onCancel,
  onCreateEnvVar
}: RequestBuilderProps) {
  const [activeTab, setActiveTab] = useState<TabType>("params");
  const [bodyTab, setBodyTab] = useState<BodyType>(request.body.type);
  const [scriptTab, setScriptTab] = useState<"pre" | "post">("pre");
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestTriggerPos, setSuggestTriggerPos] = useState<{ start: number; end: number } | null>(null);

  const methodRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBodyTab(request.body.type);
  }, [request.body.type, request.id]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (methodRef.current && !methodRef.current.contains(event.target as Node)) {
        setShowMethodDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateRequest = (fields: Partial<ClotientRequest>) => onChange({ ...request, ...fields });
  const updateBody = (fields: Partial<ClotientRequest["body"]>) => onChange({ ...request, body: { ...request.body, ...fields } });

  const updateKeyValue = (
    list: KeyValue[],
    index: number,
    fields: Partial<KeyValue>,
    save: (rows: KeyValue[]) => void
  ) => {
    const next = [...list];
    next[index] = { ...next[index], ...fields };
    if (index === list.length - 1 && (fields.key !== undefined || fields.value !== undefined)) {
      next.push(newRow());
    }
    save(next.filter((row, rowIndex) => rowIndex === next.length - 1 || row.key.trim() || row.value.trim() || row.description?.trim()));
  };

  const deleteKeyValue = (list: KeyValue[], index: number, save: (rows: KeyValue[]) => void) => {
    save(list.filter((_, rowIndex) => rowIndex !== index));
  };

  const syncParamsToUrl = (rows: KeyValue[]) => {
    const enabled = rows.filter((row) => row.enabled && row.key.trim());
    const baseUrl = request.url.split("?")[0];
    if (enabled.length === 0) {
      updateRequest({ params: rows, url: baseUrl });
      return;
    }
    const params = new URLSearchParams();
    enabled.forEach((row) => params.append(row.key, row.value));
    updateRequest({ params: rows, url: `${baseUrl}?${params.toString()}` });
  };

  const handleUrlChange = (value: string) => {
    const queryIndex = value.indexOf("?");
    if (queryIndex >= 0) {
      const params = new URLSearchParams(value.slice(queryIndex + 1));
      const rows: KeyValue[] = [];
      params.forEach((paramValue, key) => {
        rows.push({ ...newRow(), key, value: paramValue });
      });
      onChange({ ...request, url: value, params: rows });
      return;
    }
    updateRequest({ url: value });
  };

  const availableVars = activeEnv?.variables.filter((variable) => variable.enabled && variable.key.trim()) || [];

  const handleUrlInput = (value: string, cursor: number) => {
    handleUrlChange(value);
    const beforeCursor = value.slice(0, cursor);
    const openIndex = beforeCursor.lastIndexOf("{{");
    const closeIndex = beforeCursor.lastIndexOf("}}");
    if (openIndex >= 0 && openIndex > closeIndex) {
      const query = beforeCursor.slice(openIndex + 2);
      const matches = availableVars
        .map((variable) => variable.key)
        .filter((key) => key.toLowerCase().includes(query.toLowerCase()));
      if (activeEnv && query.trim() && !matches.some((match) => match.toLowerCase() === query.toLowerCase())) {
        matches.push(`__create_var:${query.trim()}`);
      }
      if (matches.length > 0) {
        setSuggestions(matches);
        setSuggestionIndex(0);
        setSuggestTriggerPos({ start: openIndex, end: cursor });
        setShowSuggestions(true);
        return;
      }
    }
    setShowSuggestions(false);
  };

  const selectSuggestion = (index: number) => {
    if (!suggestTriggerPos || !urlRef.current) return;
    const selected = suggestions[index];
    const key = selected.startsWith("__create_var:") ? selected.slice("__create_var:".length) : selected;
    if (selected.startsWith("__create_var:")) {
      onCreateEnvVar?.(key, "");
    }

    const value = request.url;
    const before = value.slice(0, suggestTriggerPos.start);
    const nextCloseIndex = value.indexOf("}}", suggestTriggerPos.start);
    const after = nextCloseIndex >= 0 ? value.slice(nextCloseIndex + 2) : value.slice(suggestTriggerPos.end);
    const nextValue = `${before}{{${key}}}${after}`;
    handleUrlChange(nextValue);
    setShowSuggestions(false);
    setTimeout(() => {
      urlRef.current?.focus();
      const cursor = suggestTriggerPos.start + key.length + 4;
      urlRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "params", label: "Params", count: request.params.filter((row) => row.enabled && row.key).length },
    { id: "auth", label: "Auth" },
    { id: "headers", label: "Headers", count: request.headers.filter((row) => row.enabled && row.key).length },
    { id: "body", label: "Body" },
    { id: "scripts", label: "Scripts" }
  ];

  const methods: ClotientRequest["method"][] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col bg-white">
      <div className="px-5 pt-4 pb-4 border-b border-slate-200">
        <div className="flex items-center justify-end gap-2 mb-3">
            <span className="h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {activeEnv ? activeEnv.name : "No environment"}
            </span>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <div className="relative" ref={methodRef}>
            <button
              onClick={() => setShowMethodDropdown((prev) => !prev)}
              className="h-11 w-[104px] rounded-md border border-slate-200 bg-white flex items-center justify-between px-3 hover:bg-slate-50"
            >
              <span className={methodClass(request.method)}>{request.method}</span>
              <ChevronDown size={15} className="text-slate-400" />
            </button>
            {showMethodDropdown && (
              <div className="absolute z-50 mt-1 w-[124px] rounded-md border border-slate-200 bg-white shadow-xl overflow-hidden">
                {methods.map((method) => (
                  <button
                    key={method}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      updateRequest({ method });
                      setShowMethodDropdown(false);
                    }}
                  >
                    <span className={methodClass(method)}>{method}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex-1 min-w-0">
            <input
              ref={urlRef}
              value={request.url}
              onChange={(event) => handleUrlInput(event.target.value, event.target.selectionStart || 0)}
              onKeyDown={(event) => {
                if (showSuggestions) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSuggestionIndex((prev) => (prev + 1) % suggestions.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                  } else if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    selectSuggestion(suggestionIndex);
                  } else if (event.key === "Escape") {
                    setShowSuggestions(false);
                  }
                } else if (event.key === "Enter" && !loading) {
                  onSend();
                }
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
              placeholder="https://api.example.com/v1/users"
              className="w-full h-11 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-[48px] rounded-md border border-slate-200 bg-white shadow-xl overflow-hidden">
                {suggestions.map((suggestion, index) => {
                  const create = suggestion.startsWith("__create_var:");
                  const key = create ? suggestion.slice("__create_var:".length) : suggestion;
                  return (
                    <button
                      key={suggestion}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between ${
                        index === suggestionIndex ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(index);
                      }}
                    >
                      <span className="font-mono">{create ? `Create {{${key}}}` : `{{${key}}}`}</span>
                      {!create && <span className="truncate text-slate-400 max-w-[240px]">{activeEnv?.variables.find((v) => v.key === key)?.value}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {loading ? (
            <button className="h-11 px-5 rounded-md border border-red-200 bg-red-50 text-red-700 font-semibold text-sm flex items-center gap-2" onClick={onCancel}>
              <StopCircle size={16} /> Cancel
            </button>
          ) : (
            <button className="ct-primary h-11 px-6 flex items-center gap-2" onClick={onSend}>
              <Send size={16} /> Send
            </button>
          )}
          <button
            className={`ct-secondary h-11 px-4 flex items-center gap-2 ${
              saveStatus === "error" ? "ct-save-error" : saveStatus === "saved" ? "ct-save-ok" : saveStatus === "dirty" ? "ct-save-dirty" : ""
            }`}
            title={saveMessage}
            onClick={onSave}
            disabled={saveStatus === "saving"}
          >
            {saveStatus === "saved" ? <CheckCircle2 size={15} /> : <Save size={15} />}
            {saveStatus === "saving" ? "Saving..." : saveStatus === "error" ? "Failed" : saveStatus === "saved" ? "Saved" : saveStatus === "dirty" ? "Unsaved" : "Save"}
          </button>
          <button className="ct-icon-button !h-11 !w-11" title="Generate code" onClick={onGenerateCode}>
            <Code2 size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 h-12 border-b border-slate-200 flex items-end gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-12 border-b-2 text-sm font-semibold flex items-center gap-2 ${
              activeTab === tab.id ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-slate-100 text-[11px] text-slate-600 flex items-center justify-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-5 bg-slate-50/60">
        {activeTab === "params" && (
          <KeyValueTable
            rows={withTrailingRow(request.params)}
            showDescription
            onChange={(index, fields) => updateKeyValue(withTrailingRow(request.params), index, fields, syncParamsToUrl)}
            onDelete={(index) => deleteKeyValue(request.params, index, syncParamsToUrl)}
          />
        )}

        {activeTab === "headers" && (
          <KeyValueTable
            rows={withTrailingRow(request.headers)}
            showDescription
            onChange={(index, fields) => updateKeyValue(withTrailingRow(request.headers), index, fields, (rows) => updateRequest({ headers: rows }))}
            onDelete={(index) => deleteKeyValue(request.headers, index, (rows) => updateRequest({ headers: rows }))}
          />
        )}

        {activeTab === "auth" && (
          <div className="ct-panel p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Type</label>
              <select
                value={request.auth.type}
                onChange={(event) => updateRequest({ auth: { type: event.target.value as ClotientRequest["auth"]["type"] } })}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
              </select>
            </div>
            {request.auth.type === "bearer" && (
              <Field label="Bearer token">
                <input
                  value={request.auth.bearerToken || ""}
                  onChange={(event) => updateRequest({ auth: { ...request.auth, bearerToken: event.target.value } })}
                  placeholder="{{token}}"
                  className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 font-mono"
                />
              </Field>
            )}
            {request.auth.type === "basic" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username">
                  <input
                    value={request.auth.basicUsername || ""}
                    onChange={(event) => updateRequest({ auth: { ...request.auth, basicUsername: event.target.value } })}
                    className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    value={request.auth.basicPassword || ""}
                    onChange={(event) => updateRequest({ auth: { ...request.auth, basicPassword: event.target.value } })}
                    className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        {activeTab === "body" && (
          <div className="space-y-3">
            <div className="ct-panel p-1 inline-flex gap-1">
              {(["none", "json", "raw", "urlencoded", "form-data"] as BodyType[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setBodyTab(mode);
                    updateBody({ type: mode });
                  }}
                  className={`h-8 px-3 rounded-md text-xs font-semibold ${
                    bodyTab === mode ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {mode === "urlencoded" ? "x-www-form-urlencoded" : mode}
                </button>
              ))}
            </div>
            {bodyTab === "none" && <EmptyPanel text="This request does not send a body." />}
            {(bodyTab === "json" || bodyTab === "raw") && (
              <textarea
                value={request.body.rawText || ""}
                onChange={(event) => updateBody({ rawText: event.target.value })}
                placeholder={bodyTab === "json" ? '{\n  "name": "Jane"\n}' : "Raw body"}
                className="w-full min-h-[280px] ct-panel p-4 resize-y font-mono text-sm text-slate-800 outline-none focus:border-blue-400"
              />
            )}
            {bodyTab === "urlencoded" && (
              <KeyValueTable
                rows={withTrailingRow(request.body.urlencoded || [])}
                onChange={(index, fields) => updateKeyValue(withTrailingRow(request.body.urlencoded || []), index, fields, (rows) => updateBody({ urlencoded: rows }))}
                onDelete={(index) => deleteKeyValue(request.body.urlencoded || [], index, (rows) => updateBody({ urlencoded: rows }))}
              />
            )}
            {bodyTab === "form-data" && (
              <KeyValueTable
                rows={withTrailingRow(request.body.formData || [])}
                onChange={(index, fields) => updateKeyValue(withTrailingRow(request.body.formData || []), index, fields, (rows) => updateBody({ formData: rows }))}
                onDelete={(index) => deleteKeyValue(request.body.formData || [], index, (rows) => updateBody({ formData: rows }))}
              />
            )}
          </div>
        )}

        {activeTab === "scripts" && (
          <div className="space-y-3">
            <div className="ct-panel p-1 inline-flex gap-1">
              <button
                onClick={() => setScriptTab("pre")}
                className={`h-8 px-3 rounded-md text-xs font-semibold ${scriptTab === "pre" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
              >
                Pre-request
              </button>
              <button
                onClick={() => setScriptTab("post")}
                className={`h-8 px-3 rounded-md text-xs font-semibold ${scriptTab === "post" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
              >
                Tests
              </button>
            </div>
            <textarea
              value={scriptTab === "pre" ? request.scripts.preRequest : request.scripts.postRequest}
              onChange={(event) =>
                updateRequest({
                  scripts:
                    scriptTab === "pre"
                      ? { ...request.scripts, preRequest: event.target.value }
                      : { ...request.scripts, postRequest: event.target.value }
                })
              }
              placeholder={scriptTab === "pre" ? 'cs.log("Preparing request");' : 'cs.assert(cs.response.status === 200, "Status is OK");'}
              className="w-full min-h-[300px] ct-panel p-4 resize-y font-mono text-sm text-slate-800 outline-none focus:border-blue-400"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="ct-panel h-40 flex items-center justify-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function KeyValueTable({
  rows,
  showDescription,
  onChange,
  onDelete
}: {
  rows: KeyValue[];
  showDescription?: boolean;
  onChange: (index: number, fields: Partial<KeyValue>) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <div className="ct-panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="w-11 p-2 text-center">On</th>
            <th className="p-2 text-left">Key</th>
            <th className="p-2 text-left">Value</th>
            {showDescription && <th className="p-2 text-left">Description</th>}
            <th className="w-10 p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isLast = index === rows.length - 1;
            return (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(event) => onChange(index, { enabled: event.target.checked })}
                  />
                </td>
                <td className="p-2">
                  <input
                    value={row.key}
                    onChange={(event) => onChange(index, { key: event.target.value })}
                    placeholder="Key"
                    className="w-full bg-transparent outline-none font-mono text-xs text-slate-800"
                  />
                </td>
                <td className="p-2">
                  <input
                    value={row.value}
                    onChange={(event) => onChange(index, { value: event.target.value })}
                    placeholder="Value"
                    className="w-full bg-transparent outline-none font-mono text-xs text-slate-700"
                  />
                </td>
                {showDescription && (
                  <td className="p-2">
                    <input
                      value={row.description || ""}
                      onChange={(event) => onChange(index, { description: event.target.value })}
                      placeholder="Description"
                      className="w-full bg-transparent outline-none text-xs text-slate-600"
                    />
                  </td>
                )}
                <td className="p-2 text-center">
                  {!isLast && (
                    <button className="text-slate-400 hover:text-red-600" onClick={() => onDelete(index)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
