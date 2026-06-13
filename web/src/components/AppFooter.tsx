export default function AppFooter() {
  return (
    <footer className="mt-6 flex flex-col gap-2 border-t border-slate-200/80 pt-4 text-center text-xs text-slate-500 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:text-left">
      <p>© {new Date().getFullYear()} StockMate POS. All rights reserved.</p>
      <p>Version 1.0.0</p>
    </footer>
  );
}
