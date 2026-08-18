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
 * 5. Khối Tiếp tục ván dở 💾 (P1.5b): Hiển thị nổi bật trên cùng nếu phát hiện có ván dở hợp lệ.
 * 6. Tính năng Chơi ngay ⚡: Hiển thị nút vào nhanh nếu có cấu hình gần nhất (`lastConfig`) hợp lệ.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { GameDefinition, AiLevel, PlayerIndex, GameMode } from '@engines/types';
import type { GameShellApi } from '../../types';
import type { CaroMatchConfig } from '../types';
import type { SavedMatch } from '../../../core/gameLocalData';
import { formatRelativeTime } from '../../../core/text';
import {
  getModeLabel,
  getModeDescription,
  getAiLevelLabel,
  getAiLevelDescription,
} from '../../labels';

export interface ModeSelectProps {
  /** Tờ khai năng lực của game chứa danh sách modes và aiLevels được hỗ trợ */
  readonly definition: GameDefinition;
  /** Ván đấu dở dang đã được auto-save (nếu có - P1.5b) */
  readonly savedMatch?: SavedMatch | null;
  /** Callback khôi phục ván đấu dở dang */
  readonly onResumeSavedMatch?: () => void;
  /** Callback hủy bỏ ván đấu dở dang */
  readonly onDiscardSavedMatch?: () => void;
  /** Cấu hình trận đấu gần nhất đã lưu trong Local Data (nếu có) */
  readonly lastConfig?: CaroMatchConfig | null;
  /** Callback bắt đầu ván đấu với cấu hình đã chọn */
  readonly onStart: (config: CaroMatchConfig) => void;
  /** Tiện ích âm thanh và xúc giác từ GameShell */
  readonly shellApi?: GameShellApi;
  /** Tùy biến CSS class bổ sung */
  readonly className?: string;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({
  definition,
  savedMatch,
  onResumeSavedMatch,
  onDiscardSavedMatch,
  lastConfig,
  onStart,
  shellApi,
  className = '',
}) => {
  // Lọc danh sách các mode offline được game Caro hỗ trợ
  const availableModes = useMemo(
    () =>
      definition.modes.filter(
        (m): m is 'vs_ai' | 'local_pvp' => m === 'vs_ai' || m === 'local_pvp',
      ),
    [definition.modes],
  );

  const availableAiLevels = useMemo(
    () => (definition.aiLevels ?? ['easy', 'medium', 'hard']) as AiLevel[],
    [definition.aiLevels],
  );

  // Kiểm tra xem lastConfig có hoàn toàn hợp lệ với manifest hiện tại hay không
  const isLastConfigValid = useMemo(() => {
    if (!lastConfig) return false;
    if (!availableModes.includes(lastConfig.mode)) return false;
    if (lastConfig.mode === 'vs_ai') {
      if (!lastConfig.aiLevel || !availableAiLevels.includes(lastConfig.aiLevel)) {
        return false;
      }
    }
    return true;
  }, [lastConfig, availableModes, availableAiLevels]);

  // Cấu hình của ván dở dang (nếu có)
  const savedConfig = savedMatch?.gameConfig as CaroMatchConfig | undefined;

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

      {/* 
        ========================================================================
        KHỐI TIẾP TỤC VÁN DỞ 💾 (NỔI BẬT TRÊN CÙNG KHI CÓ AUTO-SAVE - P1.5b)
        ========================================================================
      */}
      {savedMatch && onResumeSavedMatch && (
        <div
          data-testid="saved-match-card"
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-cyan-500/15 to-blue-500/15 border border-emerald-500/40 dark:border-emerald-400/40 shadow-lg shadow-emerald-500/10 space-y-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl animate-pulse">💾</span>
              <div>
                <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                  Tiếp tục ván dở
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    Đang chờ
                  </span>
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-200 font-medium">
                  {savedConfig?.mode === 'vs_ai'
                    ? `Đấu máy • ${getAiLevelLabel(savedConfig.aiLevel ?? 'easy')} • ${savedConfig.humanSeat === 1 ? 'Bạn cầm O (Đi sau)' : 'Bạn cầm X (Đi trước)'}`
                    : '2 người 1 máy (Đối kháng)'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Đã lưu: {formatRelativeTime(savedMatch.savedAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              data-testid="resume-saved-match-btn"
              onClick={() => {
                shellApi?.playSfx('click');
                shellApi?.hapticTap();
                onResumeSavedMatch();
              }}
              className="min-h-[44px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>▶️ Tiếp tục chơi</span>
            </button>

            <button
              type="button"
              data-testid="discard-saved-match-btn"
              onClick={() => {
                shellApi?.playSfx('click');
                shellApi?.hapticTap();
                onDiscardSavedMatch?.();
              }}
              className="min-h-[44px] py-2.5 px-3 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-500 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>🗑️ Bỏ ván này</span>
            </button>
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        NÚT CHƠI NGAY ⚡ (NẾU CÓ CẤU HÌNH GẦN NHẤT HỢP LỆ - P1.5a)
        ========================================================================
      */}
      {isLastConfigValid && lastConfig && !savedMatch && (
        <div className="w-full">
          <button
            type="button"
            data-testid="quick-play-btn"
            onClick={() => {
              shellApi?.playSfx('click');
              shellApi?.hapticTap();
              onStart(lastConfig);
            }}
            className="w-full min-h-[52px] p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-cyan-500/20 to-blue-500/20 hover:from-amber-500/30 hover:to-blue-500/30 border border-amber-500/40 dark:border-amber-400/40 text-slate-900 dark:text-white shadow-lg shadow-amber-500/10 active:scale-[0.98] transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3 text-left">
              <span className="text-xl group-hover:scale-110 transition-transform">⚡</span>
              <div>
                <div className="text-sm font-black flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
                  Chơi ngay
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    Gần nhất
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  {lastConfig.mode === 'vs_ai'
                    ? `Đấu máy • ${getAiLevelLabel(lastConfig.aiLevel ?? 'easy')} • ${lastConfig.humanSeat === 1 ? 'Bạn cầm O (Đi sau)' : 'Bạn cầm X (Đi trước)'}`
                    : '2 người 1 máy (Đối kháng)'}
                </p>
              </div>
            </div>
            <span className="text-slate-400 group-hover:text-amber-400 transition-colors text-sm font-bold">
              ▶
            </span>
          </button>
        </div>
      )}

      {/* 
        ========================================================================
        1. DANH SÁCH CHẾ ĐỘ CHƠI (TỰ ĐỘNG RENDER TỪ DEFINITION.MODES)
        ========================================================================
      */}
      <div className="w-full space-y-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 px-1">
          Chế độ chơi
        </span>
        <div className="grid grid-cols-1 gap-2.5">
          {availableModes.map((mode) => {
            const isSelected = selectedMode === mode;
            return (
              <button
                key={mode}
                type="button"
                data-testid={`mode-btn-${mode}`}
                onClick={() => handleSelectMode(mode)}
                className={`flex items-center justify-between w-full min-h-[52px] p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-900 dark:text-cyan-200 shadow-md shadow-cyan-500/10'
                    : 'bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="text-xl">{mode === 'vs_ai' ? '🤖' : '👥'}</span>
                  <div>
                    <h3 className="text-sm font-bold">{getModeLabel(mode as GameMode)}</h3>
                    <p className="text-xs opacity-75 font-normal">
                      {getModeDescription(mode as GameMode)}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    isSelected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-400'
                  }`}
                >
                  {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 
        ========================================================================
        2. TÙY CHỌN BỔ SUNG KHI CHỌN "ĐẤU MÁY" (VS_AI CONFIG PANEL)
        ========================================================================
      */}
      {selectedMode === 'vs_ai' && availableModes.includes('vs_ai') && (
        <div
          data-testid="vs-ai-config-panel"
          className="w-full space-y-4 pt-1 animate-fade-in border-t border-slate-200 dark:border-slate-800"
        >
          {/* Chọn Độ Khó của AI */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 px-1">
              Độ khó Bot AI
            </span>
            <div className="grid grid-cols-3 gap-2">
              {availableAiLevels.map((level) => {
                const isSelected = selectedAiLevel === level;
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
                    className={`flex flex-col items-center justify-center min-h-[52px] p-2 rounded-xl border text-center transition-all active:scale-95 ${
                      isSelected
                        ? level === 'hard'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300 font-bold shadow-sm'
                          : level === 'medium'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-sm'
                            : 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                        : 'bg-slate-100/60 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <span className="text-xs font-bold">{getAiLevelLabel(level)}</span>
                    <span className="text-[10px] opacity-75 mt-0.5 line-clamp-1">
                      {level === 'easy' ? 'Làm quen' : level === 'medium' ? 'Cân não' : 'Thử thách'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1 italic">
              💡 {getAiLevelDescription(selectedAiLevel)}
            </p>
          </div>

          {/* Chọn Bên (Quân X đi trước / Quân O đi sau) */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 px-1">
              Chọn lượt đi
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="seat-x-btn"
                onClick={() => {
                  shellApi?.playSfx('click');
                  shellApi?.hapticTap();
                  setSelectedHumanSeat(0);
                }}
                className={`flex items-center justify-center gap-2 min-h-[44px] p-2.5 rounded-xl border transition-all active:scale-95 ${
                  selectedHumanSeat === 0
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold shadow-sm'
                    : 'bg-slate-100/60 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-5 h-5 rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 flex items-center justify-center font-black text-xs">
                  X
                </span>
                <span className="text-xs">Đi trước (Bạn đi X)</span>
              </button>

              <button
                type="button"
                data-testid="seat-o-btn"
                onClick={() => {
                  shellApi?.playSfx('click');
                  shellApi?.hapticTap();
                  setSelectedHumanSeat(1);
                }}
                className={`flex items-center justify-center gap-2 min-h-[44px] p-2.5 rounded-xl border transition-all active:scale-95 ${
                  selectedHumanSeat === 1
                    ? 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300 font-bold shadow-sm'
                    : 'bg-slate-100/60 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-5 h-5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-300 flex items-center justify-center font-black text-xs">
                  O
                </span>
                <span className="text-xs">Đi sau (Máy đi X)</span>
              </button>
            </div>
          </div>

          {/* Nút Bắt Đầu Đấu Máy */}
          <div className="pt-2">
            <button
              type="button"
              data-testid="start-vs-ai-btn"
              onClick={handleStartVsAi}
              className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>⚔️ Bắt đầu đấu máy</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModeSelect;
