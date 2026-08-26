/**
 * ==============================================================================
 * TRANG VÍ CỦA TÔI & ĐIỂM DANH HÀNG NGÀY (SRC/PAGES/WALLETPAGE.TSX)
 * ==============================================================================
 *
 * MỤC TIÊU & BỐ CỤC:
 * 1. KHỐI 1 (HERO SỐ DƯ):
 *    - Hiển thị số dư xu to rõ ràng, dòng mô tả quản lý kỳ vọng (xu dùng mua trang trí).
 * 2. KHỐI 2 (ĐIỂM DANH 1 CHẠM):
 *    - Nút điểm danh nhận xu mỗi ngày (giá trị từ config), sfx/haptics và hiệu ứng hoàn tất.
 * 3. KHỐI 3 (BẢNG LUẬT THƯỞNG):
 *    - Accordion hiển thị bảng tỷ lệ thưởng và cơ chế chống farm (từ system_config).
 * 4. KHỐI 4 (LỊCH SỬ GIAO DỊCH SỔ CÁI):
 *    - Danh sách giao dịch keyset pagination kèm nhãn rõ ràng.
 * 5. OFFLINE-FIRST:
 *    - Xử lý lỗi mạng nhẹ nhàng với nút Thử lại, không crash ứng dụng.
 * ==============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  walletRepository,
  type WalletTxn,
  type WalletTxnCursor,
  type WalletRewardConfigs,
} from '@/repositories/walletRepository';
import { DailyBonusCard } from '@/components/wallet/DailyBonusCard';
import { RewardRulesCard } from '@/components/wallet/RewardRulesCard';
import { WalletHistoryList } from '@/components/wallet/WalletHistoryList';
import { audioManager } from '@/core/audio';
import { hapticSuccess, hapticTap } from '@/core/haptics';

const DEFAULT_REWARD_CONFIGS: WalletRewardConfigs = {
  winRanked: 50,
  lossRanked: 5,
  drawRanked: 20,
  dailyCap: 500,
  dailyLogin: 20,
  abandonPenalty: -20,
};

export const WalletPage: React.FC = () => {
  const navigate = useNavigate();

  // Trạng thái dữ liệu
  const [balance, setBalance] = useState<number>(0);
  const [alreadyClaimed, setAlreadyClaimed] = useState<boolean>(false);
  const [rewardConfigs, setRewardConfigs] = useState<WalletRewardConfigs>(DEFAULT_REWARD_CONFIGS);
  const [transactions, setTransactions] = useState<readonly WalletTxn[]>([]);
  const [nextCursor, setNextCursor] = useState<WalletTxnCursor | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  // Trạng thái tải
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [isClaimSuccess, setIsClaimSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Tải toàn bộ dữ liệu ban đầu của ví
  const loadWalletData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [bal, status, configs, txnPage] = await Promise.all([
        walletRepository.getMyBalance(true),
        walletRepository.getDailyBonusStatus(),
        walletRepository.getRewardConfigs().catch(() => DEFAULT_REWARD_CONFIGS),
        walletRepository.getMyTransactions(null, 30).catch(() => ({
          entries: [],
          nextCursor: null,
          hasMore: false,
        })),
      ]);

      setBalance(bal);
      setAlreadyClaimed(status);
      setRewardConfigs(configs);
      setTransactions(txnPage.entries);
      setNextCursor(txnPage.nextCursor);
      setHasMore(txnPage.hasMore);
    } catch (err: unknown) {
      setErrorMessage((err as Error)?.message || 'Không thể tải dữ liệu ví. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWalletData();
  }, [loadWalletData]);

  // Tải thêm giao dịch cũ hơn (Keyset pagination)
  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || !nextCursor) return;

    setIsLoadingMore(true);
    try {
      const page = await walletRepository.getMyTransactions(nextCursor, 30);
      setTransactions((prev) => [...prev, ...page.entries]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err: unknown) {
      showToast((err as Error)?.message || 'Không thể tải thêm giao dịch.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Xử lý điểm danh 1 chạm
  const handleClaimDaily = async () => {
    if (isClaiming || alreadyClaimed) return;

    hapticTap();
    setIsClaiming(true);

    try {
      const res = await walletRepository.claimDailyBonus();

      if (res.claimed) {
        setBalance(res.balance);
        setAlreadyClaimed(true);
        setIsClaimSuccess(true);

        audioManager.playSfx('success');
        hapticSuccess();
        showToast(`🎉 Nhận thành công +${res.coins ?? rewardConfigs.dailyLogin} xu điểm danh!`);

        // Tải lại lịch sử để cập nhật dòng giao dịch mới
        const txnPage = await walletRepository.getMyTransactions(null, 30).catch(() => null);
        if (txnPage) {
          setTransactions(txnPage.entries);
          setNextCursor(txnPage.nextCursor);
          setHasMore(txnPage.hasMore);
        }
      } else if (res.already) {
        setBalance(res.balance);
        setAlreadyClaimed(true);
        showToast('Bạn đã điểm danh hôm nay rồi!');
      }
    } catch (err: unknown) {
      showToast((err as Error)?.message || 'Lỗi khi điểm danh. Vui lòng thử lại.');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div
      data-testid="wallet-page"
      className="min-h-screen bg-slate-950 text-slate-100 pb-20 pt-4 px-4 sm:px-6"
    >
      <div className="max-w-xl mx-auto space-y-4">
        {/* THANH TIÊU ĐỀ & NÚT QUAY LẠI */}
        <div className="flex items-center justify-between py-2">
          <button
            type="button"
            data-testid="wallet-back-btn"
            onClick={() => {
              hapticTap();
              navigate(-1);
            }}
            className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 transition-colors flex items-center justify-center gap-1.5 text-sm font-semibold"
          >
            <span>←</span>
            <span>Trang trước</span>
          </button>

          <h1 className="text-base font-bold text-slate-100">Ví Của Tôi</h1>

          <div className="w-11" />
        </div>

        {/* TOAST THÔNG BÁO */}
        {toastMessage && (
          <div
            data-testid="wallet-toast"
            className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 text-xs font-semibold text-center shadow-lg animate-fade-in"
          >
            {toastMessage}
          </div>
        )}

        {/* KHỐI BÁO LỖI VÀ NÚT THỬ LẠI */}
        {errorMessage && (
          <div
            data-testid="wallet-error-banner"
            className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-2"
          >
            <p className="text-xs text-rose-300">{errorMessage}</p>
            <button
              type="button"
              data-testid="wallet-retry-btn"
              onClick={loadWalletData}
              className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* ==================================================================== */}
        {/* KHỐI 1: HERO SỐ DƯ VÍ                                               */}
        {/* ==================================================================== */}
        <div
          data-testid="wallet-hero-card"
          className="w-full p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-amber-950/20 border border-slate-800 text-center space-y-2 shadow-xl relative overflow-hidden"
        >
          <div className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
            <span>🪙</span>
            <span>Số dư khả dụng</span>
          </div>

          <div
            data-testid="wallet-balance-amount"
            className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 font-mono tracking-tight"
          >
            {isLoading ? '...' : balance.toLocaleString('vi-VN')}
            <span className="text-lg sm:text-xl font-bold text-amber-300 ml-1.5">xu</span>
          </div>

          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed pt-1">
            Xu dùng để mua vật phẩm trang trí bàn cờ, quân cờ và khung avatar trong cửa hàng.
          </p>
        </div>

        {/* ==================================================================== */}
        {/* KHỐI 2: ĐIỂM DANH HÀNG NGÀY                                         */}
        {/* ==================================================================== */}
        <DailyBonusCard
          alreadyClaimed={alreadyClaimed}
          dailyCoins={rewardConfigs.dailyLogin}
          isClaiming={isClaiming}
          isSuccess={isClaimSuccess}
          onClaim={handleClaimDaily}
        />

        {/* ==================================================================== */}
        {/* KHỐI 3: QUY TẮC THƯỞNG XU (COLLAPSIBLE)                             */}
        {/* ==================================================================== */}
        <RewardRulesCard configs={rewardConfigs} />

        {/* ==================================================================== */}
        {/* KHỐI 4: LỊCH SỬ GIAO DỊCH SỔ CÁI                                    */}
        {/* ==================================================================== */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Lịch sử giao dịch
            </h3>
            {transactions.length > 0 && (
              <span className="text-[11px] text-slate-400 font-medium">
                {transactions.length} giao dịch gần nhất
              </span>
            )}
          </div>

          <WalletHistoryList
            transactions={transactions}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </div>
  );
};

export default WalletPage;
