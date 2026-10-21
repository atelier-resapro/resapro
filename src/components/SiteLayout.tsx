import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const SiteLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col">
    <header className="border-b bg-card">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="text-lg font-bold text-primary">
          RésaPro
        </Link>
        <Link to="/client" className="text-sm underline-offset-4 hover:underline">Espace client</Link>
      </div>
    </header>
    <main className="container max-w-2xl flex-1 py-6">{children}</main>
    <footer className="border-t py-4 text-center text-sm text-muted-foreground">
      <Link to="/gerant" className="underline-offset-4 hover:underline">
        Espace gérant
      </Link>
    </footer>
  </div>
);

export default SiteLayout;
