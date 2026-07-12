import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { ClotientRequest, Environment } from "../types";
import { resolveVariables } from "../utils/envResolver";
import {
  generateCurl,
  generatePythonRequests,
  generatePythonHttpClient,
  generateJsAxios,
  generateJsFetch,
  generateRustReqwest
} from "../utils/codeGenerators";

interface CodeGeneratorProps {
  request: ClotientRequest;
  activeEnv: Environment | null;
  onClose: () => void;
}

type Lang = "curl" | "pyRequests" | "pyHttp" | "jsAxios" | "jsFetch" | "rust";

export default function CodeGenerator({ request, activeEnv, onClose }: CodeGeneratorProps) {
  const [activeLang, setActiveLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  // 1. Resolve URL, Headers and Body Text using Environment variables
  const resolvedUrl = resolveVariables(request.url, activeEnv);
  
  const resolvedHeaders = request.headers.map((h) => ({
    ...h,
    value: resolveVariables(h.value, activeEnv)
  }));

  // Resolve body text
  let bodyText = "";
  if (request.body.type === "json" || request.body.type === "raw") {
    bodyText = resolveVariables(request.body.rawText, activeEnv);
  } else if (request.body.type === "urlencoded") {
    const list = (request.body.urlencoded || [])
      .filter((x) => x.enabled && x.key)
      .map((x) => `${encodeURIComponent(x.key)}=${encodeURIComponent(resolveVariables(x.value, activeEnv))}`);
    bodyText = list.join("&");
  } else if (request.body.type === "form-data") {
    const list = (request.body.formData || [])
      .filter((x) => x.enabled && x.key)
      .map((x) => `${x.key}: ${resolveVariables(x.value, activeEnv)}`);
    bodyText = list.join("\n");
  }

  // 2. Generate code content
  let codeSnippet = "";
  switch (activeLang) {
    case "curl":
      codeSnippet = generateCurl(request, resolvedUrl, resolvedHeaders, bodyText);
      break;
    case "pyRequests":
      codeSnippet = generatePythonRequests(request, resolvedUrl, resolvedHeaders, bodyText);
      break;
    case "pyHttp":
      codeSnippet = generatePythonHttpClient(request, resolvedUrl, resolvedHeaders, bodyText);
      break;
    case "jsAxios":
      codeSnippet = generateJsAxios(request, resolvedUrl, resolvedHeaders, bodyText);
      break;
    case "jsFetch":
      codeSnippet = generateJsFetch(request, resolvedUrl, resolvedHeaders, bodyText);
      break;
    case "rust":
      codeSnippet = generateRustReqwest(request, resolvedUrl, resolvedHeaders, bodyText);
      break;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const languages: { id: Lang; label: string }[] = [
    { id: "curl", label: "cURL" },
    { id: "pyRequests", label: "Python (Requests)" },
    { id: "pyHttp", label: "Python (http.client)" },
    { id: "jsAxios", label: "JS (Axios)" },
    { id: "jsFetch", label: "JS (Fetch)" },
    { id: "rust", label: "Rust (Reqwest)" }
  ];

  return (
    <div className="ct-modal-backdrop">
      <div className="ct-modal ct-code-modal">
        <div className="h-14 px-5 border-b border-slate-200 flex justify-between items-center bg-white">
          <h3 className="text-slate-900 font-semibold flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-600" />
            Generate Code
          </h3>
          <button onClick={onClose} className="ct-icon-button !h-8 !w-8">✕</button>
        </div>

        <div className="h-12 flex bg-white border-b border-slate-200 px-4 overflow-x-auto">
          {languages.map((lang) => (
            <button
              key={lang.id}
              className={`h-12 px-3 border-b-2 text-xs font-semibold whitespace-nowrap ${
                activeLang === lang.id
                  ? "border-blue-500 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveLang(lang.id)}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 p-4 bg-slate-50/70 flex flex-col overflow-hidden relative">
          <button
            onClick={handleCopy}
            className={`absolute top-6 right-6 h-9 px-3 rounded-md border text-xs font-semibold flex items-center gap-2 ${
              copied ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy
              </>
            )}
          </button>
          <pre className="flex-1 overflow-auto text-xs font-mono text-slate-800 bg-white border border-slate-200 p-4 pr-24 rounded-md leading-relaxed select-text">
            <code>{codeSnippet}</code>
          </pre>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex justify-end bg-white">
          <button onClick={onClose} className="ct-secondary h-9 px-4">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
