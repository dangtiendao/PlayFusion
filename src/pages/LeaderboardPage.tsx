export function LeaderboardPage() {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <span>🏆 Vinh Danh Cao Thủ</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Bảng Xếp Hạng
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          Theo dõi thứ hạng Elo và điểm thưởng của các kỳ thủ trên toàn hệ thống.
        </p>
      </section>

      {/* Placeholder Danh sách xếp hạng */}
      <section className="bg-surface dark:bg-surface-dark rounded-xl border border-surface-border dark:border-surface-dark-border p-6 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl">
          🥇
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Dữ liệu Bảng xếp hạng đang được đồng bộ
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Tính năng tính điểm xếp hạng theo từng game sẽ được kích hoạt tại các phase tiếp theo.
          </p>
        </div>
      </section>
    </div>
  );
}

export default LeaderboardPage;
