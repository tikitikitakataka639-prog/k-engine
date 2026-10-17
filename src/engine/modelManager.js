// ModelManager: ÚNICA capa que decide el estado de los modelos.
//
// Ciclo de vida KERNEL:
//   CÓDIGO (modelRegistry) → DESCARGAR → Cache del navegador → FORMATEAR → solo código.
//
// Estados: CHECKING · NOT_DOWNLOADED · DOWNLOADED · DOWNLOADING · LOADING ·
//   VERIFYING · READY · GENERATING · UNLOADING · DELETING · ERROR
import { loadCatalog, loadWebLLM, DEFAULT_MODEL_ID, buildKernelAppConfig } from "./models";
import { classifyModel } from "./hardware";
import { saveModelMeta, deleteModelMeta } from "./storage";

export const ACTIVE = ["DOWNLOADING", "LOADING", "VERIFYING", "UNLOADING", "DELETING"];
export const IN_MEMORY = ["READY", "GENERATING"];

const blankModel = () => ({ status: "CHECKING", cached: null, progress: null, text: "", error: null, lastAction: null });

function storageUsage() {
  return navigator.storage && navigator.storage.estimate
    ? navigator.storage.estimate().then((e) => e.usage ?? null).catch(() => null)
    : Promise.resolve(null);
}

class ModelManager {
  constructor() {
    this.listeners = new Set();
    this.messageListeners = new Set();
    this.worker = null;
    this.hw = null;
    this.manual = {};
    this.op = null;
    this.snapshot = {
      ready: false,
      initError: null,
      catalog: { models: [], featured: [], missingFeatured: [], version: null, total: 0, appConfig: null },
      models: {},
      selectedId: DEFAULT_MODEL_ID,
      loadedId: null,
      opKind: null,
      opId: null,
      cacheApiOk: typeof caches !== "undefined",
    };
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  onMessage(fn) {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }
  #set(patch) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }
  #patchModel(id, patch) {
    const prev = this.snapshot.models[id] || blankModel();
    this.#set({ models: { ...this.snapshot.models, [id]: { ...prev, ...patch } } });
  }

