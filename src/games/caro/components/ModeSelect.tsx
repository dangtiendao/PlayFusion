/**
 * ==============================================================================
 * CARO MODE SELECT COMPONENT (MÀN HÌNH CHỌN CHẾ ĐỘ CHƠI CỜ CARO)
 * ==============================================================================
 *
 * ⚠️ NGUYÊN TẮC THIẾT KẾ:
 * 1. Component hiển thị thuần (Pure UI) — chỉ nhận props, không import Engine/Store.
 * 2. Render động từ `GameDefinition` (tờ khai năng lực của game), tuyệt đối KHÔNG hard-code.
 * 3. Mobile-First: Các vùng chạm ≥44px, hỗ trợ hoàn hảo cả Dark Mode và Light Mode.
 * 4. Tương tác âm thanh & xúc giác ĐỀU thông qua `shellApi` được truyền từ View.
 */

import React, { useState, useCallback } from 'react';
import type { GameDefinition, AiLevel, PlayerIndex, GameMode } from '@engines/types';
import type { GameShellApi } from '../../types';
import type { CaroMatchConfig } from '../types';
import {
  getModeLabel,
  getModeDescription,
  getAiLevelLabel,
  getAiLevelDescription,
} from '../../labels';

export interface ModeSelectProps {
  /** Tờ khai năng lực của game chứa danh sách modes và aiLevels được hỗ trợ */
  readonly definition: GameDefinition;
  /** Callback bắt đầu ván đấu với cấu hình đã chọn */
  readonly onStart: (config: CaroMatchConfig) => void;
  /** Tiện ích âm thanh và xúc giác từ GameShell */
  readonly shellApi?: GameShellApi;
  /** Tùy biến CSS class bổ sung */
  readonly className?: string;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({
  definition,
  onStart,
  shellApi,
  className = '',
}) => {
  // Lọc danh sách các mode offline được game Caro hỗ trợ
  const availableModes = definition.modes.filter(
    (m): m is 'vs_ai' | 'local_pvp' => m === 'vs_ai' || m === 'local_pvp',
  );

  const availableAiLevels = (definition.aiLevels ?? ['easy', 'medium', 'hard']) as AiLevel[];

  // State cấu hình trước khi vào trận
  const [selectedMode, setSelectedMode] = useState<'vs_ai' | 'local_pvp'>(() => {
    return availableModes.includes('vs_ai') ? 'vs_ai' : (availableModes[0] ?? 'local_pvp');
  });

  const [selectedAiLevel, setSelectedAiLevel] = useState<AiLevel>(() => {
    return availableAiLevels.includes('medium') ? 'medium' : (availableAiLevels[0] ?? 'easy');
  });

  const [selectedHumanSeat, setSelectedHumanSeat] = useState<PlayerIndex>(0); // 0: X (Đi trước), 1: O (Đi sau)

  // Xử lý chọn chế độ
  const handleSelectMode = useCallback(
    (mode: 'vs_ai' | 'local_pvp') => {
      shellApi?.playSfx('click');
      shellApi?.hapticTap();

      if (mode === 'local_pvp') {
        // Chế độ 2 người 1 máy: Vào ván ngay
        onStart({ mode: 'local_pvp' });
      } else {
        setSelectedMode('vs_ai');
      }
    },
    [onStart, shellApi],
  );

  // Bắt đầu ván đấu với AI
  const handleStartVsAi = useCallback(() => {
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
    onStart({
      mode: 'vs_ai',
      aiLevel: selectedAiLevel,
      humanSeat: selectedHumanSeat,
    });
  }, [onStart, selectedAiLevel, selectedHumanSeat, shellApi]);

  return (
    <div
      data-testid="caro-mode-select"
      className={`flex flex-col items-center justify-center w-full max-w-md mx-auto p-4 sm:p-6 space-y-6 select-none animate-scale-in ${className}`}
    >
      {/* Header chào mừng & Tên trò chơi */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-2xl shadow-lg shadow-cyan-500/10 mb-1">
          ♟️
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {definition.name}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          Chọn chế độ chơi phù hợp để bắt đầu ván cờ
        </p>
      </div>

      {/* Danh sách các Chế độ chơi (Được render động từ definition.modes) */}
      <div className="w-full space-y-3" role="radiogroup" aria-label="Chọn chế độ chơi">
        {availableModes.map((mode: GameMode) => {
          const isVsAi = mode === 'vs_ai';
          const isSelected = selectedMode === mode;

          return (
            <button
              key={mode}
              type="button"
              data-testid={`mode-btn-${mode}`}
              onClick={() => handleSelectMode(mode as 'vs_ai' | 'local_pvp')}
              className={`w-full min-h-[64px] p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 active:scale-[0.98] ${
                isSelected && isVsAi
                  ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10 text-cyan-900 dark:text-cyan-100'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-cyan-400 dark:hover:border-cyan-600 text-slate-800 dark:text-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                    isSelected && isVsAi
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isVsAi ? '🤖' : '👥'}
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight">{getModeLabel(mode)}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {getModeDescription(mode)}
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0 text-slate-400 text-sm">
                {isVsAi ? (isSelected ? '⚙️' : '›') : '⚡'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Cấu hình nâng cao khi chọn Đấu máy (vs_ai) */}
      {selectedMode === 'vs_ai' && availableModes.includes('vs_ai') && (
        <div
          data-testid="vs-ai-config-panel"
          className="w-full p-4 sm:p-5 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm"
        >
          {/* 1. Chọn Cấp độ AI */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
              <span>Độ khó của máy</span>
              <span className="text-[11px] font-normal text-slate-500">
                {getAiLevelDescription(selectedAiLevel)}
              </span>
            </label>

            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Chọn cấp độ AI">
              {availableAiLevels.map((level) => {
                const isLevelSelected = selectedAiLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    data-testid={`ai-level-btn-${level}`}
                    onClick={() => {
                      shellApi?.playSfx('click');
                      shellApi?.hapticTap();
                      setSelectedAiLevel(level);
                    }}
                    className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                      isLevelSelected
                        ? level === 'easy'
                          ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-500/20'
                          : level === 'medium'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/20'
                            : 'bg-rose-500 text-white border-rose-600 shadow-sm shadow-rose-500/20'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {getAiLevelLabel(level)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Chọn Phe / Lượt đi */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Chọn quân & Lượt đánh
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Đi trước: Quân X */}
              <button
                type="button"
                data-testid="seat-x-btn"
                onClick={() => {
                  shellApi?.playSfx('click');
                  shellApi?.hapticTap();
                  setSelectedHumanSeat(0);
                }}
                className={`min-h-[48px] p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all active:scale-95 ${
                  selectedHumanSeat === 0
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 dark:text-cyan-300 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-5 h-5 rounded-md bg-cyan-500/30 text-cyan-400 flex items-center justify-center font-black text-xs">
                  X
                </span>
                <span>Đi trước (Bạn đi X)</span>
              </button>

              {/* Đi sau: Quân O */}
              <button
                type="button"
                data-testid="seat-o-btn"
                onClick={() => {
                  shellApi?.playSfx('click');
                  shellApi?.hapticTap();
                  setSelectedHumanSeat(1);
                }}
                className={`min-h-[48px] p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all active:scale-95 ${
                  selectedHumanSeat === 1
                    ? 'bg-rose-500/20 border-rose-500 text-rose-400 dark:text-rose-300 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-5 h-5 rounded-md bg-rose-500/30 text-rose-400 flex items-center justify-center font-black text-xs">
                  O
                </span>
                <span>Đi sau (Máy đi X)</span>
              </button>
            </div>
          </div>

          {/* Nút Bắt đầu ván đấu với AI */}
          <button
            type="button"
            data-testid="start-vs-ai-btn"
            onClick={handleStartVsAi}
            className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>⚔️ Bắt đầu đấu máy</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ModeSelect;
