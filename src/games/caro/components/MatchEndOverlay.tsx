/**
 * ==============================================================================
 * MATCH END OVERLAY COMPONENT (MÀN HÌNH KẾT THÚC TRẬN ĐẤU CỜ CARO)
 * ==============================================================================
 *
 * ⚠️ NGUYÊN TẮC THIẾT KẾ & UX:
 * 1. Overlay phủ bán trong suốt (`backdrop-blur-sm bg-slate-950/75`):
 *    - Giữ bàn cờ mờ ở nền sau để người chơi quan sát được toàn cảnh thế cờ
 *      và chuỗi 5 quân thắng cuộc đang highlight.
 * 2. Xuất hiện có độ trễ nhẹ ~800ms (`DELAY_BEFORE_SHOW_MS = 800`):
 *    - Giúp người chơi có 0.8s chiêm ngưỡng nước cờ quyết định trên bàn trước khi overlay xuất hiện.
 * 3. Confetti CSS thuần nhẹ (~25 dòng):
 *    - Tự động bung pháo giấy khi người chơi chiến thắng, tự động tắt khi bật `prefers-reduced-motion`.
 * 4. Tỷ số phiên đấu (Session Score) & Thống kê tích lũy dài hạn (Accumulated Stats - P1.5a).
 */

import React, { useState, useEffect } from 'react';
import type { MatchResultReport } from '@engines/types';
import type { GameShellApi } from '../../types';
import type { CaroMatchConfig } from '../types';
import type { GameLocalStats } from '../../../core/gameLocalData';
import { getAiLevelLabel } from '../../labels';

export interface SessionScore {
  /** Số trận thắng của Người chơi 1 (hoặc Bạn khi đấu AI) */
  readonly player1Wins: number;
  /** Số trận thắng của Người chơi 2 (hoặc Máy khi đấu AI) */
  readonly player2Wins: number;
  /** Số trận hòa */
  readonly draws: number;
  /** Thứ tự ván đấu hiện tại trong phiên (1, 2, 3...) */
  readonly matchNumber: number;
}

export interface MatchEndOverlayProps {
  /** Báo cáo kết quả trận đấu chuẩn MatchResultReport */
  readonly report: MatchResultReport;
  /** Cấu hình trận đấu vừa diễn ra */
  readonly matchConfig: CaroMatchConfig;
  /** Tổng số nước đi trong ván */
  readonly moveCount: number;
  /** Tỷ số và thống kê phiên chơi hiện tại (in-memory) */
  readonly sessionScore?: SessionScore;
  /** Thống kê tích lũy toàn cục lưu trong Local Data (P1.5a) */
  readonly accumulatedStats?: GameLocalStats | null;
  /** Callback chơi lại ván mới (kèm đảo lượt đi trước) */
  readonly onRestart: () => void;
  /** Callback quay lại màn hình chọn chế độ */
  readonly onBackToSetup: () => void;
  /** Callback thoát trò chơi về Sảnh Menu */
  readonly onExit?: () => void;
  /** Tiện ích âm thanh và xúc giác từ GameShell */
  readonly shellApi?: GameShellApi;
  /** Class CSS tùy biến */
  readonly className?: string;
}

/** Độ trễ trước khi overlay xuất hiện để người chơi kịp thấy chuỗi thắng trên bàn cờ */
const DELAY_BEFORE_SHOW_MS = 800;

