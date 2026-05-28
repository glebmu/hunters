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

/** Extract numeric deal ID from any input format, then build canonical URL.
 *  Handles: "32529726", "#32529726", full URL, URL with query params, etc.
 */
function normalizeDealLink(input: string): string {
  const trimmed = input.trim();

  // 1. Try to extract ID from a URL path: /leads/detail/NNNNN
  const pathMatch = trimmed.match(/\/leads\/detail\/(\d+)/);
  if (pathMatch) return AMO_BASE + pathMatch[1];

  // 2. Strip leading non-digit characters (#, spaces, etc.) and take the number
  const numberMatch = trimmed.match(/(\d+)/);
  if (numberMatch) return AMO_BASE + numberMatch[1];

  // 3. Fallback: use as-is
  return trimmed;
}

export default function Home() {
  const [role, setRole] = useState<Role | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  const [managers, setManagers] = useState<Manager[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ manager: Manager; deals: Deal[] } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const [dealInput, setDealInput] = useState("");
  const [dealResult, setDealResult] = useState<DealResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const fetchManagers = useCallback(async () => {
    const res = await fetch("/api/managers");
    setManagers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
        setDealResult({
          type: "error",
          title: "Ошибка",
          text: data.error ?? "Не удалось обработать сделку",
        });
      } else if (data.existing) {
        const assignedDate = data.assignedDate
          ? new Date(data.assignedDate).toISOString().split("T")[0]
          : null;
        const isToday = assignedDate === today;
        const dateLabel = assignedDate
          ? new Date(assignedDate).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
            })
          : null;
        setDealResult({
          type: "existing",
          title: "Уже есть",
          text: isToday
            ? `Сделка уже была назначена на ${data.manager}`
            : `Сделка уже была назначена на ${data.manager} (${dateLabel})`,
        });
      } else {
        setDealResult({
          type: "new",
          title: "Сделка добавлена",
          text: `На сделку назначен менеджер ${data.manager}`,
        });
        setDealInput("");
        fetchManagers();
      }
    } catch {
      setDealResult({ type: "error", title: "Ошибка", text: "Нет связи с сервером" });
    } finally {
      setProcessing(false);
    }
  }

  async function openDeals(manager: Manager) {
    if (manager.deals.length === 0) return;
    setModalLoading(true);
    setModal({ manager, deals: [] });
    const res = await fetch(`/api/deals?managerId=${manager.id}&date=${today}`);
    const deals: Deal[] = await res.json();
    setModal({ manager, deals });
    setModalLoading(false);
  }

  async function addManager() {
    if (!newName.trim()) return;
    await fetch("/api/managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    fetchManagers();
  }

  async function updateQuota(managerId: string, quota: number) {
    await fetch("/api/quotas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId, date: today, quota }),
    });
    fetchManagers();
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

  function submitCode() {
    const code = codeInput.trim().toLowerCase();
    if (code === "manager") {
      setRole("manager");
    } else if (code.length > 0) {
      setRole("user");
    } else {
      setCodeError(true);
    }
  }

  // ── Gate screen ──────────────────────────────────────────────
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
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                codeError ? "border-red-400" : "border-gray-300"
              }`}
            />
            {codeError && (
              <p className="text-xs text-red-500">Введите кодовое слово</p>
            )}
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
  // ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Загрузка...
      </div>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">

          {/* Header row */}
          <div className="flex items-center justify-between gap-4 mb-2">
            <h1 className="text-2xl font-bold text-gray-900 shrink-0">
              Распределение сделок
            </h1>
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <input
                type="text"
                placeholder="ID или ссылка на сделку"
                value={dealInput}
                onChange={(e) => {
                  setDealInput(e.target.value);
                  setDealResult(null);
                }}
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

          {/* Date */}
          <p className="text-sm text-gray-500 mb-4">
            {new Date().toLocaleDateString("ru-RU", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>

          {/* Result notification */}
          {dealResult && (
            <div
              className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-3 mb-5 ${resultColors[dealResult.type]}`}
            >
              <div>
                <p className="text-sm font-semibold">{dealResult.title}</p>
                <p className="text-sm mt-0.5">{dealResult.text}</p>
              </div>
              <button
                onClick={() => setDealResult(null)}
                className="mt-0.5 opacity-60 hover:opacity-100 transition-opacity shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Managers table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                    #
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Менеджер
                  </th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Норма на сегодня
                  </th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Сделок сегодня
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {managers.map((m) => {
                  const quota = m.quotas[0]?.quota ?? 0;
                  const dealsCount = m.deals.length;
                  const isActive = quota > 0 && dealsCount < quota;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-400">{m.position}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{m.name}</span>
                          {isActive && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              активен
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {role === "manager" ? (
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={quota}
                            onChange={(e) =>
                              updateQuota(m.id, parseInt(e.target.value) || 0)
                            }
                            className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-700">{quota || "—"}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {dealsCount > 0 ? (
                          <button
                            onClick={() => openDeals(m)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          >
                            {dealsCount}
                            {quota > 0 && ` / ${quota}`}
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-gray-400">
                            0{quota > 0 && ` / ${quota}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {managers.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                Нет менеджеров. Добавьте первого ниже.
              </div>
            )}
          </div>

          {/* Add manager — managers only */}
          {role === "manager" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">
                Добавить менеджера
              </h2>
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

      {/* Deals modal */}
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
                <h2 className="text-base font-semibold text-gray-900">
                  {modal.manager.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Сделки на сегодня</p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {modalLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                  Загрузка...
                </div>
              ) : modal.deals.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Нет сделок</div>
              ) : (
                <ol className="space-y-3">
                  {modal.deals.map((deal, i) => (
                    <li key={deal.id} className="flex items-start gap-3">
                      <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold flex items-center justify-center">
                        {i + 1}
                      </span>
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
