import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Plus, Trash2, Search, ChevronLeft, ChevronRight, Database, X, Check } from "lucide-react";

function getToken() {
  return (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "mock_init_data_for_dev";
}

async function adminApi<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface ColMeta { name: string; type: string; }
interface TableData { rows: Record<string, unknown>[]; columns: ColMeta[]; total: number; page: number; limit: number; }

function detectPk(columns: ColMeta[]): string {
  const preferred = ["id", "character_id", "user_id", "thread_id", "message_id", "record_id", "definition_id", "progress_id", "event_id", "word_id"];
  for (const p of preferred) {
    if (columns.find(c => c.name === p)) return p;
  }
  return columns[0]?.name ?? "id";
}

function cellDisplay(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function cellClass(type: string): string {
  if (type === "number") return "text-blue-300";
  if (type === "boolean") return "text-yellow-300";
  if (type === "object" || type === "array") return "text-purple-300";
  return "text-foreground";
}

const TABLES = [
  'users', 'characters', 'character_avatars', 'conversations',
  'affection_words', 'affection_word_triggers', 'user_character_intimacy',
  'trigger_words', 'transaction_logs', 'pending_grants', 'prices',
  'system_configurations', 'user_restrictions', 'vault_items', 'tickets',
  'helpdesk_messages', 'customer_support_messages', 'customer_service_threads',
  'quests', 'quest_completions', 'quest_progress', 'referral_rewards',
  'referral_logs', 'events', 'premium_tiers'
];

export function AdminDatabaseTab() {
  const [tables, setTables] = useState<string[]>(TABLES);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchCol, setSearchCol] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string> | null>(null);
  const [addingSaving, setAddingSaving] = useState(false);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadRows = useCallback(async (tbl: string, pg: number, srch: string, srcCol: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (srch && srcCol) { params.set("search", srch); params.set("searchCol", srcCol); }
      const d = await adminApi<TableData>("GET", `/admin/db/${tbl}?${params}`);
      setData(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (TABLES.length > 0) setSelectedTable(TABLES[0]);
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    setPage(1);
    setSearch("");
    setPendingSearch("");
    setSearchCol("");
    setEditingCell(null);
    setNewRowValues(null);
    setConfirmDeleteIdx(null);
    loadRows(selectedTable, 1, "", "");
  }, [selectedTable, loadRows]);

  useEffect(() => {
    if (!selectedTable) return;
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    autoRefreshRef.current = setInterval(() => {
      if (!saving && !editingCell && !newRowValues) {
        loadRows(selectedTable, page, search, searchCol);
      }
    }, 30_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [selectedTable, page, search, searchCol, saving, editingCell, newRowValues, loadRows]);

  useEffect(() => {
    if (editingCell && editInputRef.current) editInputRef.current.focus();
  }, [editingCell]);

  const pk = data ? detectPk(data.columns) : "id";
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const handleSearch = () => {
    if (!selectedTable) return;
    setSearch(pendingSearch);
    const col = searchCol || (data?.columns[0]?.name ?? "");
    setSearchCol(col);
    setPage(1);
    loadRows(selectedTable, 1, pendingSearch, col);
  };

  const clearSearch = () => {
    setPendingSearch("");
    setSearch("");
    setSearchCol("");
    if (selectedTable) loadRows(selectedTable, 1, "", "");
  };

  const changePage = (newPage: number) => {
    if (!selectedTable) return;
    setPage(newPage);
    loadRows(selectedTable, newPage, search, searchCol);
  };

  const startEdit = (rowIdx: number, col: string, currentVal: unknown) => {
    if (saving) return;
    setEditingCell({ rowIdx, col, value: cellDisplay(currentVal) });
  };

  const commitEdit = async () => {
    if (!editingCell || !selectedTable || !data) return;
    const row = data.rows[editingCell.rowIdx];
    const pkVal = String(row[pk] ?? "");
    if (!pkVal) { setEditingCell(null); return; }

    let parsedVal: unknown = editingCell.value;
    const colType = data.columns.find(c => c.name === editingCell.col)?.type ?? "string";
    if (colType === "number") parsedVal = Number(editingCell.value);
    else if (colType === "boolean") parsedVal = editingCell.value === "true";
    else if (colType === "object" || colType === "array") {
      try { parsedVal = JSON.parse(editingCell.value); } catch { /* keep string */ }
    }

    setSaving(true);
    try {
      await adminApi("PATCH", `/admin/db/${selectedTable}/${encodeURIComponent(pkVal)}?pk=${pk}`, { [editingCell.col]: parsedVal });
      setData(prev => {
        if (!prev) return prev;
        const rows = prev.rows.map((r, i) =>
          i === editingCell.rowIdx ? { ...r, [editingCell.col]: parsedVal } : r
        );
        return { ...prev, rows };
      });
      showToast("Cell saved");
    } catch (e) {
      showToast(String(e), false);
    } finally {
      setSaving(false);
      setEditingCell(null);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); void commitEdit(); }
    if (e.key === "Escape") setEditingCell(null);
  };

  const confirmDelete = async (rowIdx: number) => {
    if (!selectedTable || !data) return;
    const row = data.rows[rowIdx];
    const pkVal = String(row[pk] ?? "");
    if (!pkVal) return;
    setDeleting(true);
    try {
      await adminApi("DELETE", `/admin/db/${selectedTable}/${encodeURIComponent(pkVal)}?pk=${pk}`);
      setData(prev => prev ? { ...prev, rows: prev.rows.filter((_, i) => i !== rowIdx), total: prev.total - 1 } : prev);
      showToast("Row deleted");
    } catch (e) {
      showToast(String(e), false);
    } finally {
      setDeleting(false);
      setConfirmDeleteIdx(null);
    }
  };

  const startAddRow = () => {
    if (!data) return;
    const blank: Record<string, string> = {};
    data.columns.forEach(c => { blank[c.name] = ""; });
    setNewRowValues(blank);
  };

  const saveNewRow = async () => {
    if (!selectedTable || !newRowValues) return;
    const body: Record<string, unknown> = {};
    Object.entries(newRowValues).forEach(([k, v]) => {
      if (v !== "") {
        const col = data?.columns.find(c => c.name === k);
        if (col?.type === "number") body[k] = Number(v);
        else if (col?.type === "boolean") body[k] = v === "true";
        else if (col?.type === "object" || col?.type === "array") {
          try { body[k] = JSON.parse(v); } catch { body[k] = v; }
        } else body[k] = v;
      }
    });
    setAddingSaving(true);
    try {
      const result = await adminApi<{ row: Record<string, unknown> }>("POST", `/admin/db/${selectedTable}`, body);
      if (result.row) {
        setData(prev => prev ? { ...prev, rows: [result.row, ...prev.rows], total: prev.total + 1 } : prev);
      }
      setNewRowValues(null);
      showToast("Row added");
    } catch (e) {
      showToast(String(e), false);
    } finally {
      setAddingSaving(false);
    }
  };

  return (
    <div className="flex gap-0 h-[calc(100vh-200px)] min-h-[500px] rounded-xl border border-border overflow-hidden bg-card">

      {/* ── Left Sidebar ── */}
      <div className="w-40 shrink-0 border-r border-border bg-background/60 flex flex-col">
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border">
          <Database size={13} className="text-accent shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Tables</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tablesLoading ? (
            <div className="p-3 text-[10px] text-muted-foreground">Probing tables…</div>
          ) : tables.length === 0 ? (
            <div className="p-3 text-[10px] text-muted-foreground">No tables found</div>
          ) : (
            tables.map(t => (
              <button
                key={t}
                onClick={() => setSelectedTable(t)}
                className={`w-full text-left px-3 py-2 text-[10px] font-mono truncate transition-colors ${
                  selectedTable === t
                    ? "bg-accent/20 text-accent border-l-2 border-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                {t}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          <span className="text-[11px] font-bold text-foreground/60 font-mono shrink-0">
            {selectedTable ?? "—"}
          </span>
          {data && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {data.total} rows
            </span>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {/* Search */}
            {data && data.columns.length > 0 && (
              <>
                <select
                  value={searchCol || data.columns[0]?.name}
                  onChange={e => setSearchCol(e.target.value)}
                  className="h-7 text-[10px] bg-background border border-border rounded-lg px-1.5 text-foreground"
                >
                  {data.columns.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <input
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Search…"
                  className="h-7 text-[10px] bg-background border border-border rounded-lg px-2 w-28 text-foreground placeholder:text-muted-foreground"
                />
                <button onClick={handleSearch} className="h-7 w-7 flex items-center justify-center rounded-lg bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20">
                  <Search size={11} />
                </button>
                {search && (
                  <button onClick={clearSearch} className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground">
                    <X size={11} />
                  </button>
                )}
              </>
            )}

            {/* Add Row */}
            {selectedTable && data && (
              <button
                onClick={startAddRow}
                disabled={!!newRowValues}
                className="h-7 flex items-center gap-1 px-2 rounded-lg bg-green-500/10 border border-green-500/40 text-green-400 text-[10px] font-bold hover:bg-green-500/20 disabled:opacity-40"
              >
                <Plus size={11} /> Add
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={() => selectedTable && loadRows(selectedTable, page, search, searchCol)}
              disabled={loading}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-3 py-2 text-[10px] text-red-400 border-b border-border bg-red-500/5">{error}</div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          {!selectedTable ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a table</div>
          ) : loading && !data ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
          ) : data && data.columns.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No rows found</div>
          ) : data ? (
            <table className="w-full text-[10px] border-collapse">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th className="w-8 px-1 py-1.5 border-b border-r border-border text-center text-muted-foreground font-normal shrink-0">#</th>
                  {data.columns.map(col => (
                    <th
                      key={col.name}
                      className={`px-2 py-1.5 border-b border-r border-border text-left font-bold whitespace-nowrap ${
                        col.name === pk ? "text-accent" : "text-foreground/80"
                      }`}
                    >
                      {col.name}
                      {col.name === pk && <span className="ml-1 text-[8px] text-accent/60">PK</span>}
                    </th>
                  ))}
                  <th className="w-12 px-1 py-1.5 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {/* New row input */}
                {newRowValues && (
                  <tr className="bg-green-500/5 border-b border-green-500/20">
                    <td className="px-1 py-1 border-r border-border text-center text-muted-foreground">+</td>
                    {data.columns.map(col => (
                      <td key={col.name} className="px-1 py-0.5 border-r border-border">
                        <input
                          value={newRowValues[col.name] ?? ""}
                          onChange={e => setNewRowValues(prev => prev ? { ...prev, [col.name]: e.target.value } : prev)}
                          placeholder={col.type}
                          className="w-full h-6 bg-green-500/10 border border-green-500/30 rounded px-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-green-400"
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <div className="flex gap-0.5">
                        <button
                          onClick={saveNewRow}
                          disabled={addingSaving}
                          className="h-6 w-6 flex items-center justify-center rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-40"
                        >
                          <Check size={10} />
                        </button>
                        <button
                          onClick={() => setNewRowValues(null)}
                          className="h-6 w-6 flex items-center justify-center rounded bg-muted/30 text-muted-foreground hover:text-foreground"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {data.rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`border-b border-border/50 hover:bg-white/3 transition-colors ${
                      confirmDeleteIdx === rowIdx ? "bg-red-500/10" : ""
                    }`}
                  >
                    <td className="px-1 py-1 border-r border-border/50 text-center text-muted-foreground/50 font-mono">
                      {(page - 1) * 50 + rowIdx + 1}
                    </td>
                    {data.columns.map(col => {
                      const isEditing = editingCell?.rowIdx === rowIdx && editingCell.col === col.name;
                      const val = row[col.name];
                      return (
                        <td
                          key={col.name}
                          className="px-2 py-1 border-r border-border/50 max-w-[180px]"
                          onClick={() => !isEditing && startEdit(rowIdx, col.name, val)}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              value={editingCell.value}
                              onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : prev)}
                              onKeyDown={handleCellKeyDown}
                              onBlur={() => void commitEdit()}
                              className="w-full h-5 bg-accent/10 border border-accent/50 rounded px-1 text-[10px] text-foreground outline-none"
                            />
                          ) : (
                            <span
                              className={`block truncate cursor-pointer hover:bg-white/5 rounded px-0.5 font-mono ${cellClass(col.type)} ${val === null || val === undefined ? "text-muted-foreground/30 italic" : ""}`}
                              title={cellDisplay(val)}
                            >
                              {val === null || val === undefined ? "null" : cellDisplay(val)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1">
                      {confirmDeleteIdx === rowIdx ? (
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => void confirmDelete(rowIdx)}
                            disabled={deleting}
                            className="h-6 w-6 flex items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-40"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteIdx(null)}
                            className="h-6 w-6 flex items-center justify-center rounded bg-muted/30 text-muted-foreground hover:text-foreground"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteIdx(rowIdx)}
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border shrink-0">
            <button
              onClick={() => changePage(page - 1)}
              disabled={page <= 1 || loading}
              className="h-7 px-2 flex items-center gap-1 rounded-lg bg-muted/30 border border-border text-[10px] text-foreground/70 hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft size={11} /> Prev
            </button>
            <span className="text-[10px] text-muted-foreground">
              Page {page} of {totalPages} · {data.total} rows
            </span>
            <button
              onClick={() => changePage(page + 1)}
              disabled={page >= totalPages || loading}
              className="h-7 px-2 flex items-center gap-1 rounded-lg bg-muted/30 border border-border text-[10px] text-foreground/70 hover:text-foreground disabled:opacity-30"
            >
              Next <ChevronRight size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-[11px] font-bold shadow-lg border ${
          toast.ok ? "bg-green-500/20 border-green-500/40 text-green-300" : "bg-red-500/20 border-red-500/40 text-red-300"
        }`}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}
    </div>
  );
}
