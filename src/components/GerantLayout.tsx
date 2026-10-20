import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

const liens = [{ to: "/gerant", label: "Planning", end: true }];

/**
 * Layout of every /gerant/* page except the login.
 * Without a session, the visitor is sent to the login page.
 */
const GerantLayout = () => {
  const { session, loading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (loading) {
    return <p className="p-6 text-muted-foreground">Chargement…</p>;
  }

  if (!session) {
    return <Navigate to="/gerant/connexion" replace state={{ from: location.pathname }} />;
  }

  const deconnecter = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate("/gerant/connexion", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-14 items-center justify-between gap-2">
          <Link to="/gerant" className="font-bold text-primary">
            RésaPro <span className="font-normal text-muted-foreground">· Gérant</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={deconnecter}>
            Se déconnecter
          </Button>
        </div>
        <nav aria-label="Navigation gérant" className="container flex gap-1 overflow-x-auto pb-2">
          {liens.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container max-w-3xl flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default GerantLayout;