  /** appConfig KERNEL (código). Fallback si el catálogo aún no está listo. */
  async #appConfig() {
    if (this.snapshot.catalog?.appConfig) return this.snapshot.catalog.appConfig;
    const webllm = await loadWebLLM();
    const { appConfig } = buildKernelAppConfig(webllm.prebuiltAppConfig);
    return appConfig;
  }

  async init() {
    if (this.snapshot.ready) return;
    try {
      const catalog = await loadCatalog();
      const selectedId = catalog.featured.find((m) => m.id === this.snapshot.selectedId)
        ? this.snapshot.selectedId
        : (catalog.featured[0] || catalog.models[0]).id;
      this.#set({ catalog, selectedId, ready: true, initError: null });
      await Promise.all(catalog.featured.map((m) => this.refreshCache(m.id)));
    } catch (e) {
      this.#set({ initError: "No se pudo cargar la configuración de WebLLM: " + ((e && e.message) || e) });
    }
  }

  setHardware(hw, manual = {}) {
    this.hw = hw;
    this.manual = manual;
    this.#set({});
  }
  setManual(manual) {
    this.manual = manual;
    this.#set({});
  }

  select(id) {
    if (this.snapshot.catalog.models.some((m) => m.id === id)) {
      this.#set({ selectedId: id });
      if (!this.snapshot.models[id]) this.refreshCache(id);
    }
  }

  modelInfo(id) {
    return this.snapshot.catalog.models.find((m) => m.id === id) || null;
  }
  classify(id) {
    const m = this.modelInfo(id);
    return m ? classifyModel(m, this.hw, this.manual) : null;
  }

  /** Comprueba si los pesos están en el navegador (Cache). La ficha siempre está en código. */
  async refreshCache(id) {
    const cur = this.snapshot.models[id];
    if (cur && (ACTIVE.includes(cur.status) || IN_MEMORY.includes(cur.status))) return;
    this.#patchModel(id, { status: "CHECKING" });
    try {
      const webllm = await loadWebLLM();
      const appConfig = await this.#appConfig();
      const cached = await webllm.hasModelInCache(id, appConfig);
      const now = this.snapshot.models[id];
      if (now && (ACTIVE.includes(now.status) || IN_MEMORY.includes(now.status))) return;
      // cached=false → solo en código (NOT_DOWNLOADED)
      this.#patchModel(id, { cached, status: cached ? "DOWNLOADED" : "NOT_DOWNLOADED", error: null });
    } catch (e) {
      this.#patchModel(id, {
        cached: null,
        status: "NOT_DOWNLOADED",
        error: "No se pudo comprobar la Cache API: " + ((e && e.message) || e),
      });
    }
  }

  #worker() {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("../webllm/kengine-worker.js", import.meta.url), { type: "module" });
    w.addEventListener("message", (ev) => this.#onWorker(ev.data));
    w.addEventListener("error", (ev) => {
      const msg = "Error del worker: " + (ev.message || "no se pudo iniciar (¿fallo al importar WebLLM?)");
      this.#failOp(msg);
    });
    this.worker = w;
    return w;
  }
  #killWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }
  post(msg) {
    this.#worker().postMessage(msg);
  }

  #onWorker(d) {
    const id = this.op?.id || this.snapshot.loadedId;
    switch (d.type) {
      case "status":
        if (this.op && ["DOWNLOADING", "UNLOADING", "VERIFYING"].includes(d.value)) {
          this.#patchModel(this.op.id, { status: d.value, progress: d.value === "DOWNLOADING" ? 0 : null });
        }
        break;
      case "progress":
        if (this.op && this.op.kind === "load") {
          this.#patchModel(this.op.id, { status: d.phase, progress: Math.max(0, Math.min(1, d.progress)), text: d.text });
        }
        break;
      case "verified":
      case "ready":
        if (this.op && this.op.kind === "load") {
          const mid = this.op.id;
          this.#set({ loadedId: mid });
          this.#patchModel(mid, { status: "READY", cached: true, progress: 1, text: "", error: null });
          saveModelMeta(mid, { downloaded: true, lastReadyMs: d.ms ?? null });
          this.#finishOp();
        }
        break;
      case "genstart":
        if (id) this.#patchModel(id, { status: "GENERATING" });
        break;
      case "gendone":
        if (id) this.#patchModel(id, { status: "READY" });
        break;
      case "unloaded":
        if (this.op && this.op.kind === "unload") {
          const mid = this.op.id;
          this.#set({ loadedId: null });
          this.#patchModel(mid, { status: "DOWNLOADED", progress: null, text: "" });
          this.#finishOp();
          this.refreshCache(mid);
        }
        break;
      case "error":
        if (d.scope === "load") this.#failOp(d.message);
        else if (d.scope === "unload") this.#failOp(d.message, "READY");
        else if (d.scope === "generate" && id) this.#patchModel(id, { status: "READY" });
        break;
      case "cache_diag":
        if (this.op && this.op.kind === "load" && d.message) {
          this.#patchModel(this.op.id, { text: d.message });
        }
        if (
          d.phase === "CACHE_PUT" ||
          d.phase === "CACHE_PUT_REJECT" ||
          d.phase === "CACHE_ADD_FETCH_FAIL" ||
          d.phase === "CACHE_ADD_HTTP_FAIL"
        ) {
          console.warn("[K.ENGINE cache_diag]", d);
        } else if (d.phase === "CACHE_PUT_OK" || d.phase === "CACHE_ADD_OK") {
          console.info("[K.ENGINE cache_diag] OK", d.phase, d.url, d.contentLength);
        }
        break;
      default:
        break;
    }
    this.messageListeners.forEach((fn) => fn(d));
  }

  #startOp(id, kind) {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    this.op = { id, kind, promise, resolve };
    this.#set({ opKind: kind, opId: id });
  }
  #finishOp(result = { ok: true }) {
    const op = this.op;
    this.op = null;
    this.#set({ opKind: null, opId: null });
    if (op) op.resolve(result);
  }
  #failOp(message, fallbackStatus) {
    const op = this.op;
    if (!op) {
      const lid = this.snapshot.loadedId;
      if (lid) this.#patchModel(lid, { error: message });
      return;
    }
    const keepLoaded = fallbackStatus === "READY";
    if (!keepLoaded && op.kind !== "delete") {
      this.#killWorker();
      if (this.snapshot.loadedId === op.id) this.#set({ loadedId: null });
    }
    this.#patchModel(op.id, { status: keepLoaded ? "READY" : "ERROR", error: message, progress: null });
    this.#finishOp({ ok: false, error: message });
    if (!keepLoaded) this.refreshCacheAfterError(op.id);
  }
  async refreshCacheAfterError(id) {
    try {
      const webllm = await loadWebLLM();
      const appConfig = await this.#appConfig();
      const cached = await webllm.hasModelInCache(id, appConfig);
      this.#patchModel(id, { cached });
    } catch {
      /* mantiene el error original */
    }
  }

  /** DESCARGAR: ficha en código → pesos al navegador (Cache) + carga GPU. */
  download(id = this.snapshot.selectedId) {
    const info = this.modelInfo(id);
    if (!info) {
      return Promise.resolve({
        ok: false,
        error: "Modelo no está en el registro KERNEL (código): " + id,
      });
    }
    if (this.op) {
      if (this.op.id === id && this.op.kind === "load") return this.op.promise;
      return Promise.resolve({ ok: false, error: "Hay otra operación en curso (" + this.op.kind + " " + this.op.id + ")." });
    }
    const loaded = this.snapshot.loadedId;
    if (loaded === id) return Promise.resolve({ ok: true });
    const cls = this.classify(id);
    if (cls && cls.blocking) {
      const error = "No se intenta cargar " + id + ": " + cls.reasons[0];
      this.#patchModel(id, { status: "ERROR", error });
      return Promise.resolve({ ok: false, error });
    }
    if (this.snapshot.models[id]?.status === "GENERATING" || (loaded && this.snapshot.models[loaded]?.status === "GENERATING")) {
      return Promise.resolve({ ok: false, error: "Generación en curso." });
    }
    if (loaded) this.#patchModel(loaded, { status: "DOWNLOADED" });
    this.#set({ loadedId: null });
    this.#startOp(id, "load");
    this.#patchModel(id, { status: "DOWNLOADING", progress: 0, text: "Código → navegador…", error: null });
    this.post({ type: "load", model: id });
    return this.op.promise;
  }

  cancel() {
    if (!this.op || this.op.kind !== "load") return;
    const id = this.op.id;
    this.#killWorker();
    this.#finishOp({ ok: false, error: "cancelado" });
    this.#patchModel(id, {
      status: "NOT_DOWNLOADED",
      progress: null,
      text: "",
      error: "Descarga cancelada. Lo ya descargado se conserva en caché del navegador.",
    });
    this.refreshCache(id);
  }

  /** Liberar GPU/RAM; los pesos pueden seguir en Cache Storage. */
  unload() {
    const id = this.snapshot.loadedId;
    if (!id || this.op) return Promise.resolve({ ok: false, error: id ? "Operación en curso." : "No hay modelo cargado." });
    if (this.snapshot.models[id]?.status === "GENERATING") {
      return Promise.resolve({ ok: false, error: "Hay una generación en curso." });
    }
    this.#startOp(id, "unload");
    this.#patchModel(id, { status: "UNLOADING" });
    this.post({ type: "unload" });
    return this.op.promise;
  }

  cancelGenerate() {
    this.post({ type: "cancel" });
  }

  generate(job) {
    this.post({ type: "generate", ...job });
  }

  /**
   * FORMATEAR: borra los pesos del navegador.
   * La ficha del modelo permanece en el código (modelRegistry) → estado NOT_DOWNLOADED.
   */
  async deleteModel(id) {
    if (!this.modelInfo(id)) return { ok: false, error: "Modelo desconocido en el registro KERNEL." };
    if (this.op) return { ok: false, error: "Hay otra operación en curso." };
    const st = this.snapshot.models[id]?.status;
    if (IN_MEMORY.includes(st) || this.snapshot.loadedId === id) {
      return { ok: false, error: "Libera el modelo de memoria antes de formatearlo." };
    }
    this.#startOp(id, "delete");
    this.#patchModel(id, {
      status: "DELETING",
      error: null,
      progress: null,
      text: "Navegador → código (borrando pesos)…",
    });
    const before = await storageUsage();
    try {
      const webllm = await loadWebLLM();
      const appConfig = await this.#appConfig();
      const record = appConfig.model_list.find((r) => r.model_id === id);
      if (!record) throw new Error("Modelo no está en appConfig KERNEL: " + id);

      let prefix = String(record.model);
      if (!prefix.endsWith("/")) prefix += "/";
      if (!prefix.includes("/resolve/")) prefix += "resolve/main/";

      const remaining = async () => {
        try {
          return (await (await caches.open("webllm/model")).keys()).filter((r) => r.url.startsWith(prefix)).length;
        } catch {
          return null;
        }
      };
      const total = await remaining();
      await webllm.deleteModelAllInfoInCache(id, appConfig);

      const jsonUrl = new URL("ndarray-cache.json", prefix).href;
      const shardsLeft = async () => {
        try {
          return (await (await caches.open("webllm/model")).keys()).filter((r) => r.url.startsWith(prefix) && r.url !== jsonUrl).length;
        } catch {
          return null;
        }
      };
      for (let i = 0; i < 120; i++) {
        const left = await shardsLeft();
        if (total && left != null) {
          this.#patchModel(id, {
            progress: Math.max(0, 1 - left / total),
            text: "Eliminando del navegador: " + (total - left) + "/" + total,
          });
        }
        if (!left) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      try {
        await (await caches.open("webllm/model")).delete(jsonUrl);
      } catch {
        /* se detectará con hasModelInCache */
      }

      const still = await webllm.hasModelInCache(id, appConfig);
      const after = await storageUsage();
      await deleteModelMeta(id);
      const freed = before != null && after != null ? Math.max(0, before - after) : null;

      if (still) {
        this.#patchModel(id, {
          status: "DOWNLOADED",
          cached: true,
          text: "",
          error: "El borrado no fue completo: aún quedan datos en caché del navegador.",
        });
        this.#finishOp({ ok: false });
        return { ok: false, error: "El borrado no fue completo." };
      }

      // Pesos fuera del navegador → solo queda la definición en código
      this.#patchModel(id, {
        status: "NOT_DOWNLOADED",
        cached: false,
        text: "",
        error: null,
        lastAction: { type: "formatted_back_to_code", freedBytes: freed, at: Date.now() },
      });
      this.#finishOp();
      return { ok: true, freedBytes: freed };
    } catch (e) {
      const error = "Error al formatear (devolver a código): " + ((e && e.message) || e);
      this.#patchModel(id, { status: "ERROR", error, text: "" });
      this.#finishOp({ ok: false, error });
      this.refreshCacheAfterError(id);
      return { ok: false, error };
    }
  }

  retry(id = this.snapshot.selectedId) {
    return this.download(id);
  }

  dispose() {
    this.#killWorker();
  }
}

export const modelManager = new ModelManager();
