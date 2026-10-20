import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AccesRefuse from "@/components/AccesRefuse";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfil } from "@/hooks/useProfil";
import { useSession } from "@/hooks/useSession";

/**
 * Layout of the /employe pages.
 * Without a session, the visitor is sent to the login page; the manager is sent to their space.
 * This only shapes the pages: the database (RLS) is what actually protects the data.
 */
const EmployeLayout = () => {
  const { session, loading } = useSession();
  const profil = useProfil(session?.user.id);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deconnecter = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate("/gerant/connexion", { replace: true });
  };

  if (loading || (session && profil.isLoading)) {
    return <p className="p-6 text-muted-foreground">Chargement…</p>;
  }

  if (!session) {
    return <Navigate to="/gerant/connexion" replace state={{ from: location.pathname }} />;
  }

  if (profil.data === "gerant") {
    return <Navigate to="/gerant" replace />;
  }

  if (profil.data !== "employe") {
    return <AccesRefuse onDeconnecter={deconnecter} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-14 items-center justify-between gap-2">
          <Link to="/employe" className="font-bold text-primary">
            RésaPro <span className="font-normal text-muted-foreground">· Mon agenda</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={deconnecter}>
            Se déconnecter
          </Button>
        </div>
      </header>
      <main className="container max-w-3xl flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default EmployeLayout;
