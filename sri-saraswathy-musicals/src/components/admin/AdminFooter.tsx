export function AdminFooter() {
  return (
    <footer className="border-t border-ink-100 bg-ivory-50 px-4 py-4 md:px-6">
      <div className="flex flex-col items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400 md:flex-row">
        <p>© 2026 All rights reserved. Sri Saraswathy Musicals.</p>
        <p>
          Powered by{" "}
          <a
            href="https://www.cenexasystems.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-ink-600 transition-colors hover:text-gold-600"
          >
            Cenexa Systems
          </a>{" "}
          ©2026
        </p>
        <p className="font-serif italic text-gold-600">· Fine Instruments · Since 1978</p>
      </div>
    </footer>
  );
}
