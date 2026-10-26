import { useEffect, useRef, useState } from "react";
import { useEngine } from "../engine/EngineProvider";
import { MAX_ATTACHMENT_BYTES, validateTextAttachment } from "../engine/toolCalling.js";

export function Chat() {
  const { messages, toolActivity, loadedId, selectedId, models, labError, sendChat, chatReady, resetChat, generating } = useEngine();
  const labStatus = (loadedId && models[loadedId]?.status) || "OFFLINE";
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const n = scrollRef.current;
    if (n) n.scrollTop = n.scrollHeight;
  }, [messages]);

  return (
    <div className="lg:col-span-8">
      <div className="bg-ink-900 border border-ink-600 rounded-lg overflow-hidden flex flex-col h-[560px]" data-testid="lab-chat">
        <div className="px-5 py-3 border-b border-ink-700 bg-ink-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-volt">K.ENGINE MODEL LAB</p>
            <p className="font-mono text-[11px] text-slate-500 mt-0.5">
              MODEL: <span id="labModelName" className="text-slate-300">{loadedId ? loadedId : "— (ninguno cargado: " + selectedId + " seleccionado)"}</span>
            </p>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400 flex gap-3 flex-wrap">
            <span>
              DEVICE: <span className="text-slate-200">[GPU]</span>
            </span>
            <span>
              STATUS: <span id="labStatus" className="text-slate-200">{labStatus}</span>
            </span>
            <span className="text-volt">PERSONALITY: KERNEL</span>
            <button type="button" className="underline hover:text-white" onClick={resetChat} disabled={generating}>LIMPIAR</button>
            <span className="text-amber2">MODE: ISOLATED</span>
          </div>
        </div>
        <div id="chatScroll" ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto p-5 space-y-4 font-mono text-[13px] leading-relaxed">
          <div className="text-slate-500 text-xs border border-ink-700 rounded-md p-4 bg-ink-950/60">
            Sesión de prueba aislada. Descarga y carga el modelo con <span className="text-volt">DESCARGAR</span>. Cuando el estado sea{" "}
            <span className="text-volt">READY</span>, escribe un mensaje y el modelo generará respuesta real con streaming local. Nada de esta sesión toca
            KERNEL.
          </div>
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  (m.role === "user"
                    ? "bg-volt/10 border border-volt/30 text-slate-100"
                    : "bg-ink-800 border border-ink-600 text-slate-200") +
                  " rounded-lg px-4 py-2.5 max-w-[85%] whitespace-pre-wrap break-words"
                }
              >
                <span className={"block text-[10px] uppercase tracking-widest mb-1 " + (m.role === "user" ? "text-volt" : "text-slate-500")}>
                  {m.role === "user" ? "USER" : "KERNEL"}
                </span>
                <span className="content" data-testid={m.role === "user" ? "msg-user" : "msg-kernel"}>{m.content}</span>
              </div>
            </div>
          ))}
          {toolActivity.map((tool, i) => (
            <div key={`${tool.name}-${i}`} className="border border-ink-600 rounded-md px-3 py-2 text-xs text-slate-300" data-testid="tool-activity">
              <span className="text-volt">{tool.name}</span>
              <span className="mx-2 text-slate-500">{tool.status === "running" ? "en curso" : tool.status === "done" ? "completada" : "fallida"}</span>
              <span className="whitespace-pre-wrap break-words">{tool.summary}</span>
            </div>
          ))}
        </div>
        <form
          id="labForm"
          className="border-t border-ink-700 bg-ink-800 p-4 flex flex-wrap gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            let selectedAttachment = null;
            if (attachment) {
              try {
                const checked = validateTextAttachment({ name: attachment.name, text: await attachment.text() });
                if (!checked.ok) {
                  setAttachmentError(checked.error);
                  return;
                }
                selectedAttachment = checked.attachment;
              } catch (error) {
                setAttachmentError(`No se pudo leer el archivo local: ${String(error?.message || error)}`);
                return;
              }
            }
            if (sendChat(text, selectedAttachment)) {
              setText("");
              setAttachment(null);
              setAttachmentError("");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }
          }}
        >
          <div className="w-full flex items-center gap-2 text-xs text-slate-400">
            <button type="button" className="underline hover:text-white disabled:opacity-40" disabled={!chatReady} onClick={() => fileInputRef.current?.click()}>
              Adjuntar TXT/MD/CSV/JSON/LOG (solo local)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.log,text/plain,text/csv,application/json"
              className="hidden"
              data-testid="local-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setAttachment(file);
                setAttachmentError("");
                if (!file) return;
                if (file.size > MAX_ATTACHMENT_BYTES) {
                  setAttachmentError(`El archivo supera el límite de ${MAX_ATTACHMENT_BYTES} bytes.`);
                  setAttachment(null);
                  e.target.value = "";
                } else if (!validateTextAttachment({ name: file.name, text: "" }).ok) {
                  setAttachmentError("Formato no admitido. Adjunta TXT, MD, CSV, JSON o LOG.");
                  setAttachment(null);
                  e.target.value = "";
                } else if (file.name.length > 180) {
                  setAttachmentError("El nombre del archivo supera el límite permitido.");
                  setAttachment(null);
                  e.target.value = "";
                }
              }}
            />
            {attachment ? <span className="truncate">{attachment.name} · {attachment.size} bytes</span> : null}
            {attachmentError ? <span role="alert" className="text-red2">{attachmentError}</span> : null}
          </div>
          <input
            id="labInput"
            type="text"
            autoComplete="off"
            placeholder="Escribir mensaje…"
            className="flex-1 bg-ink-950 border border-ink-600 rounded-md px-4 py-2.5 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-volt/60 disabled:opacity-40"
            disabled={!chatReady}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="submit"
            className="bg-volt text-ink-950 font-semibold text-sm px-5 py-2.5 rounded-md hover:bg-emerald-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!chatReady}
          >
            Enviar
          </button>
        </form>
      </div>
      <p id="labError" className={`${labError ? "" : "hidden"} mt-3 font-mono text-xs text-red2 bg-red2/10 border border-red2/30 rounded p-3 break-words`}>
        {labError}
      </p>
    </div>
  );
}