export const MatchEndOverlay: React.FC<MatchEndOverlayProps> = ({
  report,
  matchConfig,
  moveCount,
  sessionScore,
  accumulatedStats,
  onRestart,
  onBackToSetup,
  onExit,
  shellApi,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const isVsAi = matchConfig.mode === 'vs_ai';
  const humanSeat = matchConfig.humanSeat ?? 0;

  // Xác định kết quả từ MatchResultReport
  const winParticipant = report.participants.find((p) => p.outcome === 'win');
  const isDraw = report.participants.every((p) => p.outcome === 'draw');
  const winnerSeat = winParticipant?.playerIndex ?? null;

  // Xác định trạng thái thắng / thua / hòa cho người chơi
  const isHumanWinner = isVsAi ? winnerSeat === humanSeat : winnerSeat !== null;
  const isHumanLoser = isVsAi && winnerSeat !== null && winnerSeat !== humanSeat;

  // Hiệu ứng âm thanh và xuất hiện sau 800ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);

      // Kích hoạt âm thanh và haptics theo kết quả trận đấu
      if (isDraw) {
        shellApi?.playSfx('click');
      } else if (isHumanWinner) {
        shellApi?.playSfx('success');
        shellApi?.hapticSuccess();
      } else if (isHumanLoser) {
        shellApi?.playSfx('error');
        shellApi?.hapticError();
      }
    }, DELAY_BEFORE_SHOW_MS);

    return () => clearTimeout(timer);
  }, [isDraw, isHumanWinner, isHumanLoser, shellApi]);

  if (!isVisible) {
    return null;
  }

  // Định dạng thời gian thi đấu (mm:ss)
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.max(1, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Tiêu đề và icon chính
  let title = 'VÁN ĐẤU HÒA!';
  let emoji = '🤝';
  let bannerColorClass = 'from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-300';

  if (!isDraw) {
    if (isVsAi) {
      if (isHumanWinner) {
        title = 'BẠN THẮNG! 🎉';
        emoji = '🏆';
        bannerColorClass =
          'from-emerald-500/20 to-cyan-500/10 border-emerald-500/40 text-emerald-300';
      } else {
        title = 'BẠN THUA!';
        emoji = '🤖';
        bannerColorClass = 'from-rose-500/20 to-rose-600/10 border-rose-500/40 text-rose-300';
      }
    } else {
      title = winnerSeat === 0 ? 'QUÂN X THẮNG! 🎉' : 'QUÂN O THẮNG! 🎉';
      emoji = '🏆';
      bannerColorClass =
        winnerSeat === 0
          ? 'from-cyan-500/20 to-blue-500/10 border-cyan-500/40 text-cyan-300'
          : 'from-rose-500/20 to-pink-500/10 border-rose-500/40 text-rose-300';
    }
  }

  // Thống kê phân nhóm theo chế độ hiện tại
  const currentModeKey = isVsAi ? `vs_ai:${matchConfig.aiLevel ?? 'easy'}` : 'local_pvp';
  const currentModeStats = accumulatedStats?.byMode[currentModeKey];

  return (
    <div
      data-testid="match-end-overlay"
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in ${className}`}
    >
      {/* 
        ========================================================================
        HIỆU ỨNG PHÁO GIẤY CONFETTI (CSS THUẦN — TẮT KHI REDUCED-MOTION)
        ========================================================================
      */}
      {isHumanWinner && !isDraw && (
        <div
          data-testid="confetti-container"
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none overflow-hidden motion-reduce:hidden"
        >
          {Array.from({ length: 24 }).map((_, i) => {
            const colors = ['#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#a855f7'];
            const color = colors[i % colors.length];
            const left = `${(i * 4.3 + 2) % 96}%`;
            const delay = `${(i * 0.12).toFixed(2)}s`;
            const size = i % 2 === 0 ? 'w-2 h-3' : 'w-2.5 h-2.5 rounded-full';

            return (
              <span
                key={i}
                className={`absolute top-0 animate-bounce motion-reduce:animate-none opacity-80 ${size}`}
                style={{
                  left,
                  backgroundColor: color,
                  animationDelay: delay,
                  animationDuration: '1.4s',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Card Trung Tâm Kết Quả */}
      <div
        data-testid="match-end-card"
        className={`relative w-full max-w-sm rounded-3xl bg-slate-900 border p-5 sm:p-6 shadow-2xl space-y-4 text-center animate-scale-in bg-gradient-to-b ${bannerColorClass}`}
      >
        {/* Icon & Tiêu đề */}
        <div className="space-y-2">
          <div className="text-4xl sm:text-5xl animate-bounce motion-reduce:animate-none">
            {emoji}
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">{title}</h2>

          {/* Dòng phụ: Mode, Mức AI, Số nước, Thời lượng */}
          <p className="text-xs text-slate-300 flex items-center justify-center gap-2 flex-wrap">
            {isVsAi && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-semibold">
                Máy {getAiLevelLabel(matchConfig.aiLevel ?? 'easy')}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-semibold">
              {moveCount} nước
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-semibold">
              ⏱️ {formatDuration(report.durationMs)}
            </span>
          </p>
        </div>

        {/* Bảng Tỷ Số Phiên (Session Score) */}
        {sessionScore && (
          <div
            data-testid="session-score-card"
            className="w-full py-2 px-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-xs flex items-center justify-between"
          >
            <span className="text-slate-400 font-medium">
              Ván {sessionScore.matchNumber} trong phiên
            </span>
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="text-cyan-400">
                {isVsAi ? `Bạn ${sessionScore.player1Wins}` : `X: ${sessionScore.player1Wins}`}
              </span>
              <span className="text-slate-500">-</span>
              <span className="text-rose-400">
                {isVsAi ? `Máy ${sessionScore.player2Wins}` : `O: ${sessionScore.player2Wins}`}
              </span>
              {sessionScore.draws > 0 && (
                <span className="text-slate-400 text-[11px] font-normal">
                  ({sessionScore.draws} hòa)
                </span>
              )}
            </div>
          </div>
        )}

        {/* 
          ======================================================================
          TỔNG TÍCH LŨY DÀI HẠN (ACCUMULATED STATS - P1.5a)
          ======================================================================
        */}
        {accumulatedStats && (
          <div
            data-testid="accumulated-stats-card"
            className="w-full py-1.5 px-3 rounded-xl bg-slate-950/50 border border-slate-800/60 text-[11px] text-slate-300 text-center"
          >
            {isVsAi ? (
              <span>
                📊 Tổng: <strong>{currentModeStats?.wins ?? 0}</strong> thắng •{' '}
                <strong>{currentModeStats?.losses ?? 0}</strong> thua •{' '}
                <strong>{currentModeStats?.draws ?? 0}</strong> hòa
                {accumulatedStats.currentStreak > 1 && (
                  <span className="ml-1.5 text-amber-300 font-bold">
                    (Chuỗi {accumulatedStats.currentStreak} 🔥)
                  </span>
                )}
              </span>
            ) : (
              <span>
                📊 Tổng số ván 2 người: <strong>{currentModeStats?.matches ?? 0}</strong> ván
              </span>
            )}
          </div>
        )}

        {/* Danh sách 3 Nút Hành Động */}
        <div className="space-y-2.5 pt-1">
          {/* Nút 1: Chơi lại (Kèm luật đổi bên đi trước) */}
          <button
            type="button"
            data-testid="overlay-restart-btn"
            onClick={() => {
              shellApi?.playSfx('click');
              shellApi?.hapticTap();
              onRestart();
            }}
            className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>⚔️ Chơi lại (Đổi lượt đi)</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Nút 2: Đổi chế độ */}
            <button
              type="button"
              data-testid="overlay-setup-btn"
              onClick={() => {
                shellApi?.playSfx('click');
                shellApi?.hapticTap();
                onBackToSetup();
              }}
              className="min-h-[44px] py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs active:scale-95 transition-all"
            >
              ⚙️ Đổi chế độ
            </button>

            {/* Nút 3: Thoát */}
            <button
              type="button"
              data-testid="overlay-exit-btn"
              onClick={() => {
                shellApi?.playSfx('click');
                shellApi?.hapticTap();
                if (onExit) {
                  onExit();
                } else {
                  onBackToSetup();
                }
              }}
              className="min-h-[44px] py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-slate-400 hover:text-slate-200 font-bold text-xs active:scale-95 transition-all"
            >
              🚪 Thoát
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchEndOverlay;
