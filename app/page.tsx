"use client";

import { useEffect, useState, useCallback } from "react";

type Manager = {
  id: string;
  name: string;
  position: number;
  quotas: { quota: number }[];
  deals: { id: string }[];
};

export default function Home() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split("T")[0];

  const fetchManagers = useCallback(async () => {
    const res = await fetch("/api/managers");
    setManagers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Загрузка...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Распределение сделок</h1>
        <p className="text-sm text-gray-500 mb-8">
          {new Date().toLocaleDateString("ru-RU", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

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
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-sm font-semibold ${
                          dealsCount > 0 ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        {dealsCount}
                        {quota > 0 && ` / ${quota}`}
                      </span>
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
      </div>
    </main>
  );
}
