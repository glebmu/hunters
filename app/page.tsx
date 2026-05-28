"use client";

import { useEffect, useState, useCallback } from "react";

type Manager = {
  id: string;
  name: string;
  position: number;
  quotas: { quota: number }[];
  deals: { id: string }[];
};

type Deal = {
  id: string;
  dealLink: string;
  assignedAt: string;
};

type DealResult = {
  title: string;
  text: string;
  type: "new" | "existing" | "error";
};

type Role = "manager" | "user";

const AMO_BASE = "https://zhe.amocrm.ru/leads/detail/";

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function normalizeDealLink(input: string): string {
  const trimmed = input.trim();
  const pathMatch = trimmed.match(/\/leads\/detail\/(\d+)/);
  if (pathMatch) return AMO_BASE + pathMatch[1];
  const numberMatch = trimmed.match(/(\d+)/);
  if (numberMatch) return AMO_BASE + numberMatch[1];
  return trimmed;
}

function formatDate(dateStr: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(dateStr).toLocaleDateString("ru-RU", opts ?? {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    weekday: "short", day: "numeric", month: "short",
  });
}

export default function Home() {
  const today = toDateStr(new Date());

  // ── Auth gate ──────────────────────────────────────────────
  const [role, setRole] = useState<Role | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  // ── Date navigation ────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(today);
  const isPast = selectedDate < today;
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  // ── Data ───────────────────────────────────────────────────
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  // ── Deal processing ────────────────────────────────────────
  const [dealInput, setDealInput] = useState("");
  const [dealResult, setDealResult] = useState<DealResult | null>(null);
  const [processing, setProcessing] = useState(false);

  // ── Deals modal ────────────────────────────────────────────
  const [modal, setModal] = useState<{ manager: Manager; deals: Deal[] } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Plan next day ──────────────────────────────────────────
  const [copying, setCopying] = useState(false);

  const fetchManagers = useCallback(async (date: string) => {
    setLoading(true);
    const res = await fetch(`/api/managers?date=${date}`);
    setManagers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchManagers(selectedDate); }, [selectedDate, fetchManagers]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Auth ───────────────────────────────────────────────────
  function submitCode() {
    const code = codeInput.trim().toLowerCase();
    if (code === "manager") { setRole("manager"); }
    else if (code.length > 0) { setRole("user"); }
    else { setCodeError(true); }
  }

  // ── Plan next day ──────────────────────────────────────────
  async function planNextDay() {
    const tomorrow = addDays(today, 1);
    setCopying(true);
    await fetch("/api/quotas/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDate: today, toDate: tomorrow }),
    });
    setSelectedDate(tomorrow);
    setCopying(false);
  }

  // ── Deal processing ────────────────────────────────────────
  async function processDeal() {
    if (!dealInput.trim() || processing) return;
    const dealLink = normalizeDealLink(dealInput);
    setProcessing(true);
    setDealResult(null);
    try {
      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_link: dealLink }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDealResult({ type: "error", title: "Ошибка", text: data.error ?? "Не удалось обработать сделку" });
      } else if (data.existing) {
        const assignedDate = data.assignedDate
          ? new Date(data.assignedDate).toISOString().split("T")[0]
          : null;
        const isAssignedToday = assignedDate === today;
        const dateLabel = assignedDate
          ? new Date(assignedDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
          : null;
        setDealResult({
          type: "existing",
          title: "Уже есть",
          text: isAssignedToday
            ? `Сделка уже была назначена на ${data.manager}`
            : `Сделка уже была назначена на ${data.manager} (${dateLabel})`,
        });
      } else {
        setDealResult({ type: "new", title: "Сделка добавлена", text: `На сделку назначен менеджер ${data.manager}` });
        setDealInput("");
        fetchManagers(today);
      }
    } catch {
      setDealResult({ type: "error", title: "Ошибка", text: "Нет связи с сервером" });
    } finally {
      setProcessing(false);
    }
  }

  // ── Managers ───────────────────────────────────────────────
  async function addManager() {
    if (!newName.trim()) return;
    await fetch("/api/managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    fetchManagers(selectedDate);
  }

  async function updateQuota(managerId: string, quota: number) {
    await fetch("/api/quotas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId, date: selectedDate, quota }),
    });
    fetchManagers(selectedDate);
  }

  async function openDeals(manager: Manager) {
    if (manager.deals.length === 0) return;
    setModalLoading(true);
    setModal({ manager, deals: [] });
    const res = await fetch(`/api/deals?managerId=${manager.id}&date=${selectedDate}`);
    setModal({ manager, deals: await res.json() });
    setModalLoading(false);
  }

  function dealLabel(link: string) {
    const match = link.match(/\/(\d+)(?:\?|$)/);
    return match ? `Сделка #${match[1]}` : link;
  }

  const resultColors = {
    new: "bg-green-50 border-green-200 text-green-800",
    existing: "bg-amber-50 border-amber-200 text-amber-800",
    error: "bg-red-50 border-red-200 text-red-700",
  };

  // ── Gate ───────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Распределение сделок</h1>
          <p className="text-sm text-gray-500 mb-6">Введите кодовое слово для входа</p>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Кодовое слово"
              value={codeInput}
              autoFocus
              onChange={(e) => { setCodeInput(e.target.value); setCodeError(false); }}
              onKeyDown={(e) => e.key === "Enter" && submitCode()}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${codeError ? "border-red-400" : "border-gray-300"}`}
            />
            {codeError && <p className="text-xs text-red-500">Введите кодовое слово</p>}
            <button
              onClick={submitCode}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Войти
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Загрузка...</div>;
  }

  const canEdit = role === "manager" && !isPast;

  return (
    <>
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">

          {/* ── Top row: title + deal input ─────────────────── */}
          {isToday && (
            <div className="flex items-center justify-between gap-4 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 shrink-0">Распределение сделок</h1>
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="ID или ссылка на сделку"
                  value={dealInput}
                  onChange={(e) => { setDealInput(e.target.value); setDealResult(null); }}
                  onKeyDown={(e) => e.key === "Enter" && processDeal()}
                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={processDeal}
                  disabled={!dealInput.trim() || processing}
                  className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? "..." : "Обработать"}
                </button>
              </div>
            </div>
          )}

          {!isToday && (
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Распределение сделок</h1>
          )}

          {/* ── Date navigation ─────────────────────────────── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
                {isToday
                  ? formatDate(selectedDate)
                  : formatDate(selectedDate)}
              </span>

              <button
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {!isToday && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="ml-1 text-xs text-blue-600 hover:underline"
                >
                  Сегодня
                </button>
              )}
            </div>

            {/* Plan next day button — managers only, shown on today */}
            {role === "manager" && isToday && (
              <button
                onClick={planNextDay}
                disabled={copying}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {copying ? "Копирую..." : `Запланировать ${formatShortDate(addDays(today, 1))}`}
              </button>
            )}
          </div>

          {/* Day type label */}
          {isPast && (
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Прошедший день — только просмотр
            </div>
          )}
          {isFuture && role === "manager" && (
            <div className="flex items-center gap-2 mb-4 text-xs text-blue-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Планирование — можно задать нормы
            </div>
          )}

          {/* Deal result notification */}
          {dealResult && (
            <div className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-3 mb-5 ${resultColors[dealResult.type]}`}>
              <div>
                <p className="text-sm font-semibold">{dealResult.title}</p>
                <p className="text-sm mt-0.5">{dealResult.text}</p>
              </div>
              <button onClick={() => setDealResult(null)} className="mt-0.5 opacity-60 hover:opacity-100 transition-opacity shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Managers table ───────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Менеджер</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {isFuture ? "Запланировано" : "Норма"}
                  </th>
                  {!isFuture && (
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Сделок</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {managers.map((m) => {
                  const quota = m.quotas[0]?.quota ?? 0;
                  const dealsCount = m.deals.length;
                  const isActive = isToday && quota > 0 && dealsCount < quota;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-400">{m.position}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{m.name}</span>
                          {isActive && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">активен</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={quota}
                            onChange={(e) => updateQuota(m.id, parseInt(e.target.value) || 0)}
                            className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className={`text-sm font-medium ${quota > 0 ? "text-gray-700" : "text-gray-300"}`}>
                            {quota || "—"}
                          </span>
                        )}
                      </td>
                      {!isFuture && (
                        <td className="px-6 py-4 text-center">
                          {dealsCount > 0 ? (
                            <button
                              onClick={() => openDeals(m)}
                              className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                              {dealsCount}{quota > 0 && ` / ${quota}`}
                            </button>
                          ) : (
                            <span className="text-sm font-semibold text-gray-400">
                              0{quota > 0 && ` / ${quota}`}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {managers.length === 0 && (
              <div className="text-center py-12 text-gray-400">Нет менеджеров</div>
            )}
          </div>

          {/* ── Add manager — managers only ──────────────────── */}
          {role === "manager" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">Добавить менеджера</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Фамилия Имя"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManager()}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addManager}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Добавить
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ── Deals modal ─────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{modal.manager.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Сделки за {formatDate(selectedDate, { day: "numeric", month: "long" })}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {modalLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Загрузка...</div>
              ) : modal.deals.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Нет сделок</div>
              ) : (
                <ol className="space-y-3">
                  {modal.deals.map((deal, i) => (
                    <li key={deal.id} className="flex items-start gap-3">
                      <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                      <a
                        href={deal.dealLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline break-all leading-relaxed"
                      >
                        {dealLabel(deal.dealLink)}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {!modalLoading && modal.deals.length > 0 && (
              <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
                Всего сделок: {modal.deals.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
