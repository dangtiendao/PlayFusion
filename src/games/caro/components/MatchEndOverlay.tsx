/**
 * ==============================================================================
 * MATCH END OVERLAY COMPONENT (MÀN HÌNH KẾT THÚC TRẬN ĐẤU CỜ CARO - P4.3c)
 * ==============================================================================
 *
 * ⚠️ NGUYÊN TẮC THIẾT KẾ & UX:
 * 1. Overlay phủ bán trong suốt (`backdrop-blur-sm bg-slate-950/75`):
 *    - Giữ bàn cờ mờ ở nền sau để người chơi quan sát được toàn cảnh thế cờ
 *      và chuỗi 5 quân thắng cuộc đang highlight.
 * 2. Xuất hiện có độ trễ nhẹ ~800ms (`DELAY_BEFORE_SHOW_MS = 800`):
 *    - Giúp người chơi có 0.8s chiêm ngưỡng nước cờ quyết định trên bàn trước khi overlay xuất hiện.
 * 3. Confetti CSS thuần nhẹ (~25 dòng):
 *    - Tự động bung pháo giấy khi người chơi chiến thắng hoặc THĂNG HẠNG, tự động tắt khi bật `prefers-reduced-motion`.
 * 4. Tỷ số phiên đấu (Session Score) & Thống kê tích lũy dài hạn (Accumulated Stats - P1.5a).
 * 5. Khối kết toán Xếp Hạng (Rank Settled Block - P4.3c):
 *    - Hiển thị biến động điểm số (+/- Elo) và thưởng xu (+ xu 🪙).
 *    - Animation nảy số counter mượt mà trong ~800ms (prefers-reduced-motion thì hiện thẳng).
 *    - Hiệu ứng THĂNG HẠNG (Rank Up): Banner rực rỡ, badge to, confetti, sfx/haptic chạy ĐÚNG 1 LẦN DUY NHẤT.
 *    - Thông điệp Khiên Bảo Vệ rớt hạng (Demotion Shield): Nhắc nhở người chơi thắng trận kế tiếp để giữ bậc.
 *    - Rớt hạng thật: Thông báo nhẹ nhàng, không âm thanh chói tai (tôn trọng cảm xúc người dùng).
 * ==============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import type { MatchResultReport } from '@engines/types';
import type { GameShellApi } from '../../types';
import type { CaroMatchConfig } from '../types';
import type { GameLocalStats } from '../../../core/gameLocalData';
import { getAiLevelLabel } from '../../labels';
import { RankBadge } from '@/components/rank/RankBadge';
import type { TierDef } from '@rating';

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

export interface MatchSettledData {
  /** Biến động điểm Elo (ví dụ +16, -16, 0) */
  readonly ratingDelta: number;
  /** Điểm Elo mới sau trận */
  readonly newRating: number;
  /** Điểm Elo cũ trước trận */
  readonly oldRating: number;
  /** Số xu nhận được */
  readonly coins: number;
  /** Đã đạt trần thưởng xu hôm nay chưa */
  readonly capped?: boolean;
  /** Bậc rank trước trận */
  readonly tierBefore: TierDef;
  /** Bậc rank sau trận */
  readonly tierAfter: TierDef;
  /** Hướng biến động rank ('up' | 'down' | 'same') */
  readonly rankChange: 'up' | 'down' | 'same';
  /** Có đang được bảo vệ bởi khiên rớt hạng hay không */
  readonly isShielded?: boolean;
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
  /** Lý do kết thúc ván đấu (P3.4c: normal | resign | timeout | abort) */
  readonly endReason?: 'normal' | 'resign' | 'timeout' | 'abort' | string;
  /** Dữ liệu kết toán xếp hạng từ broadcast match_settled (P4.3c) */
  readonly settledData?: MatchSettledData | null;
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
  endReason = 'normal',
  settledData,
  onRestart,
  onBackToSetup,
  onExit,
  shellApi,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // State animated rating counter (P4.3c)
  const [animatedRating, setAnimatedRating] = useState<number>(
    settledData ? settledData.oldRating : 0,
  );

  // Ref đảm bảo hiệu ứng Thăng Hạng chỉ chạy đúng 1 lần duy nhất
  const hasRankUpEffectPlayedRef = useRef<boolean>(false);

  const isVsAi = matchConfig.mode === 'vs_ai';
  const humanSeat = matchConfig.humanSeat ?? 0;

  // Xác định kết quả từ MatchResultReport
  const winParticipant = report.participants.find((p) => p.outcome === 'win');
  const isDraw = report.participants.every((p) => p.outcome === 'draw');
  const winnerSeat = winParticipant?.playerIndex ?? null;

  // Xác định trạng thái thắng / thua / hòa cho người chơi
  const isHumanWinner = winnerSeat === humanSeat;
  const isHumanLoser = winnerSeat !== null && winnerSeat !== humanSeat;

  // Hiệu ứng âm thanh và xuất hiện sau 800ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);

      // Kích hoạt âm thanh và haptics theo kết quả trận đấu
      if (isDraw || endReason === 'abort') {
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
  }, [isDraw, isHumanWinner, isHumanLoser, endReason, shellApi]);

  // Hiệu ứng nảy số điểm Elo (Counter Animation ~800ms)
  useEffect(() => {
    if (!settledData) return;

    // Kiểm tra prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAnimatedRating(settledData.newRating);
      return;
    }

    const startRating = settledData.oldRating;
    const targetRating = settledData.newRating;
    const durationMs = 800;
    const startTime = performance.now();

    let animationFrameId: number;

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Easing out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(startRating + (targetRating - startRating) * easeOut);
      setAnimatedRating(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [settledData]);

  // Hiệu ứng Thăng Hạng (chạy đúng 1 lần khi có rankUp)
  useEffect(() => {
    if (isVisible && settledData?.rankChange === 'up' && !hasRankUpEffectPlayedRef.current) {
      hasRankUpEffectPlayedRef.current = true;
      shellApi?.playSfx('success');
      shellApi?.hapticSuccess();
    }
  }, [isVisible, settledData, shellApi]);

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

  // Tiêu đề và icon chính theo endReason
  let title = 'VÁN ĐẤU HÒA!';
  let emoji = '🤝';
  let bannerColorClass = 'from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-300';

  if (endReason === 'abort') {
    title = 'VÁN ĐẤU BỊ HỦY!';
    emoji = '⚠️';
    bannerColorClass = 'from-amber-500/20 to-slate-800/40 border-amber-500/40 text-amber-300';
  } else if (endReason === 'resign') {
    if (isHumanWinner) {
      title = 'ĐỐI THỦ ĐÃ ĐẦU HÀNG! 🎉';
      emoji = '🏆';
      bannerColorClass =
        'from-emerald-500/20 to-cyan-500/10 border-emerald-500/40 text-emerald-300';
    } else {
      title = 'BẠN ĐÃ ĐẦU HÀNG!';
      emoji = '🏳️';
      bannerColorClass = 'from-rose-500/20 to-rose-600/10 border-rose-500/40 text-rose-300';
    }
  } else if (endReason === 'timeout') {
    if (isHumanWinner) {
      title = 'ĐỐI THỦ HẾT GIỜ! 🎉';
      emoji = '⏱️';
      bannerColorClass =
        'from-emerald-500/20 to-cyan-500/10 border-emerald-500/40 text-emerald-300';
    } else {
      title = 'BẠN THUA VÌ HẾT GIỜ!';
      emoji = '⌛';
      bannerColorClass = 'from-rose-500/20 to-rose-600/10 border-rose-500/40 text-rose-300';
    }
  } else if (!isDraw) {
    if (isVsAi || matchConfig.mode === 'online_1v1') {
      if (isHumanWinner) {
        title = 'BẠN THẮNG! 🎉';
        emoji = '🏆';
        bannerColorClass =
          'from-emerald-500/20 to-cyan-500/10 border-emerald-500/40 text-emerald-300';
      } else {
        title = 'BẠN THUA!';
        emoji = isVsAi ? '🤖' : '😢';
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
        HIỆU ỨNG PHÁO GIẤY CONFETTI (CSS THUẦN — KHI THẮNG HOẶC THĂNG HẠNG)
        ========================================================================
      */}
      {((isHumanWinner && !isDraw) || settledData?.rankChange === 'up') && (
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

        {/* 
          ======================================================================
          KHỐI KẾT TOÁN XẾP HẠNG & BIẾN ĐỘNG ĐIỂM (RANK SETTLED BLOCK - P4.3c)
          ======================================================================
        */}
        {settledData && endReason !== 'abort' && (
          <div
            data-testid="rank-settled-card"
            className="w-full p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-center shadow-inner"
          >
            {/* Trường hợp 1: THĂNG HẠNG (RANK UP) */}
            {settledData.rankChange === 'up' && (
              <div
                data-testid="rank-up-banner"
                className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-amber-400/50 text-amber-300 font-extrabold text-sm tracking-wide animate-pulse"
              >
                🌟 THĂNG HẠNG! 🌟
              </div>
            )}

            {/* Bậc Rank & Biến động điểm */}
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <RankBadge
                  tier={
                    settledData.rankChange === 'down' && settledData.isShielded
                      ? settledData.tierBefore
                      : settledData.tierAfter
                  }
                  size={settledData.rankChange === 'up' ? 'lg' : 'md'}
                  shield={settledData.rankChange === 'down' && !!settledData.isShielded}
                />
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    data-testid="rating-delta-text"
                    className={`font-black text-sm ${
                      settledData.ratingDelta > 0
                        ? 'text-emerald-400'
                        : settledData.ratingDelta < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {settledData.ratingDelta > 0
                      ? `+${settledData.ratingDelta}`
                      : settledData.ratingDelta}{' '}
                    điểm
                  </span>
                  {settledData.coins > 0 && (
                    <span
                      data-testid="coins-reward-text"
                      className="text-xs font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20"
                    >
                      +{settledData.coins} xu 🪙
                    </span>
                  )}
                  {settledData.capped && (
                    <span
                      data-testid="coins-capped-text"
                      className="text-[10px] font-semibold text-amber-300/90 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20"
                    >
                      Đã đạt trần hôm nay
                    </span>
                  )}
                </div>
                <div
                  data-testid="animated-rating-text"
                  className="text-[11px] text-slate-400 font-mono font-medium"
                >
                  {animatedRating} Elo
                </div>
              </div>
            </div>

            {/* Trường hợp 2: Có Khiên Bảo Vệ Rớt Hạng */}
            {settledData.rankChange === 'down' && settledData.isShielded && (
              <div
                data-testid="demotion-shield-message"
                className="py-1 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-medium"
              >
                🛡️ Được bảo vệ rớt hạng — thắng trận sau để giữ {settledData.tierBefore.name}!
              </div>
            )}

            {/* Trường hợp 3: Rớt hạng thật (Không rầm rộ, UX nhẹ nhàng) */}
            {settledData.rankChange === 'down' && !settledData.isShielded && (
              <div data-testid="demotion-message" className="text-[11px] text-slate-400 italic">
                Xuống hạng {settledData.tierAfter.name} — cố lên!
              </div>
            )}
          </div>
        )}

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
