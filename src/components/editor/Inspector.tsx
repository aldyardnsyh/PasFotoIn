"use client";

import { useState } from "react";
import { Crop, Download, Palette, SlidersHorizontal } from "lucide-react";
import RatioPicker from "./RatioPicker";
import BackgroundPicker from "./BackgroundPicker";
import ExportTab from "./ExportTab";
import TransformPanel from "./TransformPanel";
import AdjustPanel from "./AdjustPanel";
import FrameSheetPanel from "./FrameSheetPanel";
import HistogramPanel from "./HistogramPanel";
import EnhancePanel from "./EnhancePanel";

const TABS = [
  { id: "Rasio", icon: Crop },
  { id: "Latar", icon: Palette },
  { id: "Sesuaikan", icon: SlidersHorizontal },
  { id: "Ekspor", icon: Download },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Inspector() {
  const [tab, setTab] = useState<TabId>("Rasio");
  return (
    <aside className="flex h-full w-full flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-2.5">
        <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-gray-100 p-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-1 py-2 text-[11.5px] transition-colors ${
                  active ? "bg-white font-semibold text-primary-600 shadow-xs" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} aria-hidden />
                {t.id}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "Rasio" && (
          <>
            <RatioPicker />
            <div className="border-t border-gray-100">
              <TransformPanel />
            </div>
            <div className="border-t border-gray-100">
              <FrameSheetPanel />
            </div>
          </>
        )}
        {tab === "Latar" && <BackgroundPicker />}
        {tab === "Sesuaikan" && (
          <>
            <AdjustPanel />
            <HistogramPanel />
            <EnhancePanel />
          </>
        )}
        {tab === "Ekspor" && <ExportTab />}
      </div>
    </aside>
  );
}
